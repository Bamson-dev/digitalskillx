import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { formatNaira, readRecoveryConfig } from "@/lib/payment-recovery/config";
import {
  listRecoveryGroups,
  PAGE_SIZE,
  PAYMENT_STATUSES,
  RECOVERY_STATUSES,
  recoveryCourses,
  recoveryOverview,
  type RecoveryFilters,
} from "@/lib/payment-recovery/admin-data";

export const metadata: Metadata = { title: "Payment recovery" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function lagos(ts: unknown) {
  if (typeof ts !== "string") return "—";
  return new Date(ts).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
}

function qs(sp: SP, patch: SP) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  return p.toString();
}

export default async function PaymentRecoveryPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const filters: RecoveryFilters = {
    q: searchParams.q,
    from: searchParams.from,
    to: searchParams.to,
    course: searchParams.course,
    payment: searchParams.payment,
    recovery: searchParams.recovery,
    page: Number(searchParams.page ?? 1) || 1,
  };
  const cfg = readRecoveryConfig();
  const [{ rows, total, page, error }, overview, courses] = await Promise.all([
    listRecoveryGroups(filters),
    recoveryOverview(filters),
    recoveryCourses(),
  ]);
  const s = overview.stats;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cards: Array<[string, string]> = s
    ? [
        ["Checkout orders", String(s.started)],
        ["Successful payments", String(s.successful)],
        ["Failed", String(s.failed)],
        ["Abandoned", String(s.abandoned)],
        ["Pending", String(s.pending)],
        ["Recoveries completed", String(s.recovered)],
        ["Recovery emails sent", String(s.emailsSent)],
        ["Emails delivered", String(s.emailsDelivered)],
        ["Emails bounced", String(s.emailsBounced)],
        ["Transfers awaiting confirmation", String(s.bankPending)],
        ["Transfers confirmed", String(s.bankConfirmed)],
        ["Revenue recovered (verified)", formatNaira(s.revenueKobo)],
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payment recovery</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Failed and abandoned Paystack checkouts. Each row is one order (one customer email + one course). Every
            Paystack reference they tried is inside it. Revenue counts only Paystack-verified payments and
            admin-confirmed bank transfers after a recovery email.
          </p>
          <p className={`mt-2 text-sm font-semibold ${cfg.enabled ? "text-green-700" : "text-amber-700"}`}>
            Automatic recovery is {cfg.enabled ? "ON" : "OFF (capture only, no emails)"}. Set PAYMENT_RECOVERY_ENABLED to change.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/payment-recovery/historical" className="rounded-lg border border-app px-3 py-2 text-sm font-medium">
            Historical review
          </Link>
          <a href={`/api/admin/payment-recovery/export?${qs(searchParams, { page: undefined })}`} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">
            Export CSV
          </a>
        </div>
      </div>

      {overview.error ? (
        <Card><p className="text-sm text-brand">Recovery tables are not available: {overview.error}. Apply migration 0058_payment_recovery.sql.</p></Card>
      ) : null}

      {s ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-app bg-card p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <form className="grid gap-2 md:grid-cols-7" method="get">
          <input name="q" defaultValue={searchParams.q ?? ""} placeholder="Name, email, phone, DSX-REC ref" className="h-10 rounded-lg border border-app px-3 text-sm md:col-span-2" />
          <input type="date" name="from" defaultValue={searchParams.from ?? ""} className="h-10 rounded-lg border border-app px-2 text-sm" aria-label="From" />
          <input type="date" name="to" defaultValue={searchParams.to ?? ""} className="h-10 rounded-lg border border-app px-2 text-sm" aria-label="To" />
          <select name="course" defaultValue={searchParams.course ?? ""} className="h-10 rounded-lg border border-app px-2 text-sm">
            <option value="">All products</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <select name="payment" defaultValue={searchParams.payment ?? ""} className="h-10 rounded-lg border border-app px-2 text-sm">
            <option value="">Any payment status</option>
            {PAYMENT_STATUSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select name="recovery" defaultValue={searchParams.recovery ?? ""} className="h-10 rounded-lg border border-app px-2 text-sm">
            <option value="">Any recovery status</option>
            {RECOVERY_STATUSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="h-10 rounded-lg bg-ink px-3 text-sm font-semibold text-white md:col-span-7 md:w-32">Filter</button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        {error ? <p className="p-4 text-sm text-brand">{error}</p> : null}
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-app text-xs text-muted">
            <tr>
              {["Customer", "Phone", "Product", "Price", "Payment ref", "Payment", "Recovery", "Checkout", "Last email", "Email status", "Recovered", "Method"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const r = g as unknown as Record<string, unknown>;
              return (
                <tr key={g.id} className="border-b border-app/60 align-top">
                  <td className="px-3 py-2">
                    <Link href={`/admin/payment-recovery/${g.id}`} className="font-medium hover:text-brand">{g.customer_name || "—"}</Link>
                    <div className="text-xs text-muted">{g.customer_email}</div>
                  </td>
                  <td className="px-3 py-2">{g.customer_phone ?? "—"}</td>
                  <td className="px-3 py-2">{g.product_title}</td>
                  <td className="px-3 py-2">{formatNaira(g.amount_kobo)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{g.bank_reference}</td>
                  <td className="px-3 py-2">{g.payment_status}</td>
                  <td className="px-3 py-2">{g.recovery_status}</td>
                  <td className="px-3 py-2 text-xs">{lagos(g.first_attempt_at)}</td>
                  <td className="px-3 py-2 text-xs">{g.last_email_step ? `${g.last_email_step} · ${lagos(g.last_email_at)}` : "—"}</td>
                  <td className="px-3 py-2">{String(r.last_email_status ?? "—")}</td>
                  <td className="px-3 py-2">{g.recovery_status === "recovered" ? formatNaira(Number(r.recovered_amount_kobo ?? 0)) : "—"}</td>
                  <td className="px-3 py-2">{String(r.payment_method ?? "—")}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr><td colSpan={12} className="px-3 py-6 text-center text-muted">No checkout orders match these filters.</td></tr>
            ) : null}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-muted">{total} order(s) · page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={`?${qs(searchParams, { page: String(page - 1) })}`} className="rounded border border-app px-2 py-1">Previous</Link> : null}
            {page < pages ? <Link href={`?${qs(searchParams, { page: String(page + 1) })}`} className="rounded border border-app px-2 py-1">Next</Link> : null}
          </div>
        </div>
      </Card>

      {s ? (
        <Card>
          <CardHeader
            title="Recovery analytics"
            description={`Completion rate ${pct(s.completionRate)} (paid orders ÷ all orders). Recovery rate ${pct(s.recoveryRate)} (recovered ÷ failed or abandoned orders). Customers emailed: ${s.customersEmailed}. Bank transfer revenue confirmed: ${formatNaira(s.bankRevenueKobo)}.`}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-1">Product</th><th>Orders</th><th>Abandon/fail</th><th>Recovered</th><th>Recovery rate</th><th>Revenue</th></tr></thead>
              <tbody>
                {s.products.map((p) => (
                  <tr key={p.title} className="border-t border-app/60">
                    <td className="py-1">{p.title}</td><td>{p.started}</td><td>{pct(p.abandonmentRate)}</td><td>{p.recovered}</td><td>{pct(p.recoveryRate)}</td><td>{formatNaira(p.revenueKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-1">Recovered after email</th><th>Orders</th></tr></thead>
              <tbody>
                {Object.entries(s.byStep).map(([k, v]) => (
                  <tr key={k} className="border-t border-app/60"><td className="py-1">{k}</td><td>{v}</td></tr>
                ))}
                {Object.keys(s.byStep).length === 0 ? <tr><td className="py-1 text-muted" colSpan={2}>No recovered orders yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
