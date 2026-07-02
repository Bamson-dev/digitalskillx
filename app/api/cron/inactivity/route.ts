import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAutomations } from "@/lib/automation";
import { processIdleReminderEmails } from "@/lib/system-email-triggers";

export const dynamic = "force-dynamic";

/**
 * Scheduled job (Vercel Cron) that emails inactive students once per idle period.
 * Protect with CRON_SECRET via the Authorization: Bearer header.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Number(process.env.INACTIVITY_DAYS ?? 5);
  const admin = createAdminClient();

  const { data: students } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "student")
    .eq("is_suspended", false);

  for (const s of students ?? []) {
    await runAutomations("student_inactive", { studentId: s.id });
  }

  const emailResult = await processIdleReminderEmails(days);

  return NextResponse.json({
    automationsProcessed: students?.length ?? 0,
    idleEmailsSent: emailResult.sent,
    idleEmailsSkipped: emailResult.skipped,
  });
}
