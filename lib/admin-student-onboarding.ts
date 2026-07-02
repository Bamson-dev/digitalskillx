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

    const course = byTitle.get(trimmed.toLowerCase());
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
  rows: { rowNumber: number; cells: string[] }[];
} {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { header: false, rows: [] };

  const first = parseCsvRow(lines[0]);
  const header = first[0]?.toLowerCase() === "full_name";
  const startIndex = header ? 1 : 0;

  return {
    header,
    rows: lines.slice(startIndex).map((line, offset) => ({
      rowNumber: startIndex + offset + 1,
      cells: parseCsvRow(line),
    })),
  };
}

export async function profileEmailExists(
  admin: SupabaseClient<Database>,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", normalized)
    .maybeSingle();
  return Boolean(data);
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
  void params.courseNames;
  await sendWelcomeEmailIfNeeded({
    studentId: params.studentId,
    fullName: params.fullName,
    email: params.email,
    password: params.password,
  });
}
