import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { StatCard } from "@/components/admin/stat-card";
import { SignupsChart, EnrollmentsChart } from "@/components/admin/analytics-charts";
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

  // Signups per month (last 6).
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

  // Enrollment + completion per course.
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
  const completionRate = totalEnrollments ? Math.round((totalCompletions / totalEnrollments) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-muted">Platform-wide performance at a glance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={(profiles ?? []).length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Enrollments" value={totalEnrollments} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Completion rate" value={`${completionRate}%`} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Certificates" value={certCount ?? 0} icon={<Award className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SignupsChart data={months.map(({ month, count }) => ({ month, count }))} />
        <EnrollmentsChart data={enrollmentData} />
      </div>
    </div>
  );
}
