import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, NotificationType } from "@/types/database";
import { isMissingRelationError } from "@/lib/schema-guard";

export function isMissingEnumValueError(message: string | null | undefined) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("invalid input value for enum") ||
    (lower.includes("program_course_added") && lower.includes("enum"))
  );
}

/** Probe whether publish-notification DB objects exist. */
export async function probeProgramCourseNotifySchema(
  admin: SupabaseClient<Database>,
): Promise<{ deliveryTableReady: boolean }> {
  const { error } = await admin.from("program_course_publish_deliveries").select("course_id").limit(1);
  return { deliveryTableReady: !(error && isMissingRelationError(error.message)) };
}

export function programCourseNotifySchemaHint(deliveryTableReady: boolean) {
  if (deliveryTableReady) return null;
  return "Delivery log table missing — notifications still send, but run sql/apply-program-course-notify.sql in Supabase to enable resend tracking.";
}

export async function loadProgramCourseDeliveries(
  admin: SupabaseClient<Database>,
  courseId: string,
): Promise<{ tracking: boolean; studentIds: Set<string> }> {
  const { data, error } = await admin
    .from("program_course_publish_deliveries")
    .select("student_id")
    .eq("course_id", courseId);
  if (error) {
    if (isMissingRelationError(error.message)) {
      return { tracking: false, studentIds: new Set() };
    }
    throw new Error(error.message);
  }
  return {
    tracking: true,
    studentIds: new Set((data ?? []).map((row) => row.student_id)),
  };
}

export async function clearProgramCourseDeliveries(
  admin: SupabaseClient<Database>,
  courseId: string,
) {
  const { error } = await admin.from("program_course_publish_deliveries").delete().eq("course_id", courseId);
  if (error && !isMissingRelationError(error.message)) {
    throw new Error(error.message);
  }
}

export async function recordProgramCourseDeliveries(
  admin: SupabaseClient<Database>,
  courseId: string,
  studentIds: string[],
) {
  if (studentIds.length === 0) return false;
  for (let i = 0; i < studentIds.length; i += 200) {
    const slice = studentIds.slice(i, i + 200);
    const { error } = await admin.from("program_course_publish_deliveries").insert(
      slice.map((studentId) => ({
        course_id: courseId,
        student_id: studentId,
      })),
    );
    if (error) {
      if (isMissingRelationError(error.message)) return false;
      throw new Error(error.message);
    }
  }
  return true;
}

export function fallbackNotificationType(preferred: NotificationType): NotificationType {
  return preferred === "program_course_added" ? "announcement" : preferred;
}
