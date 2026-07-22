import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutomations } from "@/lib/automation";
import type { Database } from "@/types/database";
import { sendWelcomeEmailIfNeeded } from "@/lib/system-email-triggers";
import { studentFirstName } from "@/lib/student-name";

export { studentFirstName };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidStudentEmail(email: string) {
  return EMAIL_RE.test(email.trim());
}
export function generateStrongPassword() {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "!@#$%&*";
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const length = 12 + Math.floor(Math.random() * 4);
  const required = [pick(lower), pick(upper), pick(digits), pick(special)];
  const all = lower + upper + digits + special;
  while (required.length < length) {
    required.push(pick(all));
  }
  for (let i = required.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [required[i], required[j]] = [required[j], required[i]];
  }
  return required.join("");
}

export type CourseLookup = { id: string; title: string };

export function buildCourseResolver(courses: CourseLookup[]) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const byTitle = new Map(courses.map((c) => [c.title.trim().toLowerCase(), c]));

  function fuzzyMatchTitle(ref: string) {
    const lower = ref.trim().toLowerCase();
    const exact = byTitle.get(lower);
    if (exact) return exact;

    const partial = courses.filter(
      (course) =>
        course.title.toLowerCase().includes(lower) || lower.includes(course.title.toLowerCase()),
    );
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) {
      const startsWith = partial.filter((course) => course.title.toLowerCase().startsWith(lower));
      if (startsWith.length === 1) return startsWith[0];
      return partial.sort((a, b) => a.title.length - b.title.length)[0];
    }
    return null;
  }

  return function resolveCourseRef(
    ref: string | null | undefined,
    fallbackCourseId: string | null,
  ): { courseId: string | null; courseTitle: string | null; error?: string } {
    const trimmed = ref?.trim() ?? "";
    if (!trimmed) {
      if (!fallbackCourseId) return { courseId: null, courseTitle: null };
      const course = byId.get(fallbackCourseId);
      return course
        ? { courseId: course.id, courseTitle: course.title }
        : { courseId: null, courseTitle: null, error: "Default course not found." };
    }

    if (UUID_RE.test(trimmed)) {
      const course = byId.get(trimmed);
      return course
        ? { courseId: course.id, courseTitle: course.title }
        : { courseId: null, courseTitle: null, error: `Unknown course id: ${trimmed}` };
    }

    const course = fuzzyMatchTitle(trimmed);
    return course
      ? { courseId: course.id, courseTitle: course.title }
      : { courseId: null, courseTitle: null, error: `Unknown course: ${trimmed}` };
  };
}

export { parseCsvRow, parseStudentCsv } from "@/lib/student-csv-parse";

export async function findProfileByEmail(
  admin: SupabaseClient<Database>,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, role, is_suspended")
    .ilike("email", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function waitForStudentProfile(
  admin: SupabaseClient<Database>,
  studentId: string,
  attempts = 8,
) {
  for (let i = 0; i < attempts; i++) {
    const { data } = await admin.from("profiles").select("id").eq("id", studentId).maybeSingle();
    if (data) return;
    await new Promise((resolve) => setTimeout(resolve, 75 * (i + 1)));
  }
  throw new Error("Student profile was not ready after account creation. Try again.");
}

export async function verifyStudentCourseAccess(
  admin: SupabaseClient<Database>,
  studentId: string,
  courseIds: string[],
) {
  if (courseIds.length === 0) return { enrolledCourseIds: [] as string[] };
  const { data, error } = await admin
    .from("enrollments")
    .select("course_id")
    .eq("student_id", studentId)
    .in("course_id", courseIds);
  if (error) throw new Error(error.message);
  return { enrolledCourseIds: (data ?? []).map((row) => row.course_id) };
}

/** Resolve a student id from profile or Auth (CSV / import flows). */
export async function resolveStudentIdByEmail(
  admin: SupabaseClient<Database>,
  email: string,
  authIndex?: Map<string, { id: string; lastSignInAt: string | null }>,
) {
  const normalized = email.trim().toLowerCase();
  const profile = await findProfileByEmail(admin, normalized);
  if (profile) return profile.id;
  const authMeta = authIndex?.get(normalized);
  if (authMeta?.id) return authMeta.id;

  // Targeted Auth recovery for orphan Auth users (no listUsers scan).
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: normalized,
    });
    if (error) {
      console.error("[resolveStudentIdByEmail] generateLink", error.message);
      return null;
    }
    return data.user?.id ?? null;
  } catch (err) {
    console.error("[resolveStudentIdByEmail] Auth lookup failed", err);
    return null;
  }
}

export async function ensureImportedStudentProfile(
  admin: SupabaseClient<Database>,
  params: {
    studentId: string;
    email: string;
    fullName: string;
  },
) {
  const email = params.email.trim().toLowerCase();
  const { data: existing } = await admin
    .from("profiles")
    .select("id, is_suspended")
    .eq("id", params.studentId)
    .maybeSingle();

  if (existing?.is_suspended) {
    throw new Error("Student account is suspended");
  }

  if (!existing) {
    const { error } = await admin.from("profiles").insert({
      id: params.studentId,
      email,
      full_name: params.fullName.trim(),
      role: "student",
      is_suspended: false,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin
    .from("profiles")
    .update({
      email,
      full_name: params.fullName.trim(),
    })
    .eq("id", params.studentId);
  if (error) throw new Error(error.message);
}

type AuthEmailIndex = Map<string, { id: string; lastSignInAt: string | null }>;

/**
 * Resolve the auth user id that should own enrollments for this email.
 * Prefer an optional preloaded auth index; otherwise use targeted lookups only
 * (never page every Auth user on the hot path).
 */
export async function resolveCanonicalStudentId(
  admin: SupabaseClient<Database>,
  params: { studentId: string; email: string },
  authIndex?: AuthEmailIndex,
) {
  const normalizedEmail = params.email.trim().toLowerCase();

  if (authIndex) {
    const idByEmail = authIndex.get(normalizedEmail)?.id;
    if (idByEmail) return idByEmail;
  }

  const { data: authUser, error } = await admin.auth.admin.getUserById(params.studentId);
  if (!error && authUser.user?.id) {
    const authEmail = authUser.user.email?.trim().toLowerCase() ?? null;
    if (!authEmail || authEmail === normalizedEmail) return authUser.user.id;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .eq("id", params.studentId)
    .maybeSingle();
  if (profile?.id) return profile.id;

  return params.studentId;
}

async function moveEnrollmentsBetweenStudents(
  admin: SupabaseClient<Database>,
  fromStudentId: string,
  toStudentId: string,
) {
  if (fromStudentId === toStudentId) return;

  const { data: orphanEnrollments, error: enrollError } = await admin
    .from("enrollments")
    .select("id, course_id, completed_at, enrolled_at")
    .eq("student_id", fromStudentId);

  if (enrollError) throw new Error(enrollError.message);

  for (const enrollment of orphanEnrollments ?? []) {
    await mergeLessonProgressForCourse(admin, {
      fromStudentId,
      toStudentId,
      courseId: enrollment.course_id,
    });

    const { data: existing } = await admin
      .from("enrollments")
      .select("id, completed_at")
      .eq("student_id", toStudentId)
      .eq("course_id", enrollment.course_id)
      .maybeSingle();

    if (existing) {
      if (enrollment.completed_at && !existing.completed_at) {
        await admin
          .from("enrollments")
          .update({ completed_at: enrollment.completed_at })
          .eq("id", existing.id);
      }
      const { error: deleteError } = await admin.from("enrollments").delete().eq("id", enrollment.id);
      if (deleteError && deleteError.code !== "23505") {
        // unique races are fine — row already gone/merged
        if (!deleteError.message.toLowerCase().includes("duplicate")) {
          throw new Error(deleteError.message);
        }
      }
      continue;
    }

    const { error: moveError } = await admin
      .from("enrollments")
      .update({ student_id: toStudentId })
      .eq("id", enrollment.id);
    if (moveError) {
      if (moveError.code === "23505" || moveError.message.toLowerCase().includes("duplicate")) {
        await admin.from("enrollments").delete().eq("id", enrollment.id);
        continue;
      }
      throw new Error(moveError.message);
    }
  }
}

async function mergeLessonProgressForCourse(
  admin: SupabaseClient<Database>,
  params: { fromStudentId: string; toStudentId: string; courseId: string },
) {
  const { data: modules } = await admin
    .from("modules")
    .select("id")
    .eq("course_id", params.courseId);
  const moduleIds = (modules ?? []).map((m) => m.id);
  if (moduleIds.length === 0) return;

  const { data: lessons } = await admin
    .from("lessons")
    .select("id")
    .in("module_id", moduleIds);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  if (lessonIds.length === 0) return;

  const { data: orphanProgress } = await admin
    .from("lesson_progress")
    .select("lesson_id, completed, watch_percentage, completed_at")
    .eq("student_id", params.fromStudentId)
    .in("lesson_id", lessonIds);

  for (const row of orphanProgress ?? []) {
    const { data: existing } = await admin
      .from("lesson_progress")
      .select("id, completed, watch_percentage, completed_at")
      .eq("student_id", params.toStudentId)
      .eq("lesson_id", row.lesson_id)
      .maybeSingle();

    if (!existing) {
      await admin.from("lesson_progress").insert({
        student_id: params.toStudentId,
        lesson_id: row.lesson_id,
        completed: row.completed,
        watch_percentage: row.watch_percentage,
        completed_at: row.completed_at,
      });
    } else {
      const completed = existing.completed || row.completed;
      const watch_percentage = Math.max(existing.watch_percentage ?? 0, row.watch_percentage ?? 0);
      const completed_at = existing.completed_at ?? row.completed_at;
      await admin
        .from("lesson_progress")
        .update({ completed, watch_percentage, completed_at })
        .eq("id", existing.id);
    }
  }

  await admin
    .from("lesson_progress")
    .delete()
    .eq("student_id", params.fromStudentId)
    .in("lesson_id", lessonIds);
}

/** Move enrollments off duplicate profile rows that share the login email. */
export async function reconcileOrphanEnrollmentsForEmail(
  admin: SupabaseClient<Database>,
  params: { authUserId: string; email: string },
) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const { data: duplicateProfiles, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .neq("id", params.authUserId);

  if (profileError) throw new Error(profileError.message);

  for (const orphan of duplicateProfiles ?? []) {
    await moveEnrollmentsBetweenStudents(admin, orphan.id, params.authUserId);
  }
}

/**
 * Consolidate course access onto the signed-in student account.
 * Runs on login and dashboard reads so admin-granted courses appear without re-login.
 *
 * Hot-path safe: uses getUserById + profiles-by-email only. Never pages all Auth users.
 * Optional authIndex is used when a caller already loaded one (admin tools / bulk jobs).
 */
export async function syncStudentCourseAccess(
  admin: SupabaseClient<Database>,
  params: { authUserId: string; profileEmail?: string | null },
  authIndex?: AuthEmailIndex,
): Promise<string> {
  const profileEmail = params.profileEmail?.trim().toLowerCase() ?? null;

  let authEmail: string | null = null;
  try {
    const { data: authUserData, error: authError } = await admin.auth.admin.getUserById(
      params.authUserId,
    );
    if (authError) throw new Error(authError.message);
    authEmail = authUserData.user?.email?.trim().toLowerCase() ?? null;
  } catch (err) {
    // Auth Admin blips must not crash student course pages — fall back to profile email.
    console.error("[syncStudentCourseAccess] getUserById failed", err);
  }

  if (authEmail && profileEmail && authEmail !== profileEmail) {
    await admin.from("profiles").update({ email: authEmail }).eq("id", params.authUserId);
  }

  const emails = [...new Set([profileEmail, authEmail].filter(Boolean))] as string[];
  for (const email of emails) {
    await reconcileOrphanEnrollmentsForEmail(admin, { authUserId: params.authUserId, email });
  }

  const relatedIds = new Set<string>();
  for (const email of emails) {
    const { data: profiles } = await admin.from("profiles").select("id").ilike("email", email);
    for (const profile of profiles ?? []) relatedIds.add(profile.id);
    const mappedId = authIndex?.get(email)?.id;
    if (mappedId) relatedIds.add(mappedId);
  }

  for (const relatedId of relatedIds) {
    await moveEnrollmentsBetweenStudents(admin, relatedId, params.authUserId);
  }

  return params.authUserId;
}

/** Move certificates off duplicate profile rows that share the login email. */
export async function reconcileOrphanCertificatesForEmail(
  admin: SupabaseClient<Database>,
  params: { authUserId: string; email: string },
) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const { data: duplicateProfiles, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .neq("id", params.authUserId);

  if (profileError) throw new Error(profileError.message);

  for (const orphan of duplicateProfiles ?? []) {
    const { data: orphanCerts, error: certError } = await admin
      .from("certificates")
      .select("id, course_id")
      .eq("student_id", orphan.id);

    if (certError) throw new Error(certError.message);

    for (const cert of orphanCerts ?? []) {
      const { data: existing } = await admin
        .from("certificates")
        .select("id")
        .eq("student_id", params.authUserId)
        .eq("course_id", cert.course_id)
        .maybeSingle();

      if (existing) {
        await admin.from("certificates").delete().eq("id", cert.id);
        continue;
      }

      const { error: moveError } = await admin
        .from("certificates")
        .update({ student_id: params.authUserId })
        .eq("id", cert.id);
      if (moveError) throw new Error(moveError.message);
    }
  }
}

export async function grantCourseAccessToStudent(
  admin: SupabaseClient<Database>,
  params: {
    studentId: string;
    courseIds: string[];
    enrolledBy: string;
    fullName: string;
    email: string;
    sendEnrollmentEmail?: boolean;
    authIndex?: AuthEmailIndex;
  },
): Promise<{ newlyEnrolled: string[] }> {
  const { sendCourseEnrollmentEmail } = await import("@/lib/system-email-triggers");
  const { notify } = await import("@/lib/notifications");

  const canonicalStudentId = await resolveCanonicalStudentId(
    admin,
    {
      studentId: params.studentId,
      email: params.email,
    },
    params.authIndex,
  );
  await syncStudentCourseAccess(
    admin,
    {
      authUserId: canonicalStudentId,
      profileEmail: params.email,
    },
    params.authIndex,
  );

  const uniqueIds = [...new Set(params.courseIds.filter(Boolean))];
  const newlyEnrolled: string[] = [];

  for (const courseId of uniqueIds) {
    const { data: existing } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", canonicalStudentId)
      .eq("course_id", courseId)
      .maybeSingle();

    if (existing) continue;

    const { error } = await admin.from("enrollments").insert({
      student_id: canonicalStudentId,
      course_id: courseId,
      enrolled_by: params.enrolledBy,
      source: "admin",
    });
    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) continue;
      throw new Error(error.message);
    }

    newlyEnrolled.push(courseId);
    await runAutomations("course_enrolled", { studentId: canonicalStudentId, courseId });

    const { data: course } = await admin
      .from("courses")
      .select("title")
      .eq("id", courseId)
      .maybeSingle();

    if (course?.title) {
      await notify({
        studentId: canonicalStudentId,
        type: "enrollment",
        title: "New course",
        message: `You've been enrolled in "${course.title}".`,
        linkUrl: `/courses/${courseId}`,
      });
    }

    if (params.sendEnrollmentEmail !== false) {
      await sendCourseEnrollmentEmail({
        studentId: canonicalStudentId,
        courseId,
        fullName: params.fullName,
        email: params.email,
      });
    }
  }

  return { newlyEnrolled };
}

/**
 * Bulk-import enroll path: profile upsert + enrollment insert only.
 * No Auth full-scan, no orphan reconciliation, no sync SMTP (caller defers email).
 */
export async function grantCourseAccessForBulkImport(
  admin: SupabaseClient<Database>,
  params: {
    studentId: string;
    courseId: string;
    enrolledBy: string;
    fullName: string;
    email: string;
  },
): Promise<{ newlyEnrolled: boolean }> {
  await ensureImportedStudentProfile(admin, {
    studentId: params.studentId,
    email: params.email,
    fullName: params.fullName,
  });

  const { data: existing } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", params.studentId)
    .eq("course_id", params.courseId)
    .maybeSingle();

  if (existing) return { newlyEnrolled: false };

  const { error } = await admin.from("enrollments").insert({
    student_id: params.studentId,
    course_id: params.courseId,
    enrolled_by: params.enrolledBy,
    source: "admin",
  });

  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      return { newlyEnrolled: false };
    }
    throw new Error(error.message);
  }

  try {
    await runAutomations("course_enrolled", {
      studentId: params.studentId,
      courseId: params.courseId,
    });
  } catch (err) {
    console.error("[grantCourseAccessForBulkImport] automation failed", err);
  }

  return { newlyEnrolled: true };
}

export async function enrollStudentInCourses(
  admin: SupabaseClient<Database>,
  params: {
    studentId: string;
    courseIds: string[];
    enrolledBy: string;
  },
) {
  const uniqueIds = [...new Set(params.courseIds.filter(Boolean))];
  for (const courseId of uniqueIds) {
    const { error } = await admin.from("enrollments").insert({
      student_id: params.studentId,
      course_id: courseId,
      enrolled_by: params.enrolledBy,
      source: "admin",
    });
    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
    await runAutomations("course_enrolled", { studentId: params.studentId, courseId });
  }
}

export async function sendStudentWelcomeEmail(params: {
  studentId: string;
  fullName: string;
  email: string;
  password: string;
  courseNames: string[];
  siteUrl: string;
  brandColor?: string;
}) {
  void params.siteUrl;
  void params.brandColor;
  return sendWelcomeEmailIfNeeded({
    studentId: params.studentId,
    fullName: params.fullName,
    email: params.email,
    password: params.password,
    courseNamesOverride: params.courseNames,
  });
}
