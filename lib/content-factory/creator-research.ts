import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreatorProfile, CreatorSource, Database } from "@/types/database";
import { getDeepseekApiKey, getDeepseekModel } from "@/lib/env-deepseek";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { assertSafePublicHttpUrl, fetchPublicTextSnippet } from "@/lib/content-factory/safe-fetch";
import { isMissingRelationError } from "@/lib/schema-guard";
import type { YoutubeChannelMeta } from "@/lib/youtube";
import {
  CREATOR_RESEARCH_MAX_ATTEMPTS,
  CREATOR_RESEARCH_MAX_SOURCES,
  CREATOR_RESEARCH_TEXT_LIMIT,
  buildCreatorResearchSystemPrompt,
  buildCreatorResearchUserPrompt,
  creatorResearchTtlDays,
  existingQualityFromSources,
  extractOfficialWebsiteUrls,
  isCreatorResearchFresh,
  isTransientCreatorResearchError,
  parseCreatorResearchResponse,
  type CreatorResearchParsed,
  type CreatorResearchSource,
} from "@/lib/content-factory/creator-research-shared";
import { extractJsonValue } from "@/lib/content-factory/qualify-shared";

type Admin = SupabaseClient<Database>;

function ttlDays(): number {
  return creatorResearchTtlDays(process.env.CONTENT_FACTORY_CREATOR_RESEARCH_TTL_DAYS);
}

async function callDeepseekResearch(sources: CreatorResearchSource[], channelTitle: string): Promise<unknown> {
  const apiKey = await getDeepseekApiKey();
  const model = await getDeepseekModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        temperature: 0.2,
        messages: [
          { role: "system", content: buildCreatorResearchSystemPrompt() },
          { role: "user", content: buildCreatorResearchUserPrompt({ channelTitle, sources }) },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("DeepSeek request failed (timeout)");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned empty content.");
  try {
    return extractJsonValue(content);
  } catch {
    throw new Error("DeepSeek returned non-JSON content.");
  }
}

async function researchWithRetry(sources: CreatorResearchSource[], channelTitle: string): Promise<CreatorResearchParsed> {
  let lastError = "Creator research failed.";
  for (let attempt = 1; attempt <= CREATOR_RESEARCH_MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await callDeepseekResearch(sources, channelTitle);
      return parseCreatorResearchResponse(raw, sources);
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Creator research failed.";
      const lower = lastError.toLowerCase();
      if (lower.includes("private or local") || lower.includes("only http")) {
        throw err;
      }
      const malformed = lower.includes("malformed") || lower.includes("invalid_") || lower.includes("missing_fields");
      if (malformed && attempt >= 2) throw err;
      if (!isTransientCreatorResearchError(lastError) && !malformed) throw err;
    }
  }
  throw new Error(lastError);
}

async function findCreatorByChannel(admin: Admin, channelId: string | null) {
  if (!channelId) return null;
  const { data, error } = await admin
    .from("creator_profiles")
    .select("*")
    .eq("youtube_channel_id", channelId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error.message)) throw new Error(error.message);
    throw new Error(error.message);
  }
  return data;
}

async function loadCreatorSources(admin: Admin, creatorId: string): Promise<CreatorSource[]> {
  const { data, error } = await admin
    .from("creator_sources")
    .select("*")
    .eq("creator_profile_id", creatorId)
    .order("retrieved_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CreatorSource[];
}

async function collectSources(channel: YoutubeChannelMeta): Promise<CreatorResearchSource[]> {
  const sources: CreatorResearchSource[] = [
    {
      url: channel.channelUrl,
      sourceType: "youtube_channel",
      title: channel.title,
      text: `${channel.title}\n${channel.description}`.slice(0, CREATOR_RESEARCH_TEXT_LIMIT),
    },
  ];

  const websiteCandidates = extractOfficialWebsiteUrls(channel.description);
  for (const raw of websiteCandidates) {
    if (sources.length >= CREATOR_RESEARCH_MAX_SOURCES) break;
    try {
      const safe = assertSafePublicHttpUrl(raw);
      const snippet = await fetchPublicTextSnippet(safe.toString(), { maxBytes: 80_000, timeoutMs: 8_000 });
      if (!snippet?.text) continue;
      sources.push({
        url: snippet.url,
        sourceType: "website",
        title: snippet.title || "Official website",
        text: snippet.text.slice(0, CREATOR_RESEARCH_TEXT_LIMIT),
      });
    } catch {
      continue;
    }
  }

  if (sources.length < CREATOR_RESEARCH_MAX_SOURCES && channel.channelUrl) {
    try {
      assertSafePublicHttpUrl(channel.channelUrl);
      const snippet = await fetchPublicTextSnippet(channel.channelUrl, { maxBytes: 80_000, timeoutMs: 8_000 });
      if (snippet?.text) {
        sources.push({
          url: snippet.url,
          sourceType: "youtube_channel",
          title: snippet.title || channel.title,
          text: snippet.text.slice(0, CREATOR_RESEARCH_TEXT_LIMIT),
        });
      }
    } catch {
      // YouTube HTML is optional; API snippet is already included.
    }
  }

  return sources.slice(0, CREATOR_RESEARCH_MAX_SOURCES);
}

async function saveSources(
  admin: Admin,
  creatorId: string,
  sources: CreatorResearchSource[],
  parsed: CreatorResearchParsed | null,
) {
  const { data: existing } = await admin
    .from("creator_sources")
    .select("id, source_url, relationship")
    .eq("creator_profile_id", creatorId);
  const removable = (existing ?? []).filter((row) => row.relationship === "fact" || row.relationship === "quality");
  if (removable.length) {
    await admin
      .from("creator_sources")
      .delete()
      .in(
        "id",
        removable.map((row) => row.id),
      );
  }

  const existingUrls = new Set((existing ?? []).map((row) => row.source_url));
  for (const source of sources) {
    if (existingUrls.has(source.url)) continue;
    await admin.from("creator_sources").insert({
      creator_profile_id: creatorId,
      source_type: source.sourceType,
      source_url: source.url,
      source_title: source.title,
      source_identifier: null,
      relationship: source.sourceType === "youtube_channel" ? "primary" : "supporting",
      research_status: "retrieved",
    });
    existingUrls.add(source.url);
  }

  if (!parsed) return;
  for (const fact of parsed.facts) {
    await admin.from("creator_sources").insert({
      creator_profile_id: creatorId,
      source_type: fact.sourceType,
      source_url: fact.sourceUrl,
      source_title: fact.claim,
      source_identifier: String(fact.confidence),
      relationship: "fact",
      research_status: "retrieved",
    });
  }
  await admin.from("creator_sources").insert({
    creator_profile_id: creatorId,
    source_type: "ai_synthesis",
    source_url: sources[0]?.url ?? "https://www.youtube.com/",
    source_title: "research_quality",
    source_identifier: String(parsed.qualityScore),
    relationship: "quality",
    research_status: "retrieved",
  });
}

async function insertMinimalCreator(
  admin: Admin,
  channel: YoutubeChannelMeta | null,
  status: CreatorProfile["research_status"],
) {
  const { data, error } = await admin
    .from("creator_profiles")
    .insert({
      display_name: channel?.title ?? "YouTube Creator",
      short_bio: (channel?.description ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
      expertise: [],
      teaches: "",
      credentials: "",
      relevance: "",
      youtube_channel_id: channel?.channelId ?? null,
      youtube_channel_url: channel?.channelUrl ?? null,
      avatar_url: channel?.thumbnailUrl ?? null,
      research_status: status,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CreatorProfile;
}

export async function loadCreatorResearchBundle(admin: Admin, creatorId: string) {
  const { data: profile, error } = await admin.from("creator_profiles").select("*").eq("id", creatorId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) return null;
  const sources = await loadCreatorSources(admin, creatorId);
  return {
    profile,
    sources,
    qualityScore: existingQualityFromSources(sources),
    facts: sources.filter((row) => row.relationship === "fact"),
    lastResearched: profile.updated_at,
  };
}

export async function researchAndUpsertCreator(
  admin: Admin,
  params: {
    channel: YoutubeChannelMeta | null;
    playlistTitle: string;
    playlistDescription: string;
  },
): Promise<{
  creator: CreatorProfile;
  reused: boolean;
  qualityScore: number | null;
  officialWebsite: string | null;
}> {
  if (!contentFactoryEnabled()) {
    throw new Error("Content Factory is disabled.");
  }

  const existing = await findCreatorByChannel(admin, params.channel?.channelId ?? null);
  if (existing && (existing.research_status === "complete" || existing.research_status === "partial")) {
    const sources = await loadCreatorSources(admin, existing.id);
    if (isCreatorResearchFresh(existing.updated_at, ttlDays())) {
      const website = sources.find((row) => row.source_type === "website" && row.relationship !== "fact");
      return {
        creator: existing,
        reused: true,
        qualityScore: existingQualityFromSources(sources),
        officialWebsite: website?.source_url ?? null,
      };
    }
  }

  if (!params.channel) {
    const creator = existing ?? (await insertMinimalCreator(admin, null, "failed"));
    return { creator, reused: Boolean(existing), qualityScore: null, officialWebsite: null };
  }

  let sources: CreatorResearchSource[] = [];
  try {
    sources = await collectSources(params.channel);
  } catch {
    sources = [
      {
        url: params.channel.channelUrl,
        sourceType: "youtube_channel",
        title: params.channel.title,
        text: params.channel.description.slice(0, CREATOR_RESEARCH_TEXT_LIMIT),
      },
    ];
  }

  let parsed: CreatorResearchParsed | null = null;
  try {
    parsed = await researchWithRetry(sources, params.channel.title);
  } catch {
    parsed = null;
  }

  const officialWebsite = sources.find((source) => source.sourceType === "website")?.url ?? null;
  const existingQuality = existing ? existingQualityFromSources(await loadCreatorSources(admin, existing.id)) : null;
  const nextQuality = parsed?.qualityScore ?? null;
  const keepExistingCopy =
    Boolean(existing) &&
    existing!.research_status === "complete" &&
    existingQuality != null &&
    (nextQuality == null || nextQuality < existingQuality);

  if (keepExistingCopy && existing) {
    return {
      creator: existing,
      reused: true,
      qualityScore: existingQuality,
      officialWebsite,
    };
  }

  const patch = {
    display_name: parsed?.creatorName || params.channel.title,
    short_bio: parsed?.shortDescription || params.channel.description.replace(/\s+/g, " ").trim().slice(0, 400),
    expertise: parsed?.expertise ?? [],
    teaches: parsed?.teachingFocus.join(", ") ?? "",
    credentials: "",
    relevance: parsed?.audience ?? "",
    youtube_channel_id: params.channel.channelId,
    youtube_channel_url: params.channel.channelUrl,
    avatar_url: params.channel.thumbnailUrl,
    research_status: (parsed ? (nextQuality != null && nextQuality >= 60 ? "complete" : "partial") : "failed") as CreatorProfile["research_status"],
    updated_at: new Date().toISOString(),
  };

  let creator: CreatorProfile;
  if (existing) {
    const { data, error } = await admin.from("creator_profiles").update(patch).eq("id", existing.id).select("*").single();
    if (error) throw new Error(error.message);
    creator = data as CreatorProfile;
  } else {
    const { data, error } = await admin.from("creator_profiles").insert(patch).select("*").single();
    if (error) throw new Error(error.message);
    creator = data as CreatorProfile;
  }

  await saveSources(admin, creator.id, sources, parsed);
  return { creator, reused: false, qualityScore: nextQuality, officialWebsite };
}
