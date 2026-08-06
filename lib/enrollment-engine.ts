import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutomations } from "@/lib/automation";
import { notify } from "@/lib/notifications";
import {
  resolveCanonicalStudentId,
  syncStudentCourseAccess,
} from "@/lib/admin-student-onboarding";
import type { Database, EnrollmentSource } from "@/types/database";

export type EnrollEmailMode =
  | "enrollment"
  | "welcome_or_enrollment"
  | "none"
  | "deferred";

export type EnrollStudentParams = {
  studentId: string;
  email: string;
  fullName: string;
  courseIds: string[];
  source: EnrollmentSource;
  enrolledBy?: string | null;
  options?: {
    /** Resolve canonical auth id + merge orphan enrollments (default true for admin/full). */
    reconcile?: boolean;
    /** Skip check strategy: by student id only, or any profile sharing email. */
    skipCheck?: "student" | "email";
    notify?: boolean;
    emailMode?: EnrollEmailMode;
    welcomePassword?: string;
    automations?: boolean;
    notifyTitle?: string;
    correlationId?: string;
  };
};

export type EnrollStudentResult = {
  studentId: string;
  newlyEnrolled: string[];
  alreadyEnrolled: string[];
};

function isUniqueViolation(message: string | undefined, code?: string) {
  if (code === "23505") return true;
  return Boolean(message?.toLowerCase().includes("duplicate"));
}

async function isEnrolledForEmail(
  admin: SupabaseClient<Database>,
  params: { email: string; courseId: string; studentId: string },
) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail);
  const profileIds = [...new Set((profiles ?? []).map((p) => p.id).concat(params.studentId))];
  if (profileIds.length === 0) return false;
  const { data: existing } = await admin
    .from("enrollments")
    .select("id")
    .eq("course_id", params.courseId)
    .in("student_id", profileIds)
    .limit(1)
    .maybeSingle();
  return Boolean(existing);
}

/**
 * Enrollment Engine — shared enroll writer for **new** enrollment sources.
 *
 * PRODUCTION SAFETY (non-negotiable):
 * - Purchase, admin grant, bulk import, free/self, and automation `enroll_course`
 *   keep their existing production implementations until migrated one source at a time
 *   with baseline tests proving parity.
 * - Today this engine is used by the Enrollment Link redeem path only.
 *
 * Side-effect modes are parameterized so callers can match source-specific parity
 * (notify / email / automations) when a source is safely migrated.
 */
export async function enrollStudent(
  admin: SupabaseClient<Database>,
  params: EnrollStudentParams,
): Promise<EnrollStudentResult> {
  const opts = params.options ?? {};
  const reconcile = opts.reconcile !== false;
  const skipCheck = opts.skipCheck ?? "student";
  const doNotify = opts.notify !== false;
  const emailMode = opts.emailMode ?? "enrollment";
  const doAutomations = opts.automations !== false;

  let studentId = params.studentId;
  const email = params.email.trim().toLowerCase();
  const fullName = params.fullName.trim() || email.split("@")[0] || "there";

  if (reconcile) {
    studentId = await resolveCanonicalStudentId(admin, {
      studentId,
      email,
    });
    await syncStudentCourseAccess(admin, {
      authUserId: studentId,
      profileEmail: email,
    });
  }

  const uniqueIds = [...new Set(params.courseIds.filter(Boolean))];
  const newlyEnrolled: string[] = [];
  const alreadyEnrolled: string[] = [];

  for (const courseId of uniqueIds) {
    let already = false;
    if (skipCheck === "email") {
      already = await isEnrolledForEmail(admin, { email, courseId, studentId });
    } else {
      const { data: existing } = await admin
        .from("enrollments")
        .select("id")
        .eq("student_id", studentId)
        .eq("course_id", courseId)
        .maybeSingle();
      already = Boolean(existing);
    }

    if (already) {
      alreadyEnrolled.push(courseId);
      continue;
    }

    const insertPayload: {
      student_id: string;
      course_id: string;
      source: EnrollmentSource;
      enrolled_by?: string | null;
    } = {
      student_id: studentId,
      course_id: courseId,
      source: params.source,
    };
    if (params.enrolledBy) insertPayload.enrolled_by = params.enrolledBy;

    const { error } = await admin.from("enrollments").insert(insertPayload);
    if (error) {
      if (isUniqueViolation(error.message, error.code)) {
        alreadyEnrolled.push(courseId);
        continue;
      }
      throw new Error(error.message);
    }

    newlyEnrolled.push(courseId);

    if (doAutomations) {
      try {
        await runAutomations("course_enrolled", { studentId, courseId });
      } catch (err) {
        console.error("[enrollment-engine] automation failed", err);
      }
    }

    const { data: course } = await admin
      .from("courses")
      .select("title")
      .eq("id", courseId)
      .maybeSingle();

    if (doNotify && course?.title) {
      await notify({
        studentId,
        type: "enrollment",
        title: opts.notifyTitle ?? "New course",
        message: `You've been enrolled in "${course.title}".`,
        linkUrl: `/courses/${courseId}`,
      });
    }

    if (emailMode === "enrollment") {
      const { sendCourseEnrollmentEmail } = await import("@/lib/system-email-triggers");
      await sendCourseEnrollmentEmail({
        studentId,
        courseId,
        fullName,
        email,
      });
    } else if (emailMode === "welcome_or_enrollment") {
      const {
        sendWelcomeEmailIfNeeded,
        sendCourseEnrollmentEmail,
      } = await import("@/lib/system-email-triggers");
      const welcome = await sendWelcomeEmailIfNeeded({
        studentId,
        fullName,
        email,
        password: opts.welcomePassword,
        checkoutCourseId: courseId,
      });
      if (!welcome.sent) {
        await sendCourseEnrollmentEmail({
          studentId,
          courseId,
          fullName,
          email,
        });
      }
    }
    // "none" | "deferred" — caller handles email
  }

  return { studentId, newlyEnrolled, alreadyEnrolled };
}
