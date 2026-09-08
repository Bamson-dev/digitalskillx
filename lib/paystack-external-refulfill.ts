import "server-only";
import { fulfillPaystackExternalCharge } from "@/lib/paystack-external-fulfillment";
import { BUILD_SOFTWARE_WITH_AI_PRODUCT } from "@/lib/paystack-external-products";
import { getPaystackSecretKey } from "@/lib/env-paystack";
import { verifyTransaction } from "@/lib/paystack";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { secureLog } from "@/lib/secure-log";

/**
 * Re-run external Payment Page fulfillment for a Paystack reference.
 * Used to recover buyers who paid but never received enrollment/email
 * (e.g. when webhooks lacked page metadata and were previously ignored).
 */
export async function refulfillPaystackExternalByReference(referenceRaw: string) {
  const reference = referenceRaw.trim();
  if (!reference) {
    return { ok: false as const, error: "Paystack reference is required.", status: 400 };
  }

  const admin = await createAdminClientAsync();
  const verified = await verifyTransaction(reference, admin);
  if (!verified) {
    return {
      ok: false as const,
      error: "Transaction could not be verified with Paystack.",
      status: 404,
    };
  }

  const result = await fulfillPaystackExternalCharge({
    reference,
    webhookEvent: "admin.refulfill",
    webhookData: {
      reference,
      amount: verified.amount,
      currency: verified.currency,
      status: verified.status,
      metadata: verified.metadata as Record<string, unknown>,
      customer: verified.customer,
      page: verified.page,
      plan: verified.plan,
    },
    admin,
  });

  if (!result.handled) {
    secureLog("warn", "paystack/refulfill", "not_external_product", {
      reference,
      amount: verified.amount,
      currency: verified.currency,
    });
    return {
      ok: false as const,
      error: "Verified payment does not match a DigitalSkillX Payment Page product.",
      status: 422,
      amount: verified.amount,
      currency: verified.currency,
    };
  }

  if (!result.ok) {
    return {
      ok: false as const,
      error: result.error,
      status: result.status,
      reference: result.reference,
      permanent: result.permanent,
    };
  }

  return {
    ok: true as const,
    reference: result.reference,
    alreadyFulfilled: result.alreadyFulfilled ?? false,
    productKey: result.productKey,
    courseId: result.courseId,
    studentId: result.studentId,
    customerEmail: verified.customer?.email ?? verified.metadata?.buyer_email ?? null,
  };
}

type PaystackListRow = {
  reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  paid_at?: string;
  customer?: { email?: string };
};

/**
 * Find recent successful Paystack charges for the AI Payment Page amount and fulfill any
 * that are missing enrollment/email.
 */
export async function backfillRecentAiAppPayments(params?: { perPage?: number }) {
  const admin = await createAdminClientAsync();
  const secret = await getPaystackSecretKey(admin);
  const perPage = Math.min(Math.max(params?.perPage ?? 50, 1), 100);
  const product = BUILD_SOFTWARE_WITH_AI_PRODUCT;

  const res = await fetch(
    `https://api.paystack.co/transaction?status=success&perPage=${perPage}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  const json = (await res.json()) as { status?: boolean; data?: PaystackListRow[]; message?: string };
  if (!json.status || !Array.isArray(json.data)) {
    return {
      ok: false as const,
      error: json.message ?? "Could not list Paystack transactions.",
      status: 502,
    };
  }

  const candidates = json.data.filter(
    (row) =>
      row.status === "success" &&
      row.amount === product.expectedAmountKobo &&
      String(row.currency ?? "NGN").toUpperCase() === product.currency &&
      Boolean(row.reference),
  );

  const results: Array<Record<string, unknown>> = [];
  for (const row of candidates) {
    const reference = String(row.reference);
    const fulfilled = await refulfillPaystackExternalByReference(reference);
    results.push({
      reference,
      email: row.customer?.email ?? null,
      paid_at: row.paid_at ?? null,
      ...fulfilled,
    });
  }

  return {
    ok: true as const,
    scanned: json.data.length,
    matchedAmount: candidates.length,
    results,
  };
}
