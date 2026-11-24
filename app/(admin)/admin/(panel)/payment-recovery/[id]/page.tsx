import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { RECOVERY_BUSINESS, formatNaira, whatsappLink } from "@/lib/payment-recovery/config";
import { recoveryGroupDetail } from "@/lib/payment-recovery/admin-data";
import {
  addNoteAction,
  confirmTransferAction,
  markClaimedAction,
  rejectTransferAction,
  resendEmailAction,
  verifyNowAction,
} from "../actions";

export const metadata: Metadata = { title: "Payment recovery order" };
export const dynamic = "force-dynamic";

function lagos(ts: unknown) {
  if (typeof ts !== "string") return "—";
  return new Date(ts).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
}

const btn = "rounded-lg border border-app px-3 py-2 text-sm font-medium hover:bg-black/5";
const input = "h-10 w-full rounded-lg border border-app px-3 text-sm";

export default async function RecoveryDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { msg?: string; err?: string };
}) {
  await requireAdmin();
  const detail = await recoveryGroupDetail(params.id);
  if (!detail) notFound();
  const { group: g, attempts, messages, events, bank, suppression } = detail;
  const open = Boolean(g.is_open);
  const paid = g.payment_status === "successful" || g.payment_status === "bank_transfer_confirmed";
  const hidden = <input type="hidden" name="group_id" value={g.id} />;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/payment-recovery" className="text-sm text-muted hover:text-brand">← Payment recovery</Link>
        <h1 className="mt-1 text-2xl font-bold">{g.customer_name || g.customer_email}</h1>
        <p className="text-sm text-muted">
          {g.product_title} · {formatNaira(g.amount_kobo)} · payment <strong>{g.payment_status}</strong> · recovery <strong>{g.recovery_status}</strong>
        </p>
        {searchParams.msg ? <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-800">{searchParams.msg}</p> : null}
        {searchParams.err ? <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-800">{searchParams.err}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Customer" />
          <dl className="space-y-1 text-sm">
            <div><dt className="text-muted">Email</dt><dd>{g.customer_email}</dd></div>
            <div><dt className="text-muted">Phone</dt><dd>{g.customer_phone ?? "—"}</dd></div>
            <div><dt className="text-muted">Suppression</dt><dd>{suppression ? String(suppression.reason) : "none"}</dd></div>
            <div><dt className="text-muted">Checkout started</dt><dd>{lagos(g.first_attempt_at)}</dd></div>
          </dl>
          <a href={whatsappLink({ productTitle: g.product_title, amountKobo: g.amount_kobo, bankReference: g.bank_reference })} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-green-700">
            Open WhatsApp message template
          </a>
        </Card>
        <Card>
          <CardHeader title="Bank transfer setup" />
          <p className="text-sm text-muted">
            Customer bank transfer is disabled until the Wema account name is confirmed. Paystack checkout and WhatsApp support remain available.
          </p>
        </Card>
        <Card>
          <CardHeader title="Actions" />
          <div className="flex flex-wrap gap-2">
            <form action={verifyNowAction}>{hidden}<button className={btn}>Re-verify with Paystack</button></form>
            {open && !paid ? <form action={resendEmailAction}>{hidden}<button className={btn}>Resend recovery email</button></form> : null}
            {open && !paid && RECOVERY_BUSINESS.bankTransferEnabled && g.payment_status !== "bank_transfer_pending" ? (
              <form action={markClaimedAction}>{hidden}<button className={btn}>Customer says they transferred</button></form>
            ) : null}
          </div>
          <form action={addNoteAction} className="mt-3 space-y-2">
            {hidden}
            <textarea name="note" rows={2} placeholder="Internal note" className="w-full rounded-lg border border-app p-2 text-sm" />
            <button className={btn}>Add note</button>
          </form>
        </Card>
      </div>

      {open && !paid ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Confirm bank transfer"
              description="Only after you see the credit in the Wema Bank statement. Screenshots, receipts and WhatsApp claims are not confirmation. The amount must match exactly."
            />
            <form action={confirmTransferAction} className="space-y-2">
              {hidden}
              <input name="received_naira" required inputMode="decimal" placeholder={`Amount received in naira, e.g. ${g.amount_kobo / 100}`} className={input} />
              <input name="bank_transaction_ref" required placeholder="Bank transaction reference / session ID" className={input} />
              <textarea name="notes" rows={2} placeholder="Verification notes (who checked, statement line)" className="w-full rounded-lg border border-app p-2 text-sm" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="credit_checked" /> I saw this credit in the bank account</label>
              <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Confirm transfer and grant access</button>
            </form>
          </Card>
          <Card>
            <CardHeader title="Reject transfer claim" description="Use when the credit is not in the account. The order goes back to unpaid and reminders resume." />
            <form action={rejectTransferAction} className="space-y-2">
              {hidden}
              <textarea name="notes" required rows={3} placeholder="Reason" className="w-full rounded-lg border border-app p-2 text-sm" />
              <button className={btn}>Reject claim</button>
            </form>
          </Card>
        </div>
      ) : null}

      <Card className="overflow-x-auto">
        <CardHeader title="Paystack references and verification" />
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th>Reference</th><th>Source</th><th>Status</th><th>Paystack</th><th>Gateway response</th><th>Checks</th><th>Last verified</th><th>Created</th></tr></thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={String(a.id)} className="border-t border-app/60">
                <td className="py-1 font-mono text-xs">{String(a.reference)}</td><td>{String(a.source)}</td><td>{String(a.status)}</td>
                <td>{String(a.paystack_status ?? "—")}</td><td>{String(a.gateway_response ?? "—")}</td>
                <td>{String(a.verify_count)}{Number(a.verify_failures) ? ` (${a.verify_failures} unreachable)` : ""}</td>
                <td>{lagos(a.last_verified_at)}</td><td>{lagos(a.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-x-auto">
          <CardHeader title="Recovery emails" />
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th>Step</th><th>Status</th><th>Last event</th><th>Sent</th><th>Error</th></tr></thead>
            <tbody>
              {messages.map((m) => (
                <tr key={String(m.id)} className="border-t border-app/60">
                  <td className="py-1">{String(m.step)}{Number(m.manual_seq) ? ` #${m.manual_seq}` : ""}</td><td>{String(m.status)}</td>
                  <td>{String(m.last_event ?? "—")}</td><td>{lagos(m.sent_at)}</td><td className="text-xs">{String(m.error ?? "")}</td>
                </tr>
              ))}
              {messages.length === 0 ? <tr><td colSpan={5} className="py-2 text-muted">No recovery email yet.</td></tr> : null}
            </tbody>
          </table>
        </Card>
        <Card className="overflow-x-auto">
          <CardHeader title="Bank transfer records" />
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th>Status</th><th>Expected</th><th>Received</th><th>Bank ref</th><th>When</th></tr></thead>
            <tbody>
              {bank.map((b) => (
                <tr key={String(b.id)} className="border-t border-app/60">
                  <td className="py-1">{String(b.status)}</td><td>{formatNaira(Number(b.expected_amount_kobo))}</td><td>{formatNaira(Number(b.received_amount_kobo))}</td>
                  <td className="text-xs">{String(b.bank_transaction_ref)}</td><td>{lagos(b.created_at)}</td>
                </tr>
              ))}
              {bank.length === 0 ? <tr><td colSpan={5} className="py-2 text-muted">None.</td></tr> : null}
            </tbody>
          </table>
        </Card>
      </div>

      <Card>
        <CardHeader title="Timeline" description="Status changes, verification results, emails, delivery events, notes and admin actions." />
        <ol className="space-y-1 text-sm">
          {events.map((e) => (
            <li key={String(e.id)} className="flex gap-3 border-t border-app/60 py-1">
              <span className="w-40 shrink-0 text-xs text-muted">{lagos(e.created_at)}</span>
              <span className="font-medium">{String(e.kind)}</span>
              <span className="truncate text-xs text-muted">{JSON.stringify(e.detail ?? {})}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
