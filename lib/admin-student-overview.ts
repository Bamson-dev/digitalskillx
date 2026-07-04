import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { courseCompletionPct } from "@/lib/progress";

export type StudentOverviewStats = {
  courseCount: number;
  avgProgressPct: number | null;
  lastActiveAt: string | null;
  lastSignInAt: string | null;
  hasLoggedIn: boolean;
};

export async function loadAuthEmailIndex(admin: SupabaseClient<Database>) {
  const map = new Map<string, { id: string; lastSignInAt: string | null }>();
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const user of data.users) {
      const email = user.email?.trim().toLowerCase();
      if (email) {
        map.set(email, { id: user.id, lastSignInAt: user.last_sign_in_at ?? null });
      }
    }
    if (data.users.length < 1000) break;
    page += 1;
    if (page > 50) break;
  }

  return map;
}

export async function loadStudentOverviewStats(
  admin: SupabaseClient<Database>,
  students: Array<{ id: string; last_active_at: string | null; email: string }>,
  options?: { includeProgress?: boolean },
): Promise<Map<string, StudentOverviewStats>> {
  const result = new Map<string, StudentOverviewStats>();
  if (students.length === 0) return result;

  const includeProgress = options?.includeProgress ?? students.length <= 40;
  const studentIds = students.map((s) => s.id);

  const [{ data: enrollments }, authIndex] = await Promise.all([
    admin.from("enrollments").select("student_id, course_id").in("student_id", studentIds),
    loadAuthEmailIndex(admin),
  ]);

  const courseCount = new Map<string, number>();
  const coursesByStudent = new Map<string, string[]>();
  for (const row of enrollments ?? []) {
    courseCount.set(row.student_id, (courseCount.get(row.student_id) ?? 0) + 1);
    const list = coursesByStudent.get(row.student_id) ?? [];
    list.push(row.course_id);
    coursesByStudent.set(row.student_id, list);
  }

  const progressByStudent = new Map<string, number | null>();
  if (includeProgress) {
    await Promise.all(
      students.map(async (student) => {
        const courseIds = coursesByStudent.get(student.id) ?? [];
        if (courseIds.length === 0) {
          progressByStudent.set(student.id, null);
          return;
        }
        const pcts = await Promise.all(
          courseIds.map((courseId) => courseCompletionPct(student.id, courseId)),
        );
        const avg = Math.round(pcts.reduce((sum, pct) => sum + pct, 0) / pcts.length);
        progressByStudent.set(student.id, avg);
      }),
    );
  }

  for (const student of students) {
    const authMeta = authIndex.get(student.email.trim().toLowerCase());
    const lastSignInAt = authMeta?.lastSignInAt ?? null;
    const lastActiveAt = student.last_active_at ?? lastSignInAt;

    result.set(student.id, {
      courseCount: courseCount.get(student.id) ?? 0,
      avgProgressPct: includeProgress ? (progressByStudent.get(student.id) ?? null) : null,
      lastActiveAt,
      lastSignInAt,
      hasLoggedIn: Boolean(lastSignInAt || student.last_active_at),
    });
  }

  return result;
}

export function formatLastAccess(stats: StudentOverviewStats | undefined) {
  if (!stats) return "—";
  if (!stats.hasLoggedIn) return "Never logged in";
  const stamp = stats.lastActiveAt ?? stats.lastSignInAt;
  if (!stamp) return "Never logged in";
  return stamp;
}
