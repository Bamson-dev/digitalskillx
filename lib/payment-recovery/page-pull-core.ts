import { identifyPaystackExternalProduct } from "@/lib/paystack-external-products";
import { registerCheckoutAttempt } from "./engine";
import type { Db, RecoveryDeps } from "./engine";

export type PulledRow = {
  reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  customer?: { email?: string; first_name?: string; last_name?: string; phone?: string };
  metadata?: Record<string, unknown> | null;
  page?: { slug?: string; name?: string } | null;
  plan?: { name?: string; plan_code?: string } | null;
};

/** Register failed/abandoned Paystack Payment Page rows that clearly belong to a catalog product. */
export async function registerPulledRows(db: Db, deps: RecoveryDeps, rows: PulledRow[]) {
  const summary = { listed: 0, registered: 0, skipped: 0 };
  for (const row of rows) {
    summary.listed += 1;
    const reference = String(row.reference ?? "");
    const email = String(row.customer?.email ?? "").trim().toLowerCase();
    const product = identifyPaystackExternalProduct({
      // The identity rules only accept "success". Used here purely to name the product, never as payment proof.
      verified: {
        amount: row.amount ?? 0,
        currency: row.currency ?? "NGN",
        status: "success",
        metadata: (row.metadata ?? {}) as Record<string, string>,
        page: row.page ?? null,
        plan: row.plan ?? null,
      },
    });
    if (!reference || !email || !product) {
      summary.skipped += 1;
      continue;
    }
    const name = [row.customer?.first_name, row.customer?.last_name].filter(Boolean).join(" ").trim();
    const r = await registerCheckoutAttempt(db, deps, {
      reference,
      email,
      fullName: name || null,
      phone: row.customer?.phone ?? null,
      courseId: product.defaultCourseId,
      productTitle: product.title,
      amountKobo: product.expectedAmountKobo,
      source: "checkout",
    });
    if (r.ok) summary.registered += 1;
    else summary.skipped += 1;
  }
  return summary;
}
