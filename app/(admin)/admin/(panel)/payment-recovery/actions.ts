"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { buildRecoveryDeps } from "@/lib/payment-recovery/server";
import {
  addNote,
  confirmBankTransfer,
  markBankTransferClaimed,
  registerCheckoutAttempt,
  rejectBankTransfer,
  sendManualRecoveryEmail,
  verifyGroupNow,
} from "@/lib/payment-recovery/engine";
import { historicalCandidates } from "@/lib/payment-recovery/admin-data";

function idFrom(formData: FormData) {
  const id = String(formData.get("group_id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid order id.");
  return id;
}

function back(id: string, msg: string, ok = true): never {
  revalidatePath(`/admin/payment-recovery/${id}`);
  redirect(`/admin/payment-recovery/${id}?${ok ? "msg" : "err"}=${encodeURIComponent(msg)}`);
}

function nairaToKoboStrict(raw: string) {
  const clean = raw.replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return NaN;
  return Math.round(Number(clean) * 100);
}

export async function verifyNowAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  const { db, deps } = await buildRecoveryDeps();
  const r = await verifyGroupNow(db, deps, id);
  await logAudit({ action: "payment_recovery_verify", targetType: "payment_recovery_group", targetId: id, metadata: { by: admin.id } });
  back(id, r.ok ? `Checked ${r.checked} Paystack reference(s).` : `Verification failed: ${r.error}`, r.ok);
}

export async function resendEmailAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  const { db, deps } = await buildRecoveryDeps();
  const r = await sendManualRecoveryEmail(db, deps, id, admin.id);
  await logAudit({ action: "payment_recovery_resend_email", targetType: "payment_recovery_group", targetId: id, metadata: { ok: r.ok } });
  back(id, r.ok ? "Recovery email sent." : r.error ?? "Not sent.", r.ok);
}

export async function markClaimedAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  const note = String(formData.get("note") ?? "").slice(0, 500);
  const { db, deps } = await buildRecoveryDeps();
  const r = await markBankTransferClaimed(db, deps, id, admin.id, note);
  await logAudit({ action: "payment_recovery_transfer_claimed", targetType: "payment_recovery_group", targetId: id });
  back(id, r.ok ? "Marked as bank transfer pending. Reminders paused. No access granted." : r.error ?? "Failed.", r.ok);
}

export async function confirmTransferAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  const received = nairaToKoboStrict(String(formData.get("received_naira") ?? ""));
  const bankRef = String(formData.get("bank_transaction_ref") ?? "").slice(0, 120);
  const notes = String(formData.get("notes") ?? "").slice(0, 1000);
  const checked = formData.get("credit_checked") === "on";
  if (!checked) back(id, "Tick the box to confirm you saw the credit in the Wema Bank account.", false);
  if (!Number.isFinite(received)) back(id, "Enter the amount received in naira, for example 14999.", false);
  const { db, deps } = await buildRecoveryDeps();
  const r = await confirmBankTransfer(db, deps, {
    groupId: id,
    receivedKobo: received,
    bankTransactionRef: bankRef,
    notes,
    actorId: admin.id,
  });
  await logAudit({
    action: r.ok ? "payment_recovery_transfer_confirmed" : "payment_recovery_transfer_not_confirmed",
    targetType: "payment_recovery_group",
    targetId: id,
    metadata: { received_kobo: received, bank_transaction_ref: bankRef, status: r.status ?? null },
  });
  back(id, r.ok ? "Transfer confirmed. Customer enrolled through the normal access flow." : r.error ?? "Not confirmed.", r.ok);
}

export async function rejectTransferAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);
  if (!notes) back(id, "Add a reason for rejecting the transfer claim.", false);
  const { db, deps } = await buildRecoveryDeps();
  const r = await rejectBankTransfer(db, deps, { groupId: id, notes, actorId: admin.id });
  await logAudit({ action: "payment_recovery_transfer_rejected", targetType: "payment_recovery_group", targetId: id, metadata: { notes } });
  back(id, r.ok ? "Transfer claim rejected. Order is back to unpaid." : r.error ?? "Failed.", r.ok);
}

export async function addNoteAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = idFrom(formData);
  const text = String(formData.get("note") ?? "");
  const { db } = await buildRecoveryDeps();
  const r = await addNote(db, id, text, admin.id);
  await logAudit({ action: "payment_recovery_note", targetType: "payment_recovery_group", targetId: id });
  back(id, r.ok ? "Note added." : "Note is empty.", r.ok);
}

export async function queueHistoricalAction(formData: FormData) {
  const admin = await requireAdmin();
  const days = Math.min(Math.max(Number(formData.get("days") ?? 30) || 30, 1), 90);
  const limit = Math.min(Math.max(Number(formData.get("limit") ?? 20) || 20, 1), 100);
  const confirm = String(formData.get("confirm") ?? "").trim().toUpperCase();
  if (confirm !== "QUEUE") {
    redirect(`/admin/payment-recovery/historical?days=${days}&err=${encodeURIComponent("Type QUEUE to confirm.")}`);
  }
  const candidates = (await historicalCandidates(days)).filter((c) => c.verdict === "eligible").slice(0, limit);
  const { db, deps } = await buildRecoveryDeps();
  let queued = 0;
  for (const c of candidates) {
    const r = await registerCheckoutAttempt(db, deps, {
      reference: c.reference,
      email: c.email!,
      fullName: c.fullName,
      studentId: c.studentId,
      courseId: c.courseId,
      productTitle: c.courseTitle,
      amountKobo: c.amountKobo,
      source: "historical",
    });
    if (r.ok) queued += 1;
  }
  await logAudit({
    action: "payment_recovery_historical_batch",
    targetType: "payment_recovery",
    metadata: { days, limit, queued, by: admin.id },
  });
  revalidatePath("/admin/payment-recovery/historical");
  redirect(
    `/admin/payment-recovery/historical?days=${days}&msg=${encodeURIComponent(
      `${queued} order(s) queued. Each is re-verified with Paystack before any email.`,
    )}`,
  );
}
