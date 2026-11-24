/**
 * Recovery reporting. Pure.
 *
 * Unit of counting: one "order" = one payment_recovery_groups row = one customer email
 * + one course while the order is open. Every Paystack reference the customer tries
 * for that course (first checkout, retries, recovery links) is an attempt inside it,
 * so five card declines count as one failed order, not five.
 *
 * - Checkout completion rate = paid orders / all orders.
 * - Recovery rate = recovered orders / orders that failed or were abandoned.
 * - Recovered order = paid (Paystack verified or admin-confirmed bank transfer)
 *   after at least one recovery email went out.
 * - Recovery revenue = sum of verified amounts on recovered orders only.
 *   Pending bank transfers and customer receipts are never counted.
 */

export type AnalyticsGroup = {
  course_id: string | null;
  product_title: string;
  payment_status: string;
  recovery_status: string;
  failed_at: string | null;
  abandoned_at: string | null;
  emails_sent: number;
  recovered_via: string | null;
  recovered_amount_kobo: number | null;
  recovered_after_step: string | null;
};

export type AnalyticsMessage = { status: string };

const PAID = new Set(["successful", "bank_transfer_confirmed"]);

function rate(n: number, d: number) {
  return d > 0 ? n / d : 0;
}

export function computeRecoveryAnalytics(groups: AnalyticsGroup[], messages: AnalyticsMessage[]) {
  const started = groups.length;
  const paid = groups.filter((g) => PAID.has(g.payment_status));
  const failed = groups.filter((g) => g.failed_at);
  const abandoned = groups.filter((g) => !g.failed_at && g.abandoned_at);
  const eligible = groups.filter((g) => g.failed_at || g.abandoned_at);
  const recovered = groups.filter((g) => g.recovery_status === "recovered" && PAID.has(g.payment_status));
  const pending = groups.filter((g) => ["initiated", "awaiting_payment", "pending", "processing"].includes(g.payment_status));
  const bankPending = groups.filter((g) => g.payment_status === "bank_transfer_pending");
  const bankConfirmed = groups.filter((g) => g.payment_status === "bank_transfer_confirmed");
  const emailed = groups.filter((g) => g.emails_sent > 0);

  const sentStatuses = new Set(["sent", "delivered", "delivery_delayed", "bounced", "complained"]);
  const emailsSent = messages.filter((m) => sentStatuses.has(m.status)).length;
  const emailsDelivered = messages.filter((m) => m.status === "delivered").length;
  const emailsBounced = messages.filter((m) => m.status === "bounced" || m.status === "complained").length;

  const revenueKobo = recovered.reduce((s, g) => s + (g.recovered_amount_kobo ?? 0), 0);
  const bankRevenueKobo = bankConfirmed.reduce((s, g) => s + (g.recovered_amount_kobo ?? 0), 0);

  const byProduct = new Map<string, { title: string; started: number; lost: number; recovered: number; revenueKobo: number }>();
  for (const g of groups) {
    const key = g.course_id ?? g.product_title;
    const row = byProduct.get(key) ?? { title: g.product_title, started: 0, lost: 0, recovered: 0, revenueKobo: 0 };
    row.started += 1;
    if (g.failed_at || g.abandoned_at) row.lost += 1;
    if (g.recovery_status === "recovered" && PAID.has(g.payment_status)) {
      row.recovered += 1;
      row.revenueKobo += g.recovered_amount_kobo ?? 0;
    }
    byProduct.set(key, row);
  }
  const products = [...byProduct.values()].map((p) => ({
    ...p,
    abandonmentRate: rate(p.lost, p.started),
    recoveryRate: rate(p.recovered, p.lost),
  }));

  const byStep: Record<string, number> = {};
  for (const g of recovered) {
    const step = g.recovered_after_step ?? "unknown";
    byStep[step] = (byStep[step] ?? 0) + 1;
  }

  return {
    started,
    successful: paid.length,
    failed: failed.length,
    abandoned: abandoned.length,
    pending: pending.length,
    eligible: eligible.length,
    recovered: recovered.length,
    customersEmailed: emailed.length,
    emailsSent,
    emailsDelivered,
    emailsBounced,
    bankPending: bankPending.length,
    bankConfirmed: bankConfirmed.length,
    revenueKobo,
    bankRevenueKobo,
    completionRate: rate(paid.length, started),
    recoveryRate: rate(recovered.length, eligible.length),
    products: products.sort((a, b) => b.abandonmentRate - a.abandonmentRate),
    byStep,
  };
}
