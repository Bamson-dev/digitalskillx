import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { notifyMany } from "@/lib/notifications";
import {
  resolveCoursePublishRecipients,
  stripHtmlPreview,
  type AnnouncementRecipient,
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

export type ProgramCourseNotifyResult = {
  notified: number;
  emailsSent: number;
  reason?: string;
  toNotify: AnnouncementRecipient[];
  programName: string;
  courseUrl: string;
  shortDescription: string;
  longDescription: string;
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
 * Notify DigitalSkillX students when a course is published.
 * In-app notifications + delivery log happen synchronously; emails can be deferred.
 */
export async function notifyProgramStudentsOfNewCourse(
  course: ProgramCourseNotifyRow,
  options?: { forceResend?: boolean; sendEmails?: boolean },
): Promise<ProgramCourseNotifyResult> {
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

  const recipients = await resolveCoursePublishRecipients(admin);
  if (recipients.length === 0) {
    return {
      notified: 0,
      emailsSent: 0,
      reason: "No students found (need a successful payment, admin enrollment, or any course enrollment).",
      toNotify: [],
      programName,
      courseUrl: `${siteUrl()}/course/${course.id}`,
      shortDescription: "",
      longDescription: "",
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
        "Delivery table missing. Run sql/apply-program-course-notify.sql in Supabase, then save again.",
      );
    }
    throw new Error(deliveryError.message);
  }

  const alreadyNotified = new Set((existingDeliveries ?? []).map((row) => row.student_id));
  const toNotify = options?.forceResend
    ? recipients
    : recipients.filter((recipient) => !alreadyNotified.has(recipient.id));

  const courseUrl = `${siteUrl()}/course/${course.id}`;
  const longDescription = stripHtmlPreview(course.description ?? "", 4_000);
  const shortDescription = stripHtmlPreview(course.short_description ?? "", 400);

  if (toNotify.length === 0) {
    return {
      notified: 0,
      emailsSent: 0,
      reason: options?.forceResend
        ? "No students matched the publish notification audience."
        : "All eligible students were already notified for this course. Check the box and save again to resend.",
      toNotify: [],
      programName,
      courseUrl,
      shortDescription,
      longDescription,
    };
  }

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

  if (options?.forceResend && alreadyNotified.size > 0) {
    const { error: clearError } = await admin
      .from("program_course_publish_deliveries")
      .delete()
      .eq("course_id", course.id);
    if (clearError) throw new Error(clearError.message);
  }

  for (let i = 0; i < toNotify.length; i += 200) {
    const slice = toNotify.slice(i, i + 200);
    const { error: insertError } = await admin.from("program_course_publish_deliveries").insert(
      slice.map((recipient) => ({
        course_id: course.id,
        student_id: recipient.id,
      })),
    );
    if (insertError) {
      if (
        insertError.message.includes("program_course_added") ||
        insertError.message.includes("invalid input value for enum")
      ) {
        throw new Error(
          "Notification type missing. Run sql/apply-program-course-notify.sql in Supabase, then save again.",
        );
      }
      throw new Error(insertError.message);
    }
  }

  let emailsSent = 0;
  if (options?.sendEmails !== false) {
    emailsSent = await sendProgramCoursePublishEmails({
      course,
      toNotify,
      programName,
      courseUrl,
      shortDescription,
      longDescription,
    });
  }

  return {
    notified: toNotify.length,
    emailsSent,
    reason: undefined,
    toNotify,
    programName,
    courseUrl,
    shortDescription,
    longDescription,
  };
}

export async function sendProgramCoursePublishEmails(params: {
  course: ProgramCourseNotifyRow;
  toNotify: AnnouncementRecipient[];
  programName: string;
  courseUrl: string;
  shortDescription: string;
  longDescription: string;
}) {
  const outcomes = (params.course.learning_outcomes ?? []).map((row) => row.trim()).filter(Boolean);
  let emailsSent = 0;

  for (let i = 0; i < params.toNotify.length; i += 40) {
    const batch = params.toNotify.slice(i, i + 40);
    const results = await Promise.allSettled(
      batch.map(async (recipient) => {
        const tpl = emailTemplates.programCourseAdded({
          firstName: studentFirstName(recipient.full_name ?? ""),
          programName: params.programName,
          courseTitle: params.course.title,
          shortDescription: params.shortDescription,
          description: params.longDescription,
          instructorName: params.course.instructor_name?.trim() || "",
          outcomes,
          priceLabel:
            typeof params.course.price_ngn === "number" && params.course.price_ngn > 0
              ? `₦${params.course.price_ngn.toLocaleString("en-NG")}`
              : "",
          url: params.courseUrl,
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
          `[course-program-notify] email failed for ${recipient.email} (${params.course.id}):`,
          errorMessage,
        );

        await logProgramCourseEmailFailure({
          recipient: recipient.email,
          subject: tpl.subject,
          payload: {
            course_id: params.course.id,
            student_id: recipient.id,
            category_id: params.course.category_id,
          },
          errorMessage,
        });
      }),
    );
    void results;
  }

  return emailsSent;
}
