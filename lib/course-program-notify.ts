import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { notifyMany } from "@/lib/notifications";
import {
  clearProgramCourseDeliveries,
  loadProgramCourseDeliveries,
  programCourseNotifySchemaHint,
} from "@/lib/ensure-program-course-notify";
import {
  resolveCoursePublishRecipients,
  stripHtmlForEmail,
  stripHtmlPreview,
  type AnnouncementRecipient,
} from "@/lib/announcement-recipients";
import { siteUrl } from "@/lib/org";
import { drainCoursePublishEmailOutbox, enqueueCoursePublishEmails } from "@/lib/course-publish-email-outbox";

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
  schemaNote?: string;
  toNotify: AnnouncementRecipient[];
  programName: string;
  courseUrl: string;
  shortDescription: string;
  longDescription: string;
};

/**
 * Notify DigitalSkillX students when a course is published.
 * Persist recipient emails before attempting delivery so workers can retry after failures/restarts.
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

  const deliveries = await loadProgramCourseDeliveries(admin, course.id);
  const schemaNote = programCourseNotifySchemaHint(deliveries.tracking) ?? undefined;

  if (options?.forceResend && deliveries.tracking) {
    await clearProgramCourseDeliveries(admin, course.id);
    const { error: outboxError } = await admin.from("program_course_publish_email_outbox" as never)
      .delete().eq("course_id", course.id);
    if (outboxError) throw new Error(`Could not reset course notification queue: ${outboxError.message}`);
    deliveries.studentIds.clear();
  }

  const toNotify = options?.forceResend
    ? recipients
    : recipients.filter((recipient) => !deliveries.studentIds.has(recipient.id));

  const courseUrl = `${siteUrl()}/course/${course.id}`;
  const longDescription = stripHtmlForEmail(course.description ?? "", 1_400);
  const shortDescription = stripHtmlForEmail(course.short_description ?? "", 320);

  if (toNotify.length === 0) {
    return {
      notified: 0,
      emailsSent: 0,
      reason: options?.forceResend
        ? "No students matched the publish notification audience."
        : "All eligible students were already notified for this course. Check Resend and save again.",
      schemaNote,
      toNotify: [],
      programName,
      courseUrl,
      shortDescription,
      longDescription,
    };
  }

  const inAppMessage = [
    stripHtmlPreview(shortDescription || longDescription, 280),
    `Open ${course.title} in your dashboard.`,
  ]
    .filter(Boolean)
    .join(" ");

  const queued = await enqueueCoursePublishEmails(admin, course.id, toNotify, {
    course, programName, courseUrl, shortDescription, longDescription,
  });
  const newlyQueued = toNotify.filter((recipient) => queued.some((row) => row.student_id === recipient.id));

  // In-app notification is sent once when an audience is first queued.

  try {
    await notifyMany(
      newlyQueued.map((recipient) => recipient.id),
      {
        type: "program_course_added",
        title: `New course: ${course.title}`,
        message: inAppMessage,
        linkUrl: `/course/${course.id}`,
      },
      { admin },
    );
  } catch (err) {
    console.error("[course-program-notify] in-app notify failed after emails:", err);
  }

  const tracked = deliveries.tracking;
  const emailResult = options?.sendEmails === false
    ? { sent: 0 }
    : await drainCoursePublishEmailOutbox(admin, 200);

  return {
    notified: queued.length,
    emailsSent: emailResult.sent,
    reason: undefined,
    schemaNote: tracked ? schemaNote : schemaNote ?? programCourseNotifySchemaHint(false) ?? undefined,
    toNotify,
    programName,
    courseUrl,
    shortDescription,
    longDescription,
  };
}
