/** Pure Stage 3 generation-gate helpers (no secrets, no I/O). */

export const GENERATE_MAX_PER_RUN = 3;
export const GENERATE_MIN_AI_SCORE = 60;

export type GenerateSkipReason =
  | "not_found"
  | "invalid_id"
  | "missing_playlist"
  | "not_qualified"
  | "score_below_threshold"
  | "filtered"
  | "blocked"
  | "rejected"
  | "run_cap"
  | "disabled";

export type GenerateDecision =
  | { action: "create" }
  | { action: "already"; reason: "already_generating" | "already_has_job" | "already_has_path" }
  | { action: "skip"; reason: GenerateSkipReason };

export function generateMaxPerRunFromEnv(raw: string | undefined): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return Math.min(GENERATE_MAX_PER_RUN, n);
  return GENERATE_MAX_PER_RUN;
}

export function normalizeCandidateIds(raw: unknown): { ids: string[]; requested: number; error?: string } {
  if (!Array.isArray(raw)) return { ids: [], requested: 0, error: "candidateIds must be an array." };
  const requested = raw.length;
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (!ids.length) return { ids, requested, error: "candidateIds is required." };
  if (ids.length > GENERATE_MAX_PER_RUN) {
    return {
      ids,
      requested,
      error: `Cannot generate more than ${GENERATE_MAX_PER_RUN} candidates at once.`,
    };
  }
  return { ids, requested };
}

export function isGeneratedCandidate(candidate: {
  status: string;
  factory_job_id?: string | null;
  learning_path_id?: string | null;
}): boolean {
  return Boolean(
    candidate.factory_job_id ||
      candidate.learning_path_id ||
      candidate.status === "generating" ||
      candidate.status === "review" ||
      candidate.status === "published",
  );
}

export function evaluateGenerateEligibility(input: {
  candidate: {
    status: string;
    ai_score: number | null;
    playlist_id: string | null;
    factory_job_id: string | null;
    learning_path_id: string | null;
  } | null;
  blocked: boolean;
}): GenerateDecision {
  if (!input.candidate) return { action: "skip", reason: "not_found" };
  const c = input.candidate;
  if (!c.playlist_id?.trim()) return { action: "skip", reason: "missing_playlist" };
  if (input.blocked || c.status === "blocked") return { action: "skip", reason: "blocked" };
  if (c.learning_path_id) return { action: "already", reason: "already_has_path" };
  if (c.factory_job_id) return { action: "already", reason: "already_has_job" };
  if (c.status === "generating") return { action: "already", reason: "already_generating" };
  if (c.status === "review" || c.status === "published") {
    return { action: "already", reason: "already_has_path" };
  }
  if (c.status === "filtered") return { action: "skip", reason: "filtered" };
  if (c.status === "rejected") return { action: "skip", reason: "rejected" };
  if (c.status !== "qualified") return { action: "skip", reason: "not_qualified" };
  const qualityStatus = (c as { quality_status?: string | null }).quality_status;
  if (qualityStatus && qualityStatus !== "qualified") return { action: "skip", reason: "rejected" };
  if (c.ai_score == null || c.ai_score < GENERATE_MIN_AI_SCORE) {
    return { action: "skip", reason: "score_below_threshold" };
  }
  return { action: "create" };
}

export function candidateStatusFromFactory(input: {
  jobStatus?: string | null;
  pathStatus?: string | null;
  learningPathId?: string | null;
}): "generating" | "review" | "published" | "qualified" | "rejected" {
  if (input.pathStatus === "published") return "published";
  if (input.pathStatus === "rejected") return "rejected";
  if (input.learningPathId || input.pathStatus === "review" || input.pathStatus === "draft") {
    return "review";
  }
  if (input.jobStatus === "waiting_review" || input.jobStatus === "completed") return "review";
  if (input.jobStatus === "pending" || input.jobStatus === "processing") return "generating";
  if (input.jobStatus === "failed" || input.jobStatus === "cancelled") return "qualified";
  return "generating";
}
