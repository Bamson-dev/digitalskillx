/**
 * Maps a Paystack verification result to a recovery attempt status. Pure.
 *
 * Paystack transaction statuses (verify endpoint): success, failed, abandoned,
 * ongoing, pending, processing, queued, reversed. An unknown or unreachable
 * result never becomes "failed": the attempt stays unresolved and is retried.
 */

export type AttemptStatus =
  | "initiated"
  | "awaiting_payment"
  | "pending"
  | "processing"
  | "successful"
  | "failed"
  | "abandoned"
  | "reversed"
  | "expired";

export type VerifyOutcome =
  | { kind: "ok"; status: string; amount?: number; currency?: string; gatewayResponse?: string | null; channel?: string | null }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export const UNRESOLVED_ATTEMPT: readonly AttemptStatus[] = [
  "initiated",
  "awaiting_payment",
  "pending",
  "processing",
];

export type Classification =
  | { next: "successful" }
  | { next: "failed"; reason: string }
  | { next: "abandoned"; reason: string }
  | { next: "reversed" }
  | { next: "keep"; status: AttemptStatus; transient: boolean }
  | { next: "amount_mismatch" };

/**
 * @param ageMs time since the checkout attempt was created
 * @param abandonAfterMs inactivity period before an unpaid checkout counts as abandoned
 */
export function classifyVerification(params: {
  outcome: VerifyOutcome;
  ageMs: number;
  abandonAfterMs: number;
  expectedAmountKobo: number;
  expectedCurrency: string;
}): Classification {
  const { outcome, ageMs, abandonAfterMs } = params;
  if (outcome.kind === "error") return { next: "keep", status: "pending", transient: true };
  if (outcome.kind === "not_found") {
    // Paystack has no transaction for this reference: the customer never reached payment.
    return ageMs >= abandonAfterMs
      ? { next: "abandoned", reason: "checkout_not_started" }
      : { next: "keep", status: "awaiting_payment", transient: false };
  }
  const status = outcome.status.toLowerCase();
  switch (status) {
    case "success": {
      const amountOk = outcome.amount === params.expectedAmountKobo;
      const currencyOk =
        (outcome.currency ?? params.expectedCurrency).toUpperCase() === params.expectedCurrency.toUpperCase();
      return amountOk && currencyOk ? { next: "successful" } : { next: "amount_mismatch" };
    }
    case "failed":
      return { next: "failed", reason: outcome.gatewayResponse?.trim() || "payment_failed" };
    case "reversed":
      return { next: "reversed" };
    case "abandoned":
      return ageMs >= abandonAfterMs
        ? { next: "abandoned", reason: "checkout_abandoned" }
        : { next: "keep", status: "awaiting_payment", transient: false };
    case "processing":
      return { next: "keep", status: "processing", transient: false };
    case "ongoing":
    case "pending":
    case "queued":
    default:
      return { next: "keep", status: "pending", transient: false };
  }
}

/** Backoff for unreachable Paystack: 5m, 10m, 20m ... capped at 6h. */
export function verifyBackoffMs(failures: number, baseMs: number) {
  const capped = Math.min(Math.max(failures, 0), 7);
  return Math.min(baseMs * 2 ** capped, 6 * 60 * 60 * 1000);
}

/** Pending attempts are checked often at first, then less. */
export function pendingRecheckMs(ageMs: number, baseMs: number) {
  if (ageMs < 60 * 60 * 1000) return baseMs;
  if (ageMs < 24 * 60 * 60 * 1000) return Math.max(baseMs, 30 * 60 * 1000);
  return Math.max(baseMs, 6 * 60 * 60 * 1000);
}
