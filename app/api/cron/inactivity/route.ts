import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAutomations } from "@/lib/automation";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { siteUrl } from "@/lib/org";

export const dynamic = "force-dynamic";

/**
 * Scheduled job (Vercel Cron) that flags inactive students (PRD §13.1, §16).
 * Protect with CRON_SECRET via the Authorization: Bearer header.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Number(process.env.INACTIVITY_DAYS ?? 7);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const admin = createAdminClient();

  const { data: students } = await admin
    .from("profiles")
    .select("id, email, full_name, last_active_at")
    .eq("role", "student")
    .eq("is_suspended", false)
    .lt("last_active_at", cutoff);

  let processed = 0;
  for (const s of students ?? []) {
    await runAutomations("student_inactive", { studentId: s.id });
    if (s.email) {
      const tpl = emailTemplates.inactivity({
        name: s.full_name ?? "there",
        url: `${siteUrl()}/dashboard`,
      });
      await sendEmail({ to: s.email, subject: tpl.subject, html: tpl.html });
    }
    processed++;
  }

  return NextResponse.json({ processed });
}
