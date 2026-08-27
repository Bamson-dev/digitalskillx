/** Pure discovery job sync helpers (no I/O). */

export type DiscoveryRunCounts = {
  discovered: number;
  filtered: number;
  qualified: number;
  generated: number;
  published: number;
  duplicates: number;
  rejected: number;
};

export type LibraryDiscoveryJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "rate_limited"
  | "quota_limited"
  | "paused"
  | "cancelled";

export function mapDiscoveryRunToJobStatus(
  runStatus: string,
  errorMessage: string | null | undefined,
): LibraryDiscoveryJobStatus {
  if (runStatus === "queued") return "queued";
  if (runStatus === "running") return "running";
  if (runStatus === "completed") return "completed";
  if (runStatus === "cancelled") return "cancelled";
  if (runStatus === "failed") {
    const msg = String(errorMessage ?? "").toLowerCase();
    if (msg.includes("quota") || msg.includes("quotaexceeded")) return "quota_limited";
    if (msg.includes("rate") || msg.includes("cap reached")) return "rate_limited";
    return "failed";
  }
  return "failed";
}

export function isTerminalJobStatus(status: LibraryDiscoveryJobStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "rate_limited" ||
    status === "quota_limited" ||
    status === "cancelled"
  );
}

export function isSuccessfulJobStatus(status: LibraryDiscoveryJobStatus): boolean {
  return status === "completed";
}

export function buildSyncFingerprint(input: {
  runId: string;
  runStatus: string;
  runCompletedAt: string | null;
  counts: DiscoveryRunCounts;
}): string {
  const c = input.counts;
  return [
    input.runId,
    input.runStatus,
    input.runCompletedAt ?? "",
    c.discovered,
    c.filtered,
    c.qualified,
    c.generated,
    c.published,
    c.duplicates,
    c.rejected,
  ].join("|");
}

export function aggregateCandidateCounts(
  candidates: Array<{
    status: string;
    filter_reason?: string | null;
    quality_status?: string | null;
    factory_job_id?: string | null;
    learning_path_id?: string | null;
  }>,
  pathsByCandidate: Map<string, string>,
): DiscoveryRunCounts {
  let discovered = 0;
  let filtered = 0;
  let qualified = 0;
  let generated = 0;
  let published = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const c of candidates) {
    const reason = String(c.filter_reason ?? "").toLowerCase();
    if (reason.includes("duplicate") || c.quality_status === "blocked_duplicate") {
      duplicates += 1;
    }

    if (c.status === "discovered") discovered += 1;
    else if (c.status === "filtered") {
      filtered += 1;
      rejected += 1;
    } else if (c.status === "qualified") qualified += 1;
    else if (c.status === "rejected" || c.status === "blocked") rejected += 1;

    if (c.quality_status === "rejected" || c.quality_status === "failed") rejected += 1;

    if (c.factory_job_id || c.status === "generating" || c.status === "review") generated += 1;
    if (c.learning_path_id) {
      const pathStatus = pathsByCandidate.get(c.learning_path_id);
      if (pathStatus === "published") published += 1;
    }
    if (c.status === "published") published += 1;
  }

  return { discovered, filtered, qualified, generated, published, duplicates, rejected };
}

export function shouldApplyDailyStatDelta(
  previousFingerprint: string | null | undefined,
  nextFingerprint: string,
  previousStatus: string,
  nextStatus: LibraryDiscoveryJobStatus,
): boolean {
  if (previousFingerprint === nextFingerprint) return false;
  return isTerminalJobStatus(nextStatus) && previousStatus !== nextStatus;
}

export function dailyStatDeltasFromSync(input: {
  counts: DiscoveryRunCounts;
  status: LibraryDiscoveryJobStatus;
  previousStatus: string;
  applyStats: boolean;
}): {
  candidatesToday: number;
  approvedToday: number;
  rejectedToday: number;
  publishedToday: number;
  jobsStartedToday: number;
  jobsCompletedToday: number;
  jobsFailedToday: number;
} {
  const zero = {
    candidatesToday: 0,
    approvedToday: 0,
    rejectedToday: 0,
    publishedToday: 0,
    jobsStartedToday: 0,
    jobsCompletedToday: 0,
    jobsFailedToday: 0,
  };
  if (!input.applyStats) return zero;

  const started = input.previousStatus === "queued" && input.status !== "queued" ? 1 : 0;
  const completed = input.status === "completed" ? 1 : 0;
  const failed =
    input.status === "failed" || input.status === "quota_limited" || input.status === "rate_limited"
      ? 1
      : 0;

  return {
    candidatesToday: input.counts.discovered + input.counts.filtered,
    approvedToday: input.counts.qualified,
    rejectedToday: input.counts.rejected + input.counts.filtered,
    publishedToday: input.counts.published,
    jobsStartedToday: started,
    jobsCompletedToday: completed,
    jobsFailedToday: failed,
  };
}

export function retryEligibleDiscoveryJob(input: {
  status: LibraryDiscoveryJobStatus;
  retryCount: number;
  maxRetries: number;
  lastUpdatedAt: string | null;
  nowMs?: number;
}): boolean {
  if (input.retryCount >= input.maxRetries) return false;
  if (input.status !== "rate_limited" && input.status !== "quota_limited") return false;
  if (!input.lastUpdatedAt) return true;
  const delay = Math.min(60_000 * 2 ** input.retryCount, 30 * 60_000);
  const updated = Date.parse(input.lastUpdatedAt);
  if (!Number.isFinite(updated)) return true;
  return (input.nowMs ?? Date.now()) - updated >= delay;
}
