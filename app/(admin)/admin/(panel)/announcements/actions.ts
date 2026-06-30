"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { notifyMany } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

export type AnnouncementState = { error?: string; message?: string };

export async function sendAnnouncement(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  await requireAdmin();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const target = String(formData.get("target") ?? "all"); // "all" | courseId
  if (!subject || !body) return { error: "Subject and message are required." };

  const supabase = createClient();
  const admin = createAdminClient();

  let recipients: { id: string; email: string; full_name: string | null }[] = [];

  if (target === "all") {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("role", "student")
      .eq("is_suspended", false);
    recipients = data ?? [];
  } else {
    const { data } = await supabase
      .from("enrollments")
      .select("student:profiles(id, email, full_name)")
      .eq("course_id", target);
    recipients = (data ?? [])
      .map((e) => (Array.isArray(e.student) ? e.student[0] : e.student))
      .filter((s): s is { id: string; email: string; full_name: string | null } => !!s);
  }

  if (recipients.length === 0) return { error: "No recipients found." };

  const tpl = emailTemplates.announcement({ subject, body });
  // Send (best-effort). For very large lists, move to a queue/batch job.
  await Promise.allSettled(
    recipients.map((r) => sendEmail({ to: r.email, subject: tpl.subject, html: tpl.html })),
  );

  await notifyMany(
    recipients.map((r) => r.id),
    { type: "announcement", title: subject, message: body.replace(/<[^>]+>/g, "").slice(0, 160) },
  );

  // Persisted via admin client already through notifyMany; log the action.
  void admin;
  await logAudit({ action: "announcement_sent", metadata: { subject, count: recipients.length, target } });

  return { message: `Announcement sent to ${recipients.length} student(s).` };
}
