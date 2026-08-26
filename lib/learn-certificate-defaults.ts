import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  recommendLearnCertificatePrice,
  resolveFinalCertificatePrice,
  type LearnCertificatePricingMode,
} from "@/lib/learn-certificate-pricing";
import { isMissingColumnError, isMissingRelationError } from "@/lib/schema-guard";

type Admin = SupabaseClient<Database>;

export type CertificateDefaultsReport = {
  audited: number;
  enabled: number;
  disabled: number;
  tier2000: number;
  tier3000: number;
  tier5000: number;
  tier7500: number;
  free: number;
  needsManualReview: number;
  updated: number;
  preserved: number;
};

async function loadPathMetrics(admin: Admin, pathId: string) {
  const [{ data: lessons }, { data: sections }, { data: path }] = await Promise.all([
    admin
      .from("learning_path_lessons")
      .select("id, duration_seconds")
      .eq("learning_path_id", pathId),
    admin.from("learning_path_sections").select("id").eq("learning_path_id", pathId),
    admin
      .from("learning_paths")
      .select(
        "id, category, difficulty, estimated_duration_seconds, certificate_enabled, certificate_price_ngn, certificate_pricing_mode, certificate_recommended_price_ngn, certificate_price_reason",
      )
      .eq("id", pathId)
      .maybeSingle(),
  ]);

  const lessonRows = lessons ?? [];
  const durationSum = lessonRows.reduce(
    (sum, row) => sum + (typeof row.duration_seconds === "number" ? row.duration_seconds : 0),
    0,
  );
  const estimated =
    (path as { estimated_duration_seconds?: number | null } | null)?.estimated_duration_seconds ??
    (durationSum > 0 ? durationSum : null);

  return {
    path,
    lessonCount: lessonRows.length,
    sectionCount: (sections ?? []).length,
    estimatedDurationSeconds: estimated,
    durationSum,
  };
}

export async function applyCertificateDefaultsForPath(
  admin: Admin,
  pathId: string,
  options?: { enableIfUnset?: boolean; overwriteAutomaticOnly?: boolean },
): Promise<{ updated: boolean; needsManualReview: boolean; recommended: number }> {
  const enableIfUnset = options?.enableIfUnset !== false;
  const overwriteAutomaticOnly = options?.overwriteAutomaticOnly !== false;
  const metrics = await loadPathMetrics(admin, pathId);
  if (!metrics.path) return { updated: false, needsManualReview: true, recommended: 2000 };

  const recommendation = recommendLearnCertificatePrice({
    estimatedDurationSeconds: metrics.estimatedDurationSeconds,
    lessonCount: metrics.lessonCount,
    difficulty: metrics.path.difficulty,
    category: metrics.path.category,
    sectionCount: metrics.sectionCount,
  });

  const needsManualReview = metrics.lessonCount === 0;
  const existingMode = ((metrics.path as { certificate_pricing_mode?: string | null })
    .certificate_pricing_mode || "automatic") as LearnCertificatePricingMode;
  const existingPrice = metrics.path.certificate_price_ngn;
  const alreadyEnabled = metrics.path.certificate_enabled === true;

  // Preserve deliberate fixed prices and free mode.
  if (overwriteAutomaticOnly && (existingMode === "fixed" || existingMode === "free")) {
    const patch: Record<string, unknown> = {
      certificate_recommended_price_ngn: recommendation.recommendedPriceNgn,
      certificate_price_reason: recommendation.reason,
      estimated_duration_seconds: metrics.estimatedDurationSeconds,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("learning_paths").update(patch as never).eq("id", pathId);
    if (error && !isMissingColumnError(error.message)) throw new Error(error.message);
    return {
      updated: !error,
      needsManualReview,
      recommended: recommendation.recommendedPriceNgn,
    };
  }

  // Preserve an existing positive price when certificates already enabled under automatic
  // and a deliberate price was set before recommendation engine existed — only refresh reason.
  const preservePrice =
    alreadyEnabled &&
    typeof existingPrice === "number" &&
    existingPrice > 0 &&
    [2000, 3000, 5000, 7500].includes(existingPrice) &&
    existingMode === "automatic" &&
    (metrics.path as { certificate_recommended_price_ngn?: number | null })
      .certificate_recommended_price_ngn == null;

  const finalPrice = preservePrice
    ? existingPrice
    : resolveFinalCertificatePrice({
        mode: "automatic",
        recommendedPriceNgn: recommendation.recommendedPriceNgn,
        fixedPriceNgn: existingPrice,
      });

  const patch: Record<string, unknown> = {
    certificate_pricing_mode: "automatic",
    certificate_recommended_price_ngn: recommendation.recommendedPriceNgn,
    certificate_price_reason: recommendation.reason,
    certificate_price_ngn: finalPrice,
    estimated_duration_seconds: metrics.estimatedDurationSeconds,
    updated_at: new Date().toISOString(),
  };

  if (enableIfUnset && !alreadyEnabled && !needsManualReview) {
    patch.certificate_enabled = true;
  }

  const { error } = await admin.from("learning_paths").update(patch as never).eq("id", pathId);
  if (error) {
    if (isMissingColumnError(error.message)) {
      // Minimal legacy update.
      const legacy = await admin
        .from("learning_paths")
        .update({
          certificate_enabled: enableIfUnset ? true : alreadyEnabled,
          certificate_price_ngn: finalPrice,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pathId);
      if (legacy.error && !isMissingColumnError(legacy.error.message)) {
        throw new Error(legacy.error.message);
      }
      return { updated: !legacy.error, needsManualReview, recommended: finalPrice };
    }
    throw new Error(error.message);
  }

  return { updated: true, needsManualReview, recommended: finalPrice };
}

export async function backfillLearningPathCertificatePricing(
  admin: Admin,
  limit = 200,
): Promise<CertificateDefaultsReport> {
  const report: CertificateDefaultsReport = {
    audited: 0,
    enabled: 0,
    disabled: 0,
    tier2000: 0,
    tier3000: 0,
    tier5000: 0,
    tier7500: 0,
    free: 0,
    needsManualReview: 0,
    updated: 0,
    preserved: 0,
  };

  const { data, error } = await admin
    .from("learning_paths")
    .select(
      "id, status, certificate_enabled, certificate_price_ngn, certificate_pricing_mode, certificate_recommended_price_ngn",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, limit)));

  if (error) {
    if (isMissingRelationError(error.message) || isMissingColumnError(error.message)) {
      return report;
    }
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    report.audited += 1;
    const beforeMode = (row as { certificate_pricing_mode?: string | null }).certificate_pricing_mode;
    const beforeRec = (row as { certificate_recommended_price_ngn?: number | null })
      .certificate_recommended_price_ngn;
    const result = await applyCertificateDefaultsForPath(admin, row.id, {
      enableIfUnset: true,
      overwriteAutomaticOnly: true,
    });
    if (result.needsManualReview) report.needsManualReview += 1;
    if (result.updated) report.updated += 1;
    if (beforeMode === "fixed" || beforeMode === "free" || beforeRec != null) {
      report.preserved += 1;
    }

    const { data: refreshed } = await admin
      .from("learning_paths")
      .select("certificate_enabled, certificate_price_ngn, certificate_pricing_mode")
      .eq("id", row.id)
      .maybeSingle();

    if (refreshed?.certificate_enabled) report.enabled += 1;
    else report.disabled += 1;

    const mode = (refreshed as { certificate_pricing_mode?: string | null } | null)
      ?.certificate_pricing_mode;
    const price = refreshed?.certificate_price_ngn ?? result.recommended;
    if (mode === "free" || price === 0) report.free += 1;
    else if (price === 2000) report.tier2000 += 1;
    else if (price === 3000) report.tier3000 += 1;
    else if (price === 5000) report.tier5000 += 1;
    else if (price === 7500) report.tier7500 += 1;
  }

  return report;
}
