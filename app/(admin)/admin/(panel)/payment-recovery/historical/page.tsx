import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { formatNaira, readRecoveryConfig } from "@/lib/payment-recovery/config";
import { historicalCandidates } from "@/lib/payment-recovery/admin-data";
import { queueHistoricalAction } from "../actions";

export const metadata: Metadata = { title: "Historical payment recovery" };
export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  eligible: "Eligible",
  already_paid: "Already paid / enrolled",
  prior_reminder: "Already got the old abandon reminder",
  suppressed: "Bounced, suppressed or opted out",
  no_email: "No valid email",
  duplicate: "Duplicate attempt (same email + course)",
  already_tracked: "Already in recovery",
};

export default async function HistoricalRecoveryPage({ searchParams }: { searchParams: { days?: string; msg?: string; err?: string } }) {
  await requireAdmin();
  const days = Math.min(Math.max(Number(searchParams.days ?? 30) || 30, 1), 90);
  const rows = await historicalCandidates(days);
  const counts: Record<string, number> = {};
  rows.forEach((r) => (counts[r.verdict] = (counts[r.verdict] ?? 0) + 1));
  const enabled = readRecoveryConfig().enabled;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/payment-recovery" className="text-sm text-muted hover:text-brand">← Payment recovery</Link>
        <h1 className="mt-1 text-2xl font-bold">Historical checkout review</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Pending and failed DigitalSkillX course checkouts from the last {days} days (older than 1 hour). Nothing here is emailed
          automatically. Queued orders are first re-verified with Paystack; only confirmed failed or abandoned ones get the recovery sequence.
          Paystack Payment Page sales (paystack.shop) are not listed: they have their own reconcile job.
        </p>
        {searchParams.msg ? <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-800">{searchParams.msg}</p> : null}
        {searchParams.err ? <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-800">{searchParams.err}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(LABELS).map(([k, label]) => (
          <div key={k} className="rounded-xl border border-app bg-card p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xl font-bold">{counts[k] ?? 0}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Start a one-time historical batch"
          description={enabled ? "Recovery is ON, so queued orders will be emailed after verification." : "Recovery is OFF. Queued orders are verified and recorded, but no email goes out until you enable it."}
        />
        <form action={queueHistoricalAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="days" value={days} />
          <label className="text-sm">Batch limit<input name="limit" type="number" min={1} max={100} defaultValue={20} className="ml-2 h-10 w-24 rounded-lg border border-app px-2" /></label>
          <label className="text-sm">Type QUEUE<input name="confirm" className="ml-2 h-10 w-28 rounded-lg border border-app px-2" /></label>
          <button className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white">Queue eligible orders</button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-app text-xs text-muted"><tr><th className="px-3 py-2">Date</th><th>Email</th><th>Course</th><th>Amount</th><th>Status</th><th>Reference</th><th>Verdict</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.transactionId} className="border-b border-app/60">
                <td className="px-3 py-2 text-xs">{new Date(r.createdAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}</td>
                <td>{r.email ?? "—"}</td><td>{r.courseTitle}</td><td>{formatNaira(r.amountKobo)}</td><td>{r.status}</td>
                <td className="font-mono text-xs">{r.reference}</td><td>{LABELS[r.verdict]}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">No historical pending or failed course checkouts in this window.</td></tr> : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
