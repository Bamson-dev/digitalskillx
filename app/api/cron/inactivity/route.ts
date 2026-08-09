import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAutomations } from "@/lib/automation";
import { processIdleReminderEmails } from "@/lib/system-email-triggers";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Scheduled job: inactive students only (last_active_at older than threshold or null with old created_at).
 * Does not treat all students as inactive.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const days = Number(process.env.INACTIVITY_DAYS ?? 14);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const admin = createAdminClient();

  const { data: inactive } = await admin
    .from("profiles")
    .select("id, last_active_at, created_at")
    .eq("role", "student")
    .eq("is_suspended", false)
    .or(`last_active_at.is.null,last_active_at.lt.${cutoff}`)
    .limit(500);

  let automationsProcessed = 0;
  for (const s of inactive ?? []) {
    // Skip brand-new accounts with null last_active that are younger than threshold
    if (!s.last_active_at && s.created_at && s.created_at >= cutoff) continue;
    await runAutomations("student_inactive", { studentId: s.id });
    automationsProcessed++;
  }

  const emailResult = await processIdleReminderEmails(days);

  return NextResponse.json({
    inactivityDays: days,
    automationsProcessed,
    idleEmailsSent: emailResult.sent,
    idleEmailsSkipped: emailResult.skipped,
  });
}
