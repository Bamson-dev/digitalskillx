import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  BookOpen,
  Award,
  CheckCircle2,
  Plus,
  Link2,
  Settings,
  GraduationCap,
} from "lucide-react";
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
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    students,
    activeStudents,
    courses,
    publishedCourses,
    enrollments,
    certificates,
    lessonsCompleted,
  ] = await Promise.all([
    count("profiles", (q) => q.eq("role", "student")),
    count("profiles", (q) => q.eq("role", "student").gte("last_active_at", sevenDaysAgo)),
    count("courses"),
    count("courses", (q) => q.eq("visibility", "published")),
    count("enrollments"),
    count("certificates", (q) => q.eq("is_valid", true)),
    count("lesson_progress", (q) => q.eq("completed", true)),
  ]);

  const stats = [
    {
      label: "Students",
      value: students,
      hint: "Profiles with student role",
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: "Active (7 days)",
      value: activeStudents,
      hint: "Students with last_active_at in the last week",
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: "Published courses",
      value: publishedCourses,
      hint: `${courses} total courses (all statuses)`,
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      label: "Enrollments",
      value: enrollments,
      hint: "All enrollment rows",
      icon: <GraduationCap className="h-5 w-5" />,
    },
    {
      label: "Lessons completed",
      value: lessonsCompleted,
      hint: "Completed lesson_progress rows",
      icon: <CheckCircle2 className="h-5 w-5" />,
    },
    {
      label: "Certificates issued",
      value: certificates,
      hint: "Valid certificates only",
      icon: <Award className="h-5 w-5" />,
    },
  ];

  const shortcuts = [
    { href: "/admin/courses", label: "Create or edit a course", icon: Plus },
    { href: "/admin/students", label: "Add students", icon: Users },
    { href: "/admin/enrollment-links", label: "Share an enrollment link", icon: Link2 },
    { href: "/admin/analytics", label: "View analytics", icon: CheckCircle2 },
    { href: "/admin/settings", label: "Platform settings", icon: Settings },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Live counts from your database — zeros mean empty data, not placeholders.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {students === 0 && publishedCourses === 0 ? (
        <Card>
          <CardHeader
            title="Get started"
            description="No students or published courses yet. Create a course, then share an enrollment link."
          />
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/courses"
              className="inline-flex h-10 items-center bg-brand px-4 text-sm font-semibold text-white"
            >
              Create a course
            </Link>
            <Link
              href="/admin/enrollment-links"
              className="inline-flex h-10 items-center border border-app px-4 text-sm font-semibold"
            >
              Enrollment links
            </Link>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Quick actions"
          description="Common tasks to run your academy."
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {shortcuts.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-[44px] items-center gap-3 rounded-lg border border-app bg-white px-4 py-3 text-sm font-medium transition hover:border-brand hover:bg-brand-50/40"
            >
              <Icon className="h-4 w-4 text-brand" />
              {label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
