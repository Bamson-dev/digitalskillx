import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentFactoryCandidate, Database, Json } from "@/types/database";
import { getDeepseekApiKey, getDeepseekModel } from "@/lib/env-deepseek";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { isMissingRelationError } from "@/lib/schema-guard";
import { isGeneratedCandidate } from "@/lib/content-factory/generate-shared";
import {
  QUALIFY_BATCH_MAX,
  QUALIFY_MAX_ATTEMPTS,
  applyQualifyDecision,
  buildQualifySystemPrompt,
  buildQualifyUserPrompt,
  extractJsonValue,
  formatQualifyError,
  hasExistingAiScore,
  isQualifyRetryableRun,
  mergeAiScoreBreakdown,
  parseQualifyAttempt,
  parseQualifyBatchResponse,
  qualifyMaxPerRunFromEnv,
  selectQualifyBatch,
  QUALIFY_SCORE_THRESHOLD,
  type QualifyCandidateInput,
} from "@/lib/content-factory/qualify-shared";
import { decideCandidateQuality } from "@/lib/content-factory/library-build/quality-decision-shared";
import { syncLibraryBuildDiscoveryJobs } from "@/lib/content-factory/library-build/discovery-sync";

type Admin = SupabaseClient<Database>;
type CandidateRow = ContentFactoryCandidate;

function qualifyCap(): number {
  return qualifyMaxPerRunFromEnv(process.env.CONTENT_FACTORY_AI_QUALIFY_MAX_PER_RUN);
}

async function loadRunCandidates(admin: Admin, runId: string): Promise<CandidateRow[]> {
  const { data, error } = await admin
    .from("content_factory_candidates")
    .select("*")
    .eq("run_id", runId)
    .order("rule_score", { ascending: false });
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as CandidateRow[];
}

export async function listDiscoveryCandidates(admin: Admin, runId: string) {
  return loadRunCandidates(admin, runId);
}

async function recountRun(admin: Admin, runId: string, extra?: {
  status?: "running" | "completed" | "failed";
  errorMessage?: string | null;
  completed?: boolean;
}) {
  const candidates = await loadRunCandidates(admin, runId);
  const discovered_count = candidates.filter((c) => c.status === "discovered").length;
  const filtered_count = candidates.filter((c) => c.status === "filtered").length;
  const qualified_count = candidates.filter((c) => c.status === "qualified").length;
  const patch: {
    discovered_count: number;
    filtered_count: number;
    qualified_count: number;
    generated_count: number;
    failed_count: number;
    status?: "running" | "completed" | "failed";
    error_message?: string | null;
    completed_at?: string | null;
  } = {
    // Keep "found" as total candidates in the run so the admin UI does not
    // drop to 0 after everything moves out of status=discovered.
    discovered_count: Math.max(discovered_count, candidates.length),
    filtered_count,
    qualified_count,
    generated_count: candidates.filter((c) => isGeneratedCandidate(c)).length,
    failed_count: extra?.status === "failed" ? 1 : 0,
  };
  if (extra?.status) patch.status = extra.status;
  if (extra && "errorMessage" in extra) patch.error_message = extra.errorMessage;
  if (extra?.completed) patch.completed_at = new Date().toISOString();
  if (extra?.status === "running") patch.completed_at = null;
  const { error } = await admin.from("content_factory_discovery_runs").update(patch).eq("id", runId);
  if (error) throw new Error(error.message);
  return { discovered_count, filtered_count, qualified_count, generated_count: 0 };
}

function toQualifyInput(row: CandidateRow, topic: string, query: string): QualifyCandidateInput {
  const breakdown = (row.score_breakdown ?? {}) as Record<string, unknown>;
  const description =
    typeof breakdown.playlistDescription === "string" ? breakdown.playlistDescription : "";
  return {
    playlistId: row.playlist_id,
    title: row.title,
    channelTitle: row.channel_title,
    itemCount: row.item_count,
    description,
    topic,
    discoveryQuery: query,
    ruleScore: row.rule_score,
  };
}

async function qualifyBatchWithDeepSeek(batch: QualifyCandidateInput[]): Promise<unknown> {
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
          { role: "system", content: buildQualifySystemPrompt() },
          { role: "user", content: buildQualifyUserPrompt(batch) },
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

async function applyAcceptedResults(
  admin: Admin,
  candidates: CandidateRow[],
  accepted: ReturnType<typeof parseQualifyBatchResponse>["accepted"],
) {
  const byId = new Map(candidates.map((c) => [c.playlist_id, c]));
  for (const result of accepted) {
    const row = byId.get(result.playlistId);
    if (!row) continue;
    if (hasExistingAiScore(row)) continue;
    const decision = applyQualifyDecision(result);
    const breakdown = mergeAiScoreBreakdown(
      (row.score_breakdown ?? {}) as Record<string, unknown>,
      result,
    ) as Record<string, unknown>;
    const quality = decideCandidateQuality({
      candidateStatus: decision.status,
      ruleScore: row.rule_score,
      aiScore: decision.aiScore,
      filterReason: decision.filterReason,
      threshold: QUALIFY_SCORE_THRESHOLD,
      scoreBreakdown: breakdown,
      titleSimilarityWarning: Boolean(breakdown.titleSimilarityWarning),
      channelSeen: Boolean(breakdown.channelSeen),
    });
    const { error } = await admin
      .from("content_factory_candidates")
      .update({
        status: decision.status,
        ai_score: decision.aiScore,
        filter_reason: decision.filterReason,
        score_breakdown: breakdown as Json,
        quality_status: quality.qualityStatus,
        quality_reason: quality.qualityReason,
        rejection_reason: quality.rejectionReason,
        final_quality_score: quality.finalQualityScore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "discovered");
    if (error) throw new Error(error.message);
  }
}

async function findQualificationRun(admin: Admin) {
  const { data: running, error: runError } = await admin
    .from("content_factory_discovery_runs")
    .select("*")
    .eq("status", "running")
    .order("created_at", { ascending: true })
    .limit(8);
  if (runError) {
    if (isMissingRelationError(runError.message)) return null;
    throw new Error(runError.message);
  }
  for (const run of running ?? []) {
    const candidates = await loadRunCandidates(admin, run.id);
    if (selectQualifyBatch(candidates, { runCap: qualifyCap() }).length) return { run, candidates };
    await recountRun(admin, run.id, { status: "completed", errorMessage: null, completed: true });
  }

  const { data: failed } = await admin
    .from("content_factory_discovery_runs")
    .select("*")
    .eq("status", "failed")
    .like("error_message", `${"[qualify_attempt:"}%`)
    .order("created_at", { ascending: true })
    .limit(8);
  for (const run of failed ?? []) {
    if (!isQualifyRetryableRun({ status: run.status, errorMessage: run.error_message })) continue;
    const candidates = await loadRunCandidates(admin, run.id);
    if (selectQualifyBatch(candidates, { runCap: qualifyCap() }).length) return { run, candidates };
  }
  return null;
}

/**
 * Qualify one discovery run in bounded batches. Never creates jobs or learning paths.
 */
export async function processPendingQualification(admin: Admin) {
  if (!contentFactoryEnabled()) {
    return { processed: false as const, reason: "disabled" as const, generated: false as const };
  }

  const found = await findQualificationRun(admin);
  if (!found) return { processed: false as const, reason: "idle" as const, generated: false as const };

  const { run } = found;
  let candidates = found.candidates;
  const priorAttempt = parseQualifyAttempt(run.error_message);
  let batches = 0;
  const cap = qualifyCap();

  try {
    await admin
      .from("content_factory_discovery_runs")
      .update({ status: "running", completed_at: null })
      .eq("id", run.id);

    while (batches < 3) {
      const batchRows = selectQualifyBatch(candidates, { batchMax: QUALIFY_BATCH_MAX, runCap: cap });
      if (!batchRows.length) break;

      const inputs = batchRows.map((row) =>
        toQualifyInput(row, run.topic, row.discovery_query || `${run.topic} tutorial playlist`),
      );
      const raw = await qualifyBatchWithDeepSeek(inputs);
      const parsed = parseQualifyBatchResponse(
        raw,
        batchRows.map((row) => row.playlist_id),
      );
      if (!parsed.accepted.length) {
        throw new Error("DeepSeek returned no valid qualification results.");
      }
      await applyAcceptedResults(admin, candidates, parsed.accepted);
      batches += 1;
      candidates = await loadRunCandidates(admin, run.id);
    }

    const leftover = selectQualifyBatch(candidates, { runCap: cap });
    if (leftover.length) {
      const counts = await recountRun(admin, run.id, {
        status: "running",
        errorMessage: null,
      });
      return {
        processed: true as const,
        runId: run.id,
        batches,
        ...counts,
        generated: false as const,
        published: false as const,
        incomplete: true as const,
      };
    }

    const counts = await recountRun(admin, run.id, {
      status: "completed",
      errorMessage: null,
      completed: true,
    });
    try {
      await syncLibraryBuildDiscoveryJobs(admin, { runId: run.id });
    } catch {
      /* library build optional */
    }
    return {
      processed: true as const,
      runId: run.id,
      batches,
      ...counts,
      generated: false as const,
      published: false as const,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Qualification failed.";
    const attempt = priorAttempt + 1;
    const terminal = attempt >= QUALIFY_MAX_ATTEMPTS;
    await recountRun(admin, run.id, {
      status: terminal ? "failed" : "running",
      errorMessage: formatQualifyError(attempt, message),
      completed: terminal,
    });
    return {
      processed: true as const,
      runId: run.id,
      batches,
      generated: false as const,
      published: false as const,
      failed: true as const,
      attempt,
      terminal,
      error: message.slice(0, 300),
    };
  }
}
