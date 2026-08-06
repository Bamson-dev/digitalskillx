import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { requireAdmin } from "@/lib/auth";
import { StatCard } from "@/components/admin/stat-card";
import { SignupsChart, EnrollmentsChart } from "@/components/admin/analytics-charts";
import { getCourseAnalyticsSummaries } from "@/lib/course-analytics";
import { Users, GraduationCap, Award, TrendingUp } from "lucide-react";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  await requireAdmin();
  const supabase = createClient();

  const [{ data: profiles }, { data: enrollments }, { data: courses }, { count: certCount }] =
    await Promise.all([
      supabase.from("profiles").select("created_at").eq("role", "student"),
      supabase.from("enrollments").select("course_id, completed_at"),
      supabase.from("courses").select("id, title"),
      supabase.from("certificates").select("*", { count: "exact", head: true }),
    ]);

  const months: { key: string; month: string; count: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      month: d.toLocaleString("en", { month: "short" }),
      count: 0,
    });
  }
  for (const p of profiles ?? []) {
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.count++;
  }

  const titleById = new Map((courses ?? []).map((c) => [c.id, c.title]));
  const perCourse = new Map<string, { enrolled: number; completed: number }>();
  for (const e of enrollments ?? []) {
    const entry = perCourse.get(e.course_id) ?? { enrolled: 0, completed: 0 };
    entry.enrolled++;
    if (e.completed_at) entry.completed++;
    perCourse.set(e.course_id, entry);
  }
  const enrollmentData = Array.from(perCourse.entries())
    .map(([id, v]) => ({ course: (titleById.get(id) ?? "Course").slice(0, 16), ...v }))
    .sort((a, b) => b.enrolled - a.enrolled)
    .slice(0, 8);

  const totalEnrollments = (enrollments ?? []).length;
  const totalCompletions = (enrollments ?? []).filter((e) => e.completed_at).length;
  const completionRate = totalEnrollments
    ? Math.round((totalCompletions / totalEnrollments) * 100)
    : 0;

  let courseAnalytics: Awaited<ReturnType<typeof getCourseAnalyticsSummaries>> = [];
  try {
    const admin = await getAdminSupabase();
    courseAnalytics = await getCourseAnalyticsSummaries(admin, 10);
  } catch {
    courseAnalytics = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-muted">Platform-wide performance at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Students"
          value={(profiles ?? []).length}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Enrollments"
          value={totalEnrollments}
          icon={<GraduationCap className="h-5 w-5" />}
        />
        <StatCard
          label="Completion rate"
          value={`${completionRate}%`}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Certificates"
          value={certCount ?? 0}
          icon={<Award className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SignupsChart data={months.map(({ month, count }) => ({ month, count }))} />
        <EnrollmentsChart data={enrollmentData} />
      </div>

      <div className="overflow-hidden rounded-xl border border-app bg-white">
        <div className="border-b border-app px-4 py-3">
          <h2 className="font-semibold">Course performance</h2>
          <p className="text-xs text-muted">
            Starts, watch %, completion, drop-off, certificates — from enrollments and lesson
            progress.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted/40 text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 font-medium">Starts</th>
                <th className="px-3 py-2 font-medium">Avg watch %</th>
                <th className="px-3 py-2 font-medium">Completion</th>
                <th className="px-3 py-2 font-medium">Drop-off</th>
                <th className="px-3 py-2 font-medium">Certs</th>
                <th className="px-3 py-2 font-medium">Avg time</th>
                <th className="px-3 py-2 font-medium">Most watched</th>
              </tr>
            </thead>
            <tbody>
              {courseAnalytics.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    No course analytics available yet.
                  </td>
                </tr>
              ) : (
                courseAnalytics.map((row) => (
                  <tr key={row.courseId} className="border-t border-app">
                    <td className="px-3 py-2 font-medium">{row.title}</td>
                    <td className="px-3 py-2">{row.courseStarts}</td>
                    <td className="px-3 py-2">{row.avgWatchPercentage}%</td>
                    <td className="px-3 py-2">{Math.round(row.completionRate * 100)}%</td>
                    <td className="px-3 py-2">{Math.round(row.dropOffRate * 100)}%</td>
                    <td className="px-3 py-2">{row.certificates}</td>
                    <td className="px-3 py-2">
                      {row.avgCompletionHours != null ? `${row.avgCompletionHours}h` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {row.mostWatchedLesson?.title?.slice(0, 28) ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
