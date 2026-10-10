import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { studentFirstName } from "@/lib/student-name";
import type { ProgramCourseNotifyRow } from "@/lib/course-program-notify";
import type { AnnouncementRecipient } from "@/lib/announcement-recipients";
import { coursePublishIdempotencyKey, coursePublishRetryDelayMs } from "@/lib/course-publish-email-policy";

type Payload = {
  course: ProgramCourseNotifyRow;
  programName: string;
  courseUrl: string;
  shortDescription: string;
  longDescription: string;
};
type OutboxRow = { id: string; course_id: string; student_id: string; email: string; full_name: string; payload: Payload; attempts: number };

export async function enqueueCoursePublishEmails(
  admin: SupabaseClient,
  courseId: string,
  recipients: AnnouncementRecipient[],
  payload: Payload,
) {
  if (!recipients.length) return [];
  const rows = recipients.map((recipient) => ({
    course_id: courseId,
    student_id: recipient.id,
    email: recipient.email,
    full_name: recipient.full_name ?? "",
    payload,
  }));
  const { data, error } = await admin.from("program_course_publish_email_outbox" as never)
    .upsert(rows as never, { onConflict: "course_id,student_id", ignoreDuplicates: true })
    .select("student_id");
  if (error) throw new Error(`Could not durably queue course publish emails: ${error.message}`);
  return (data ?? []) as unknown as Array<{ student_id: string }>;
}

export async function drainCoursePublishEmailOutbox(admin: SupabaseClient, limit = 40) {
  const reclaim = await admin.rpc("reclaim_program_course_publish_email_outbox" as never, { p_minutes: 15 } as never);
  if (reclaim.error) throw new Error(`Could not recover stale course email jobs: ${reclaim.error.message}`);
  const { data, error } = await admin.rpc("claim_program_course_publish_email_outbox" as never, { p_limit: limit } as never);
  if (error) throw new Error(`Could not claim course email jobs: ${error.message}`);
  const rows = (data ?? []) as unknown as OutboxRow[];
  let sent = 0;
  for (const row of rows) {
    const payload = row.payload;
    const course = payload.course;
    const tpl = emailTemplates.programCourseAdded({
      firstName: studentFirstName(row.full_name), programName: payload.programName,
      courseTitle: course.title, shortDescription: payload.shortDescription,
      description: payload.longDescription, instructorName: course.instructor_name?.trim() || "",
      outcomes: (course.learning_outcomes ?? []).map((item) => item.trim()).filter(Boolean),
      priceLabel: typeof course.price_ngn === "number" && course.price_ngn > 0 ? `₦${course.price_ngn.toLocaleString("en-NG")}` : "",
      url: payload.courseUrl,
    });
    try {
      const result = await sendEmail({
        to: row.email, subject: tpl.subject, html: tpl.html,
        idempotencyKey: coursePublishIdempotencyKey(row.course_id, row.student_id),
        tags: [{ name: "type", value: "program_course_added" }, { name: "course_id", value: row.course_id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) }],
      });
      if (!("messageId" in result) || !result.messageId) {
        const reason = "error" in result ? result.error : "Email delivery is not configured.";
        throw reason instanceof Error ? reason : new Error(String(reason));
      }
      const { error: updateError } = await admin.from("program_course_publish_email_outbox" as never)
        .update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.messageId, claimed_at: null, last_error: null, updated_at: new Date().toISOString() } as never)
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      await admin.from("program_course_publish_deliveries").upsert({ course_id: row.course_id, student_id: row.student_id }, { onConflict: "course_id,student_id", ignoreDuplicates: true });
      sent++;
    } catch (err) {
      const attempts = row.attempts ?? 1;
      await admin.from("program_course_publish_email_outbox" as never).update({
        status: "pending", claimed_at: null,
        scheduled_at: new Date(Date.now() + coursePublishRetryDelayMs(attempts)).toISOString(),
        last_error: err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000), updated_at: new Date().toISOString(),
      } as never).eq("id", row.id);
    }
  }
  return { claimed: rows.length, sent };
}
