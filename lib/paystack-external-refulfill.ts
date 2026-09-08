import "server-only";
import { fulfillPaystackExternalCharge } from "@/lib/paystack-external-fulfillment";
import { BUILD_SOFTWARE_WITH_AI_PRODUCT } from "@/lib/paystack-external-products";
import { getPaystackSecretKey } from "@/lib/env-paystack";
import { verifyTransaction, type VerifiedTransaction } from "@/lib/paystack";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { secureLog } from "@/lib/secure-log";

function asVerifiedOverride(raw: unknown): VerifiedTransaction | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const reference = typeof row.reference === "string" ? row.reference.trim() : "";
  const status = typeof row.status === "string" ? row.status : "";
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
  const currency = typeof row.currency === "string" ? row.currency : "";
  if (!reference || status !== "success" || !Number.isFinite(amount) || !currency) {
    return null;
  }

  const customer =
    row.customer && typeof row.customer === "object"
      ? (row.customer as VerifiedTransaction["customer"])
      : undefined;
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, string>)
      : {};
  const page =
    row.page && typeof row.page === "object"
      ? (row.page as VerifiedTransaction["page"])
      : null;
  const plan =
    row.plan && typeof row.plan === "object"
      ? (row.plan as VerifiedTransaction["plan"])
      : null;

  return {
    reference,
    status,
    amount,
    currency,
    metadata,
    customer,
    page,
    plan,
  };
}

/**
 * Re-run external Payment Page fulfillment for a Paystack reference.
 * Used to recover buyers who paid but never received enrollment/email
 * (e.g. when webhooks lacked page metadata and were previously ignored).
 */
export async function refulfillPaystackExternalByReference(
  referenceRaw: string,
  options?: {
    verifiedOverride?: unknown;
    forceEmail?: boolean;
  },
) {
  const reference = referenceRaw.trim();
  if (!reference) {
    return { ok: false as const, error: "Paystack reference is required.", status: 400 };
  }

  const admin = await createAdminClientAsync();
  const override = asVerifiedOverride(options?.verifiedOverride);
  if (override && override.reference !== reference) {
    return {
      ok: false as const,
      error: "Verified override reference does not match request reference.",
      status: 400,
    };
  }

  const verified = override ?? (await verifyTransaction(reference, admin));
  if (!verified) {
    return {
      ok: false as const,
      error: "Transaction could not be verified with Paystack.",
      status: 404,
    };
  }

  const result = await fulfillPaystackExternalCharge({
    reference,
    webhookEvent: override ? "admin.refulfill_override" : "admin.refulfill",
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
    verifiedOverride: verified,
    forceEmail: options?.forceEmail === true,
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
  customer?: { email?: string; first_name?: string; last_name?: string };
  metadata?: Record<string, unknown>;
  page?: { slug?: string; name?: string } | null;
  plan?: { name?: string; plan_code?: string } | null;
};

/**
 * Find recent successful Paystack charges for the AI Payment Page amount and fulfill any
 * that are missing enrollment/email.
 */
export async function backfillRecentAiAppPayments(params?: {
  perPage?: number;
  limit?: number;
  forceEmail?: boolean;
}) {
  const admin = await createAdminClientAsync();
  const secret = await getPaystackSecretKey(admin);
  const perPage = Math.min(Math.max(params?.perPage ?? 50, 1), 100);
  const limit = Math.min(Math.max(params?.limit ?? 10, 1), 25);
  const product = BUILD_SOFTWARE_WITH_AI_PRODUCT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let json: { status?: boolean; data?: PaystackListRow[]; message?: string };
  try {
    const res = await fetch(
      `https://api.paystack.co/transaction?status=success&perPage=${perPage}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    json = (await res.json()) as {
      status?: boolean;
      data?: PaystackListRow[];
      message?: string;
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Paystack list timed out.",
      status: 504,
    };
  } finally {
    clearTimeout(timer);
  }

  if (!json.status || !Array.isArray(json.data)) {
    return {
      ok: false as const,
      error: json.message ?? "Could not list Paystack transactions.",
      status: 502,
    };
  }

  const candidates = json.data
    .filter(
      (row) =>
        row.status === "success" &&
        row.amount === product.expectedAmountKobo &&
        String(row.currency ?? "NGN").toUpperCase() === product.currency &&
        Boolean(row.reference),
    )
    .slice(0, limit);

  const results: Array<Record<string, unknown>> = [];
  for (const row of candidates) {
    const reference = String(row.reference);
    const override: VerifiedTransaction = {
      reference,
      status: "success",
      amount: product.expectedAmountKobo,
      currency: product.currency,
      metadata: (row.metadata as Record<string, string>) ?? {},
      customer: row.customer,
      page: row.page ?? null,
      plan: row.plan ?? null,
    };
    const fulfilled = await refulfillPaystackExternalByReference(reference, {
      verifiedOverride: override,
      forceEmail: params?.forceEmail === true,
    });
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
