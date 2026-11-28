import { configuredExternalCourseId, identifyPaystackExternalProduct } from "@/lib/paystack-external-products";
import { registerCheckoutAttempt } from "./engine";
import type { Db, RecoveryDeps } from "./engine";

export type PulledRow = {
  reference?: string;
  status?: string;
  created_at?: string;
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
    const status = String(row.status ?? "").toLowerCase();
    const reference = String(row.reference ?? "").trim();
    const email = String(row.customer?.email ?? "").trim().toLowerCase();
    if (status !== "failed" && status !== "abandoned") {
      summary.skipped += 1;
      continue;
    }
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
      courseId: configuredExternalCourseId(product),
      productType: "course",
      productId: configuredExternalCourseId(product),
      productContext: {
        external_product_key: product.key,
        external_payment_page_slug: row.page?.slug ?? null,
      },
      attemptCreatedAt: row.created_at ?? null,
      verifyImmediately: true,
      productTitle: product.title,
      amountKobo: product.expectedAmountKobo,
      source: "payment_page",
    });
    if (r.ok && r.reason !== "already_tracked") summary.registered += 1;
    else summary.skipped += 1;
  }
  return summary;
}
