import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { notifyMany } from "@/lib/notifications";
import { resolveAnnouncementRecipients } from "@/lib/announcement-recipients";
import { stripHtmlPreview } from "@/lib/announcement-recipients";
import { studentFirstName } from "@/lib/student-name";
import { siteUrl } from "@/lib/org";
import { formatDate } from "@/lib/utils";
import type { Json } from "@/types/database";

export type AssignmentPublishRow = {
  id: string;
  title: string;
  instructions: string | null;
  due_date: string | null;
  course_id: string;
};

async function logAssignmentEmailFailure(params: {
  recipient: string;
  subject: string;
  payload: Record<string, Json>;
  errorMessage: string;
}) {
  try {
    const admin = await createAdminClientAsync();
    await admin.from("system_email_failures").insert({
      email_type: "assignment_published",
      recipient: params.recipient,
      subject: params.subject,
      payload: params.payload,
      error_message: params.errorMessage,
    });
  } catch (err) {
    console.error("[assignment-publish] could not log email failure:", err);
  }
}

/** Notify enrolled students once when an assignment is first published. */
export async function notifyAssignmentPublished(assignment: AssignmentPublishRow) {
  const admin = createAdminClient();

  const { data: course } = await admin
    .from("courses")
    .select("title")
    .eq("id", assignment.course_id)
    .single();
  const courseTitle = course?.title ?? "your course";

  const recipients = await resolveAnnouncementRecipients(admin, {
    audience: "courses",
    courseIds: [assignment.course_id],
  });
  if (recipients.length === 0) return { notified: 0, emailsSent: 0 };

  const { data: existingDeliveries } = await admin
    .from("assignment_publish_deliveries")
    .select("student_id")
    .eq("assignment_id", assignment.id);
  const alreadyNotified = new Set((existingDeliveries ?? []).map((row) => row.student_id));

  const toNotify = recipients.filter((recipient) => !alreadyNotified.has(recipient.id));
  if (toNotify.length === 0) return { notified: 0, emailsSent: 0 };

  const assignmentUrl = `${siteUrl()}/assignments/${assignment.id}`;
  const dueLabel = assignment.due_date
    ? formatDate(assignment.due_date, { dateStyle: "medium", timeStyle: "short" })
    : null;
  const notificationMessage = dueLabel
    ? `${courseTitle} · Due ${dueLabel}`
    : courseTitle;

  await notifyMany(
    toNotify.map((recipient) => recipient.id),
    {
      type: "assignment_published",
      title: assignment.title,
      message: notificationMessage,
      linkUrl: `/assignments/${assignment.id}`,
    },
  );

  const instructionsSummary = stripHtmlPreview(assignment.instructions ?? "", 200);
  let emailsSent = 0;

  await Promise.allSettled(
    toNotify.map(async (recipient) => {
      const tpl = emailTemplates.assignmentPublished({
        firstName: studentFirstName(recipient.full_name ?? ""),
        courseTitle,
        assignmentTitle: assignment.title,
        instructionsSummary,
        dueDate: dueLabel,
        url: assignmentUrl,
      });

      const result = await sendEmail({
        to: recipient.email,
        subject: tpl.subject,
        html: tpl.html,
      });

      if ("messageId" in result && result.messageId) {
        emailsSent += 1;
        return;
      }

      const errorMessage =
        "skipped" in result && result.skipped
          ? result.error instanceof Error
            ? result.error.message
            : "Email delivery is not configured."
          : "error" in result && result.error
            ? result.error instanceof Error
              ? result.error.message
              : String(result.error)
            : "Email send failed.";

      console.error(
        `[assignment-publish] email failed for ${recipient.email} (${assignment.id}):`,
        errorMessage,
      );

      await logAssignmentEmailFailure({
        recipient: recipient.email,
        subject: tpl.subject,
        payload: {
          assignment_id: assignment.id,
          student_id: recipient.id,
          course_id: assignment.course_id,
        },
        errorMessage,
      });
    }),
  );

  await admin.from("assignment_publish_deliveries").insert(
    toNotify.map((recipient) => ({
      assignment_id: assignment.id,
      student_id: recipient.id,
    })),
  );

  return { notified: toNotify.length, emailsSent };
}
