/** Pure Free Learning Library certificate pricing (no secrets, no I/O). */

export const LEARN_CERTIFICATE_PRICE_TIERS = [2000, 3000, 5000, 7500] as const;
export type LearnCertificatePriceTier = (typeof LEARN_CERTIFICATE_PRICE_TIERS)[number];
export type LearnCertificatePricingMode = "automatic" | "fixed" | "free";

/** Fixed regional USD amounts for certificate tiers — NOT FX conversions. */
export const LEARN_CERTIFICATE_USD_BY_NGN: Record<LearnCertificatePriceTier, number> = {
  2000: 2,
  3000: 3,
  5000: 5,
  7500: 7.5,
};

export function learnCertificateUsdFromNgn(ngn: number): number {
  if (!Number.isFinite(ngn) || ngn <= 0) return 0;
  const tier = LEARN_CERTIFICATE_PRICE_TIERS.includes(ngn as LearnCertificatePriceTier)
    ? (ngn as LearnCertificatePriceTier)
    : snapToLearnCertificateTier(ngn);
  return LEARN_CERTIFICATE_USD_BY_NGN[tier];
}

/** Paystack USD minor units (cents). $7.50 → 750. */
export function learnCertificateUsdToCents(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * 100);
}

export type LearnCertificatePricingInput = {
  estimatedDurationSeconds: number | null;
  lessonCount: number;
  difficulty: "beginner" | "intermediate" | "advanced" | string | null;
  category?: string | null;
  sectionCount?: number | null;
};

export type LearnCertificatePricingResult = {
  recommendedPriceNgn: LearnCertificatePriceTier;
  reason: string;
  band:
    | "short_intro"
    | "basic"
    | "standard"
    | "advanced"
    | "long_professional";
  estimatedHours: number;
};

export function snapToLearnCertificateTier(raw: number): LearnCertificatePriceTier {
  if (!Number.isFinite(raw) || raw <= 0) return 2000;
  let best: LearnCertificatePriceTier = 2000;
  let bestDist = Infinity;
  for (const tier of LEARN_CERTIFICATE_PRICE_TIERS) {
    const dist = Math.abs(tier - raw);
    if (dist < bestDist) {
      best = tier;
      bestDist = dist;
    }
  }
  return best;
}

export function estimateHoursFromDuration(seconds: number | null | undefined, lessonCount: number): number {
  if (seconds != null && Number.isFinite(seconds) && seconds > 0) {
    return Math.max(0.25, Math.round((seconds / 3600) * 10) / 10);
  }
  // Conservative estimate when durations missing (~12 min/lesson).
  return Math.max(0.5, Math.round(lessonCount * 0.2 * 10) / 10);
}

export function recommendLearnCertificatePrice(
  input: LearnCertificatePricingInput,
): LearnCertificatePricingResult {
  const lessonCount = Math.max(0, Math.floor(input.lessonCount || 0));
  const hours = estimateHoursFromDuration(input.estimatedDurationSeconds, lessonCount);
  const difficulty = String(input.difficulty ?? "beginner").toLowerCase();
  const sections = Math.max(0, Math.floor(input.sectionCount ?? 0));
  const category = String(input.category ?? "").toLowerCase();
  const technical =
    /program|code|data|ai|tech|analytic|python|javascript|software/.test(category) ||
    /program|data|ai|tech/.test(difficulty);

  let band: LearnCertificatePricingResult["band"] = "short_intro";
  let price: LearnCertificatePriceTier = 2000;

  if (hours > 20 || (hours > 15 && sections >= 6) || lessonCount >= 50) {
    band = "long_professional";
    price = 7500;
  } else if (hours > 10 || (hours >= 8 && difficulty === "advanced") || lessonCount >= 30) {
    band = "advanced";
    price = 5000;
  } else if (hours >= 5 || lessonCount >= 15) {
    band = "standard";
    price = 3000;
  } else if (hours >= 2 || lessonCount >= 8) {
    band = "basic";
    price = 2000;
  } else {
    band = "short_intro";
    price = 2000;
  }

  // Difficulty is a modest adjustment only, still snapped to approved tiers.
  if (difficulty === "advanced" && price < 7500 && hours >= 4) {
    price = snapToLearnCertificateTier(price === 2000 ? 3000 : price === 3000 ? 5000 : price);
  } else if (difficulty === "beginner" && price === 5000 && hours < 12) {
    price = 3000;
  }

  if (technical && band === "standard" && hours >= 8) {
    price = 5000;
    band = "advanced";
  }

  const reasonParts = [
    `${hours} hour${hours === 1 ? "" : "s"} of learning`,
    `${lessonCount} required lesson${lessonCount === 1 ? "" : "s"}`,
    difficulty ? `${difficulty} level` : null,
    technical ? "Technical / professional skill course" : "Structured free learning path",
  ].filter(Boolean);

  return {
    recommendedPriceNgn: price,
    reason: reasonParts.join("\n"),
    band,
    estimatedHours: hours,
  };
}

export function resolveFinalCertificatePrice(params: {
  mode: LearnCertificatePricingMode | string | null | undefined;
  recommendedPriceNgn: number | null | undefined;
  fixedPriceNgn: number | null | undefined;
}): number {
  const mode = (params.mode || "automatic").toLowerCase();
  if (mode === "free") return 0;
  if (mode === "fixed") {
    const fixed = Number(params.fixedPriceNgn);
    if (LEARN_CERTIFICATE_PRICE_TIERS.includes(fixed as LearnCertificatePriceTier)) return fixed;
    return snapToLearnCertificateTier(fixed);
  }
  const recommended = Number(params.recommendedPriceNgn);
  if (LEARN_CERTIFICATE_PRICE_TIERS.includes(recommended as LearnCertificatePriceTier)) {
    return recommended;
  }
  return snapToLearnCertificateTier(recommended || 2000);
}

export function pathCertificateOfferableWithMode(path: {
  status?: string | null;
  certificate_enabled?: boolean | null;
  certificate_pricing_mode?: string | null;
  certificate_price_ngn?: number | null;
  certificate_recommended_price_ngn?: number | null;
}) {
  if (path.status !== "published" || path.certificate_enabled !== true) return false;
  const price = resolveFinalCertificatePrice({
    mode: path.certificate_pricing_mode,
    recommendedPriceNgn: path.certificate_recommended_price_ngn,
    fixedPriceNgn: path.certificate_price_ngn,
  });
  return price >= 0 && (path.certificate_pricing_mode === "free" || price > 0);
}
