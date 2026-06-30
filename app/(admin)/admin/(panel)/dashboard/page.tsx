import type { Metadata } from "next";
import { Users, BookOpen, Award, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/admin/stat-card";
import { Card, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin dashboard" };

async function count(table: string, filter?: (q: any) => any) {
  const supabase = createClient();
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count: c } = await query;
  return c ?? 0;
}

export default async function AdminDashboardPage() {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [students, activeStudents, courses, certificates, lessonsCompleted] =
    await Promise.all([
      count("profiles", (q) => q.eq("role", "student")),
      count("profiles", (q) =>
        q.eq("role", "student").gte("last_active_at", sevenDaysAgo),
      ),
      count("courses"),
      count("certificates", (q) => q.eq("is_valid", true)),
      count("lesson_progress", (q) => q.eq("completed", true)),
    ]);

  const stats = [
    {
      label: "Total students",
      value: students,
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: "Active (7 days)",
      value: activeStudents,
      hint: "Students with recent activity",
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: "Total courses",
      value: courses,
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      label: "Lessons completed",
      value: lessonsCompleted,
      hint: "Platform-wide",
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    {
      label: "Certificates issued",
      value: certificates,
      icon: <Award className="h-5 w-5" />,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Platform overview at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <Card>
        <CardHeader
          title="Next steps"
          description="Phase 1 foundation is live. Continue building out the platform."
        />
        <ul className="space-y-2 text-sm text-muted">
          <li>• Create your first course category and course (Phase 2).</li>
          <li>• Enroll students manually or via CSV upload (Phase 5).</li>
          <li>• Connect Supabase + run the migrations in <code>/supabase/migrations</code>.</li>
        </ul>
      </Card>
    </div>
  );
}
