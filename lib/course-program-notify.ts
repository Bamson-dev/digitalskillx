import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { notifyMany } from "@/lib/notifications";
import { resolveAnnouncementRecipients, stripHtmlPreview } from "@/lib/announcement-recipients";
import { studentFirstName } from "@/lib/student-name";
import { siteUrl } from "@/lib/org";
import { isMissingColumnError } from "@/lib/schema-guard";
import type { Json } from "@/types/database";

export type ProgramCourseNotifyRow = {
  id: string;
  title: string;
  category_id: string | null;
  short_description?: string | null;
  description?: string | null;
};

async function logProgramCourseEmailFailure(params: {
  recipient: string;
  subject: string;
  payload: Record<string, Json>;
  errorMessage: string;
}) {
  try {
    const admin = await createAdminClientAsync();
    await admin.from("system_email_failures").insert({
      email_type: "program_course_added",
      recipient: params.recipient,
      subject: params.subject,
      payload: params.payload,
      error_message: params.errorMessage,
    });
  } catch (err) {
    console.error("[course-program-notify] could not log email failure:", err);
  }
}

/**
 * Notify students enrolled in other courses of the same program (category)
 * when a new course is first published.
 */
export async function notifyProgramStudentsOfNewCourse(course: ProgramCourseNotifyRow) {
  if (!course.category_id) return { notified: 0, emailsSent: 0 };

  const admin = createAdminClient();

  const { data: category, error: categoryError } = await admin
    .from("course_categories")
    .select("name")
    .eq("id", course.category_id)
    .single();
  if (categoryError) throw new Error(categoryError.message);
  const programName = category?.name?.trim() || "your program";

  const { data: siblings, error: siblingsError } = await admin
    .from("courses")
    .select("id")
    .eq("category_id", course.category_id)
    .eq("visibility", "published")
    .neq("id", course.id);
  if (siblingsError) {
    if (isMissingColumnError(siblingsError.message)) {
      console.error("[course-program-notify] schema drift:", siblingsError.message);
      return { notified: 0, emailsSent: 0 };
    }
    throw new Error(siblingsError.message);
  }

  const siblingIds = (siblings ?? []).map((row) => row.id);
  if (siblingIds.length === 0) return { notified: 0, emailsSent: 0 };

  const recipients = await resolveAnnouncementRecipients(admin, {
    audience: "courses",
    courseIds: siblingIds,
  });
  if (recipients.length === 0) return { notified: 0, emailsSent: 0 };

  const { data: enrolledInNew, error: enrolledError } = await admin
    .from("enrollments")
    .select("student_id")
    .eq("course_id", course.id);
  if (enrolledError) throw new Error(enrolledError.message);
  const alreadyInNewCourse = new Set((enrolledInNew ?? []).map((row) => row.student_id));

  const { data: existingDeliveries, error: deliveryError } = await admin
    .from("program_course_publish_deliveries")
    .select("student_id")
    .eq("course_id", course.id);
  if (deliveryError) {
    if (
      deliveryError.message.includes("program_course_publish_deliveries") &&
      deliveryError.message.includes("does not exist")
    ) {
      console.error(
        "[course-program-notify] delivery table missing — run sql/apply-program-course-notify.sql",
      );
      return { notified: 0, emailsSent: 0 };
    }
    throw new Error(deliveryError.message);
  }

  const alreadyNotified = new Set((existingDeliveries ?? []).map((row) => row.student_id));
  const toNotify = recipients.filter(
    (recipient) =>
      !alreadyInNewCourse.has(recipient.id) && !alreadyNotified.has(recipient.id),
  );
  if (toNotify.length === 0) return { notified: 0, emailsSent: 0 };

  const courseUrl = `${siteUrl()}/course/${course.id}`;
  const descriptionPreview = stripHtmlPreview(
    course.short_description ?? course.description ?? "",
    200,
  );

  await notifyMany(
    toNotify.map((recipient) => recipient.id),
    {
      type: "program_course_added",
      title: course.title,
      message: `New course in ${programName}`,
      linkUrl: `/course/${course.id}`,
    },
  );

  let emailsSent = 0;
  await Promise.allSettled(
    toNotify.map(async (recipient) => {
      const tpl = emailTemplates.programCourseAdded({
        firstName: studentFirstName(recipient.full_name ?? ""),
        programName,
        courseTitle: course.title,
        description: descriptionPreview,
        url: courseUrl,
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
        `[course-program-notify] email failed for ${recipient.email} (${course.id}):`,
        errorMessage,
      );

      await logProgramCourseEmailFailure({
        recipient: recipient.email,
        subject: tpl.subject,
        payload: {
          course_id: course.id,
          student_id: recipient.id,
          category_id: course.category_id,
        },
        errorMessage,
      });
    }),
  );

  await admin.from("program_course_publish_deliveries").insert(
    toNotify.map((recipient) => ({
      course_id: course.id,
      student_id: recipient.id,
    })),
  );

  return { notified: toNotify.length, emailsSent };
}
