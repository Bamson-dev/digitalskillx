import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { readPendingCheckoutDetails } from "@/lib/guest-checkout";
import { sendCheckoutAbandonReminderIfNeeded } from "@/lib/system-email-triggers";
import { recordProductEvent } from "@/lib/record-product-event";
import { runAutomations } from "@/lib/automation";
import { siteUrl } from "@/lib/org";
import { isMissingRelationError } from "@/lib/schema-guard";
import { nudgeWebinarFollowupFromCron } from "@/lib/webinar-followup/live-drain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_LIMIT = 50;
const MIN_AGE_MS = 45 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Send one soft checkout-abandon reminder for stale pending transactions.
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();

  const now = Date.now();
  const olderThan = new Date(now - MIN_AGE_MS).toISOString();
  const youngerThan = new Date(now - MAX_AGE_MS).toISOString();

  const { data: pending, error } = await admin
    .from("transactions")
    .select("id, student_id, course_id, reference, paystack_data, created_at")
    .eq("status", "pending")
    .lt("created_at", olderThan)
    .gt("created_at", youngerThan)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    if (isMissingRelationError(error.message)) {
      return NextResponse.json({ error: "transactions unavailable", processed: 0 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let automations = 0;
  const baseUrl = siteUrl();

  for (const tx of pending ?? []) {
    try {
      const { data: existingReminder } = await admin
        .from("checkout_abandon_reminders")
        .select("id")
        .eq("transaction_id", tx.id)
        .maybeSingle();
      if (existingReminder) {
        skipped++;
        continue;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isMissingRelationError(message)) {
        return NextResponse.json({
          error: "checkout_abandon_reminders table missing — apply Phase 8 migration",
          processed: sent,
          skipped,
        });
      }
      skipped++;
      continue;
    }

    const checkout = readPendingCheckoutDetails(tx.paystack_data);
    let email = checkout.checkout_email ?? "";
    let fullName = checkout.checkout_full_name ?? null;

    if ((!email || !fullName) && tx.student_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", tx.student_id)
        .maybeSingle();
      if (!email && profile?.email) email = profile.email.trim().toLowerCase();
      if (!fullName && profile?.full_name) fullName = profile.full_name;
    }

    if (!email) {
      skipped++;
      continue;
    }

    let courseTitle: string | null = null;
    if (tx.course_id) {
      const { data: course } = await admin
        .from("courses")
        .select("title")
        .eq("id", tx.course_id)
        .maybeSingle();
      courseTitle = course?.title ?? null;
    }

    const resumeUrl = tx.course_id
      ? `${baseUrl}/course/${tx.course_id}`
      : `${baseUrl}/browse`;

    const result = await sendCheckoutAbandonReminderIfNeeded({
      transactionId: tx.id,
      email,
      fullName,
      courseTitle,
      resumeUrl,
      studentId: tx.student_id,
    });

    if (!result.sent) {
      skipped++;
      continue;
    }

    sent++;

    await recordProductEvent({
      event: "checkout_abandoned",
      courseId: tx.course_id,
      studentId: tx.student_id,
      metadata: {
        transaction_id: tx.id,
        reference: tx.reference,
      },
    });

    if (tx.student_id) {
      try {
        await runAutomations("checkout_abandoned", {
          studentId: tx.student_id,
          courseId: tx.course_id ?? undefined,
        });
        automations++;
      } catch (err) {
        console.error("[checkout-abandon] automation failed:", err);
      }
    }
  }

  await nudgeWebinarFollowupFromCron(admin, "nudge_from_checkout_abandon");

  return NextResponse.json({
    examined: pending?.length ?? 0,
    sent,
    skipped,
    automations,
  });
}
