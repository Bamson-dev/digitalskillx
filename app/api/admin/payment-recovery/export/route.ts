import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { exportRecoveryGroups } from "@/lib/payment-recovery/admin-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COLS = [
  "id", "customer_name", "customer_email", "customer_phone", "product_title", "amount_kobo", "currency",
  "bank_reference", "payment_status", "recovery_status", "payment_method", "failure_reason", "first_attempt_at",
  "failed_at", "abandoned_at", "emails_sent", "last_email_step", "last_email_at", "last_email_status",
  "recovered_via", "recovered_reference", "recovered_amount_kobo", "recovered_after_step", "recovered_at",
];

function cell(v: unknown) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  const sp = request.nextUrl.searchParams;
  const rows = await exportRecoveryGroups({
    q: sp.get("q") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    course: sp.get("course") ?? undefined,
    payment: sp.get("payment") ?? undefined,
    recovery: sp.get("recovery") ?? undefined,
  });
  await logAudit({ action: "payment_recovery_export", targetType: "payment_recovery", metadata: { rows: rows.length } });
  const csv = [COLS.join(","), ...rows.map((r) => COLS.map((c) => cell((r as Record<string, unknown>)[c])).join(","))].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payment-recovery-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
