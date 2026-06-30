import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Award, Flame, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function StudentDashboardPage() {
  const profile = await requireStudent();
  const supabase = createClient();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, enrolled_at, completed_at, course:courses(id, title, description, thumbnail_url)")
    .eq("student_id", profile.id)
    .order("enrolled_at", { ascending: false });

  const { count: certCount } = await supabase
    .from("certificates")
    .select("*", { count: "exact", head: true })
    .eq("student_id", profile.id)
    .eq("is_valid", true);

  const courses = enrollments ?? [];
  const firstName = (profile.full_name ?? "there").split(" ")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {firstName}</h1>
        <p className="mt-1 text-sm text-muted">
          Pick up where you left off.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Enrolled courses"
          value={courses.length}
          icon={<BookOpen className="h-5 w-5" />}
        />
        <StatCard
          label="Certificates"
          value={certCount ?? 0}
          icon={<Award className="h-5 w-5" />}
        />
        <StatCard
          label="Learning streak"
          value="0 days"
          hint="Keep it going!"
          icon={<Flame className="h-5 w-5" />}
        />
      </div>

      <section>
        <CardHeader title="My courses" description="Your enrolled courses." />
        {courses.length === 0 ? (
          <Card className="text-center">
            <p className="text-sm text-muted">
              You&apos;re not enrolled in any courses yet. Once an admin enrolls
              you (or a course opens for self-enrollment), it&apos;ll show up
              here.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((e) => {
              const course = Array.isArray(e.course) ? e.course[0] : e.course;
              if (!course) return null;
              return (
                <Link key={e.id} href={`/courses/${course.id}`}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <div className="mb-3 flex h-28 items-center justify-center rounded-lg bg-brand-50 text-brand">
                      <BookOpen className="h-8 w-8" />
                    </div>
                    <h3 className="font-semibold">{course.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">
                      {course.description ?? "No description yet."}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted">
                      <span>
                        {e.completed_at
                          ? `Completed ${formatDate(e.completed_at)}`
                          : `Enrolled ${formatDate(e.enrolled_at)}`}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
