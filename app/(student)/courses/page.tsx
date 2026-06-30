import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "My Courses" };

export default async function StudentCoursesPage() {
  const profile = await requireStudent();
  const supabase = createClient();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, course:courses(id, title, description)")
    .eq("student_id", profile.id)
    .order("enrolled_at", { ascending: false });

  const courses = enrollments ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Courses</h1>
        <p className="mt-1 text-sm text-muted">Everything you&apos;re enrolled in.</p>
      </div>

      {courses.length === 0 ? (
        <Card className="text-center text-sm text-muted">
          No courses yet.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((e) => {
            const course = Array.isArray(e.course) ? e.course[0] : e.course;
            if (!course) return null;
            return (
              <Link key={e.id} href={`/courses/${course.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-brand-50 text-brand">
                    <BookOpen className="h-7 w-7" />
                  </div>
                  <h3 className="font-semibold">{course.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {course.description ?? "No description yet."}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
