import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { notifyMany } from "@/lib/notifications";
import {
  resolvePaidStudentRecipients,
  stripHtmlPreview,
} from "@/lib/announcement-recipients";
import { studentFirstName } from "@/lib/student-name";
import { siteUrl } from "@/lib/org";
import type { Json } from "@/types/database";

export type ProgramCourseNotifyRow = {
  id: string;
  title: string;
  category_id: string | null;
  short_description?: string | null;
  description?: string | null;
  learning_outcomes?: string[] | null;
  instructor_name?: string | null;
  price_ngn?: number | null;
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
 * Notify every paid DigitalSkillX student when a course is first published.
 */
export async function notifyProgramStudentsOfNewCourse(course: ProgramCourseNotifyRow) {
  const admin = await createAdminClientAsync();

  let programName = "DigitalSkillX";
  if (course.category_id) {
    const { data: category, error: categoryError } = await admin
      .from("course_categories")
      .select("name")
      .eq("id", course.category_id)
      .maybeSingle();
    if (categoryError) throw new Error(categoryError.message);
    if (category?.name?.trim()) programName = category.name.trim();
  }

  const recipients = await resolvePaidStudentRecipients(admin);
  if (recipients.length === 0) {
    return {
      notified: 0,
      emailsSent: 0,
      reason: "No paid students found (successful payment or paid/admin enrollment).",
    };
  }

  const { data: existingDeliveries, error: deliveryError } = await admin
    .from("program_course_publish_deliveries")
    .select("student_id")
    .eq("course_id", course.id);
  if (deliveryError) {
    if (
      deliveryError.message.includes("program_course_publish_deliveries") &&
      deliveryError.message.includes("does not exist")
    ) {
      throw new Error(
        "Delivery table missing. Run sql/apply-program-course-notify.sql in Supabase, then publish again.",
      );
    }
    throw new Error(deliveryError.message);
  }

  const alreadyNotified = new Set((existingDeliveries ?? []).map((row) => row.student_id));
  // Notify every paid student who has not already been notified for this course.
  const toNotify = recipients.filter((recipient) => !alreadyNotified.has(recipient.id));
  if (toNotify.length === 0) {
    return {
      notified: 0,
      emailsSent: 0,
      reason:
        recipients.length === 0
          ? "No paid students found (successful payment or paid/admin enrollment)."
          : "All paid students were already notified for this course.",
    };
  }

  const courseUrl = `${siteUrl()}/course/${course.id}`;
  const longDescription = stripHtmlPreview(course.description ?? "", 4_000);
  const shortDescription = stripHtmlPreview(
    course.short_description ?? "",
    400,
  );
  const inAppMessage = [shortDescription || longDescription.slice(0, 280), `Open ${course.title} in your dashboard.`]
    .filter(Boolean)
    .join(" ");

  for (let i = 0; i < toNotify.length; i += 200) {
    await notifyMany(
      toNotify.slice(i, i + 200).map((recipient) => recipient.id),
      {
        type: "program_course_added",
        title: `New course: ${course.title}`,
        message: inAppMessage,
        linkUrl: `/course/${course.id}`,
      },
    );
  }

  let emailsSent = 0;
  const outcomes = (course.learning_outcomes ?? []).map((row) => row.trim()).filter(Boolean);

  for (let i = 0; i < toNotify.length; i += 40) {
    const batch = toNotify.slice(i, i + 40);
    const results = await Promise.allSettled(
      batch.map(async (recipient) => {
        const tpl = emailTemplates.programCourseAdded({
          firstName: studentFirstName(recipient.full_name ?? ""),
          programName,
          courseTitle: course.title,
          shortDescription,
          description: longDescription,
          instructorName: course.instructor_name?.trim() || "",
          outcomes,
          priceLabel:
            typeof course.price_ngn === "number" && course.price_ngn > 0
              ? `₦${course.price_ngn.toLocaleString("en-NG")}`
              : "",
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
    void results;
  }

  for (let i = 0; i < toNotify.length; i += 200) {
    const slice = toNotify.slice(i, i + 200);
    await admin.from("program_course_publish_deliveries").insert(
      slice.map((recipient) => ({
        course_id: course.id,
        student_id: recipient.id,
      })),
    );
  }

  return { notified: toNotify.length, emailsSent, reason: undefined as string | undefined };
}
