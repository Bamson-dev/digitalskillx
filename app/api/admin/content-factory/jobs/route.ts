import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { createContentFactoryJob, listContentFactoryJobs } from "@/lib/content-factory/jobs";
import { createDiscoveryRun, createDiscoveryRuns, listDiscoveryRuns } from "@/lib/content-factory/discovery";
import { listDiscoveryCandidates } from "@/lib/content-factory/qualify";
import { generateFromQualifiedCandidates, syncCandidatesForRun } from "@/lib/content-factory/generate";
import {
  blockSelectedCandidates,
  inspectRecentPublishedSeo,
  listFilteredCandidates,
  loadContentFactoryHealth,
  parseCandidateFilters,
  rejectSelectedCandidates,
} from "@/lib/content-factory/ops";
import {
  blockContentFactorySource,
  listContentFactoryBlocks,
  unblockContentFactorySource,
  type ContentFactoryBlockKind,
} from "@/lib/content-factory/blocks";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import type { ContentFactoryInputType } from "@/lib/content-factory/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function kickContentFactoryCron(origin: string) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return;
  const cronUrl = new URL("/api/cron/content-factory", origin);
  setTimeout(() => {
    void fetch(cronUrl.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    }).catch(() => undefined);
  }, 500);
}

export async function GET(request: NextRequest) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  try {
    const runId = request.nextUrl.searchParams.get("runId")?.trim() || null;
    const blockQuery = request.nextUrl.searchParams.get("blockQuery")?.trim() || "";
    const filters = parseCandidateFilters({
      topic: request.nextUrl.searchParams.get("topic"),
      status: request.nextUrl.searchParams.get("status"),
      creator: request.nextUrl.searchParams.get("creator"),
      minRuleScore: request.nextUrl.searchParams.get("minRuleScore"),
      minAiScore: request.nextUrl.searchParams.get("minAiScore"),
      minVideos: request.nextUrl.searchParams.get("minVideos"),
      createdFrom: request.nextUrl.searchParams.get("createdFrom"),
    });
    const [jobs, discoveryRuns, health, blocks, seoIssues] = await Promise.all([
      listContentFactoryJobs(auth.admin),
      listDiscoveryRuns(auth.admin),
      loadContentFactoryHealth(auth.admin),
      listContentFactoryBlocks(auth.admin, blockQuery),
      inspectRecentPublishedSeo(auth.admin),
    ]);
    if (runId) await syncCandidatesForRun(auth.admin, runId);
    const hasFilters = Boolean(
      filters.topic || filters.status || filters.creator || filters.minRuleScore || filters.minAiScore || filters.minVideos || filters.createdFrom,
    );
    const candidates =
      runId && !hasFilters
        ? await listDiscoveryCandidates(auth.admin, runId)
        : await listFilteredCandidates(auth.admin, { ...filters, runId });
    return NextResponse.json({ jobs, discoveryRuns, candidates, runId, health, blocks, seoIssues });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list jobs" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "content-factory-jobs", 20);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: {
    action?:
      | "generate_candidates"
      | "reject_candidates"
      | "block_candidates"
      | "block_source"
      | "unblock_source";
    candidateIds?: unknown;
    inputType?: ContentFactoryInputType;
    inputValue?: string;
    targetGenerate?: number;
    kind?: ContentFactoryBlockKind;
    value?: string;
    reason?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action === "generate_candidates" || (Array.isArray(body.candidateIds) && !body.action)) {
    try {
      const result = await generateFromQualifiedCandidates(auth.admin, {
        adminId: auth.user.id,
        candidateIds: body.candidateIds,
      });
      if (result.created.length) kickContentFactoryCron(request.nextUrl.origin);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to generate candidates" },
        { status: 400 },
      );
    }
  }

  if (body.action === "reject_candidates") {
    try {
      const ids = Array.isArray(body.candidateIds)
        ? body.candidateIds.filter((id): id is string => typeof id === "string")
        : [];
      return NextResponse.json(await rejectSelectedCandidates(auth.admin, ids));
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to reject candidates" },
        { status: 400 },
      );
    }
  }

  if (body.action === "block_candidates") {
    try {
      const ids = Array.isArray(body.candidateIds)
        ? body.candidateIds.filter((id): id is string => typeof id === "string")
        : [];
      return NextResponse.json(
        await blockSelectedCandidates(auth.admin, {
          candidateIds: ids,
          adminId: auth.user.id,
          reason: body.reason,
        }),
      );
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to block candidates" },
        { status: 400 },
      );
    }
  }

  if (body.action === "block_source") {
    try {
      if (body.kind !== "playlist_id" && body.kind !== "channel_id") {
        return NextResponse.json({ error: "kind must be playlist_id or channel_id." }, { status: 400 });
      }
      const row = await blockContentFactorySource(auth.admin, {
        kind: body.kind,
        value: body.value ?? "",
        reason: body.reason,
        createdBy: auth.user.id,
      });
      return NextResponse.json({ block: row });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to add block" },
        { status: 400 },
      );
    }
  }

  if (body.action === "unblock_source") {
    try {
      if (body.kind !== "playlist_id" && body.kind !== "channel_id") {
        return NextResponse.json({ error: "kind must be playlist_id or channel_id." }, { status: 400 });
      }
      await unblockContentFactorySource(auth.admin, { kind: body.kind, value: body.value ?? "" });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to remove block" },
        { status: 400 },
      );
    }
  }

  if (!body.inputType || !body.inputValue?.trim()) {
    return NextResponse.json({ error: "inputType and inputValue are required." }, { status: 400 });
  }
  if (!["topic", "playlist_url", "playlist_id"].includes(body.inputType)) {
    return NextResponse.json({ error: "Invalid inputType." }, { status: 400 });
  }

  try {
    if (body.inputType === "topic") {
      const tight = await rateLimitedResponse(request, "content-factory-discovery", 8, 60 * 60 * 1000);
      if (tight) return tight;
      const topics = body.inputValue.includes("\n") || body.inputValue.includes(",") || body.inputValue.includes(";")
        ? null
        : body.inputValue;
      if (topics) {
        const run = await createDiscoveryRun(auth.admin, {
          adminId: auth.user.id,
          topic: body.inputValue,
          targetGenerate: body.targetGenerate,
        });
        kickContentFactoryCron(request.nextUrl.origin);
        return NextResponse.json({
          runId: run.id,
          status: run.status,
          topic: run.topic,
          targetGenerate: run.target_generate,
          created: [run],
          skipped: [],
        });
      }
      const result = await createDiscoveryRuns(auth.admin, {
        adminId: auth.user.id,
        topics: body.inputValue,
        targetGenerate: body.targetGenerate,
      });
      kickContentFactoryCron(request.nextUrl.origin);
      const first = result.created[0]!;
      return NextResponse.json({
        runId: first.id,
        status: first.status,
        topic: first.topic,
        targetGenerate: first.target_generate,
        created: result.created,
        skipped: result.skipped,
      });
    }

    const job = await createContentFactoryJob(auth.admin, {
      adminId: auth.user.id,
      inputType: body.inputType,
      inputValue: body.inputValue,
    });
    kickContentFactoryCron(request.nextUrl.origin);
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create job" },
      { status: 400 },
    );
  }
}
