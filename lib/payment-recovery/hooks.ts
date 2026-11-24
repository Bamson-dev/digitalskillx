import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { secureLog } from "@/lib/secure-log";
import { buildRecoveryDeps } from "./server";
import { markPaidByReference, nudgeVerification, registerCheckoutAttempt } from "./engine";

/**
 * Hooks for the existing checkout and webhook code. Each one is best-effort:
 * it never throws and never changes the result of the payment flow.
 * Capture runs even while PAYMENT_RECOVERY_ENABLED is off, so new checkouts are
 * recorded from deploy day. Emails only go out when the switch is on.
 */

export async function captureCheckoutAttempt(
  admin: SupabaseClient<Database>,
  input: {
    reference: string;
    email: string;
    fullName?: string | null;
    phone?: string | null;
    studentId?: string | null;
    courseId: string;
    productTitle: string;
    amountKobo: number;
  },
) {
  try {
    const work = (async () => {
      const { db, deps } = await buildRecoveryDeps(admin);
      return registerCheckoutAttempt(db, deps, { ...input, source: "checkout" });
    })();
    // Never hold the customer's redirect to Paystack. A late capture still finishes in the background.
    const r = await Promise.race([
      work,
      new Promise<{ ok: false; reason: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, reason: "capture_timeout" }), 4_000),
      ),
    ]);
    if (!r.ok && r.reason !== "invalid_email") {
      secureLog("warn", "payment-recovery", "capture_skipped", { reference: input.reference, reason: r.reason ?? null });
    }
  } catch (err) {
    secureLog("warn", "payment-recovery", "capture_failed", {
      reference: input.reference,
      error: err instanceof Error ? err.message.slice(0, 160) : "error",
    });
  }
}

export async function recoveryOnPaymentSucceeded(
  admin: SupabaseClient<Database>,
  reference: string,
  fallback?: { email: string | null; courseId: string | null; amountKobo: number },
) {
  try {
    const { db, deps } = await buildRecoveryDeps(admin);
    await markPaidByReference(db, deps, reference, fallback);
  } catch (err) {
    secureLog("warn", "payment-recovery", "mark_paid_failed", {
      reference,
      error: err instanceof Error ? err.message.slice(0, 160) : "error",
    });
  }
}

export async function recoveryOnChargeHint(admin: SupabaseClient<Database>, reference: string) {
  try {
    const { db, deps } = await buildRecoveryDeps(admin);
    await nudgeVerification(db, deps, reference);
  } catch {
    // best-effort
  }
}
