import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutomations } from "@/lib/automation";
import type { Database } from "@/types/database";
import { loadAuthEmailIndex } from "@/lib/admin-student-overview";
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

export function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  result.push(current.trim());
  return result;
}

export function parseStudentCsv(text: string): {
  header: boolean;
  rows: { rowNumber: number; cells: string[]; fullName: string; email: string; courseRef: string }[];
} {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { header: false, rows: [] };

  const first = parseCsvRow(lines[0]);
  const headerCells = first.map((cell) => cell.toLowerCase().trim());
  const hasHeader =
    headerCells.some((cell) => cell === "full_name" || cell === "name" || cell === "full name") &&
    headerCells.some((cell) => cell === "email" || cell === "email address");

  const nameIdx = headerCells.findIndex(
    (cell) => cell === "full_name" || cell === "name" || cell === "full name",
  );
  const emailIdx = headerCells.findIndex((cell) => cell === "email" || cell === "email address");
  const courseIdx = headerCells.findIndex(
    (cell) => cell === "course" || cell === "course_name" || cell === "courses",
  );

  const startIndex = hasHeader ? 1 : 0;

  const rows = lines.slice(startIndex).map((line, offset) => {
    const cells = parseCsvRow(line);
    let fullName = "";
    let email = "";
    let courseRef = "";

    if (hasHeader) {
      fullName = cells[nameIdx]?.trim() ?? "";
      email = cells[emailIdx]?.trim().toLowerCase() ?? "";
      courseRef = courseIdx >= 0 ? (cells[courseIdx]?.trim() ?? "") : "";
    } else if (cells.length >= 2 && cells[1]?.includes("@")) {
      fullName = cells[0]?.trim() ?? "";
      email = cells[1]?.trim().toLowerCase() ?? "";
      courseRef = cells[2]?.trim() ?? "";
    } else if (cells.length >= 2 && cells[0]?.includes("@")) {
      email = cells[0]?.trim().toLowerCase() ?? "";
      fullName = cells[1]?.trim() ?? "";
      courseRef = cells[2]?.trim() ?? "";
    } else {
      fullName = cells[0]?.trim() ?? "";
      email = cells[1]?.trim().toLowerCase() ?? "";
      courseRef = cells[2]?.trim() ?? "";
    }

    return {
      rowNumber: startIndex + offset + 1,
      cells,
      fullName,
      email,
      courseRef,
    };
  });

  return { header: hasHeader, rows };
}

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

/** Resolve a student id from profile or auth users (CSV / import flows). */
export async function resolveStudentIdByEmail(
  admin: SupabaseClient<Database>,
  email: string,
  authIndex?: Map<string, { id: string; lastSignInAt: string | null }>,
) {
  const normalized = email.trim().toLowerCase();
  const profile = await findProfileByEmail(admin, normalized);
  if (profile) return profile.id;
  const authMeta = authIndex?.get(normalized);
  return authMeta?.id ?? null;
}

export async function ensureImportedStudentProfile(
  admin: SupabaseClient<Database>,
  params: {
    studentId: string;
    email: string;
    fullName: string;
  },
) {
  const { error } = await admin.from("profiles").upsert(
    {
      id: params.studentId,
      email: params.email.trim().toLowerCase(),
      full_name: params.fullName.trim(),
      role: "student",
      is_suspended: false,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
}

/** Auth user id for this email — may differ from a stale profiles.id shown in admin. */
export async function resolveCanonicalStudentId(
  admin: SupabaseClient<Database>,
  params: { studentId: string; email: string },
) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const authIndex = await loadAuthEmailIndex(admin);
  const authId = authIndex.get(normalizedEmail)?.id;
  if (authId) return authId;
  return params.studentId;
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
    const { data: orphanEnrollments, error: enrollError } = await admin
      .from("enrollments")
      .select("id, course_id")
      .eq("student_id", orphan.id);

    if (enrollError) throw new Error(enrollError.message);

    for (const enrollment of orphanEnrollments ?? []) {
      const { data: existing } = await admin
        .from("enrollments")
        .select("id")
        .eq("student_id", params.authUserId)
        .eq("course_id", enrollment.course_id)
        .maybeSingle();

      if (existing) {
        await admin.from("enrollments").delete().eq("id", enrollment.id);
        continue;
      }

      const { error: moveError } = await admin
        .from("enrollments")
        .update({ student_id: params.authUserId })
        .eq("id", enrollment.id);
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
  },
): Promise<{ newlyEnrolled: string[] }> {
  const { sendCourseEnrollmentEmail } = await import("@/lib/system-email-triggers");
  const { notify } = await import("@/lib/notifications");

  const canonicalStudentId = await resolveCanonicalStudentId(admin, {
    studentId: params.studentId,
    email: params.email,
  });
  await reconcileOrphanEnrollmentsForEmail(admin, {
    authUserId: canonicalStudentId,
    email: params.email,
  });

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
    if (error) throw new Error(error.message);

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
