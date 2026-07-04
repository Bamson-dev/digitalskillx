"use server";

import { getAdminSupabase } from "@/lib/admin-supabase";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { notifyMany } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import {
  resolveAnnouncementRecipients,
  stripHtmlPreview,
} from "@/lib/announcement-recipients";

export type AnnouncementState = { error?: string; message?: string };

export async function sendAnnouncement(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  try {
    await requireAdmin();

    const subject = String(formData.get("subject") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const audience = String(formData.get("audience") ?? "all") === "courses" ? "courses" : "all";
    const courseIds = formData
      .getAll("course_ids")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (!subject || !body) return { error: "Subject and message are required." };
    if (audience === "courses" && courseIds.length === 0) {
      return { error: "Select at least one course, or choose All students." };
    }

    const admin = await getAdminSupabase();
    const recipients = await resolveAnnouncementRecipients(admin, { audience, courseIds });

    if (recipients.length === 0) {
      return {
        error:
          audience === "courses"
            ? "No active students are enrolled in the selected course(s)."
            : "No active students found.",
      };
    }

    const tpl = emailTemplates.announcement({ subject, body });
    const emailResults = await Promise.allSettled(
      recipients.map((recipient) =>
        sendEmail({ to: recipient.email, subject: tpl.subject, html: tpl.html }),
      ),
    );
    const emailsSent = emailResults.filter((result) => result.status === "fulfilled").length;

    const preview = stripHtmlPreview(body);
    const linkUrl =
      audience === "courses" && courseIds.length === 1 ? `/courses/${courseIds[0]}` : "/dashboard";

    await notifyMany(
      recipients.map((recipient) => recipient.id),
      {
        type: "announcement",
        title: subject,
        message: preview,
        linkUrl,
      },
    );

    await logAudit({
      action: "announcement_sent",
      metadata: {
        subject,
        audience,
        courseIds: audience === "courses" ? courseIds : [],
        recipientCount: recipients.length,
        emailsSent,
      },
    });

    const audienceLabel =
      audience === "all"
        ? "all students"
        : `${courseIds.length} course${courseIds.length === 1 ? "" : "s"}`;

    return {
      message: `Announcement delivered to ${recipients.length} student(s) (${audienceLabel}). ${emailsSent} email(s) sent. Students will also see it on their dashboard.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send announcement." };
  }
}
