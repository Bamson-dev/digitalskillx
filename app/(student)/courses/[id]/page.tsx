import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PlayCircle, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { getStudentViewSupabase } from "@/lib/student-view-supabase";
import { Card } from "@/components/ui/card";
import { CourseResources } from "@/components/student/course-resources";

export const metadata: Metadata = { title: "Course" };

export default async function CourseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireStudent();
  const isAdminPreview = profile.role === "admin";
  const supabase = await getStudentViewSupabase(profile);

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", profile.id)
    .eq("course_id", params.id)
    .maybeSingle();

  if (!enrollment && !isAdminPreview) {
    redirect(`/course/${params.id}`);
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, description, modules(id, title, position, lessons(id, title, position))")
    .eq("id", params.id)
    .single();

  if (!course) notFound();

  const { data: resources } = await supabase
    .from("resources")
    .select("id, title, file_url, file_type")
    .eq("course_id", params.id)
    .is("lesson_id", null)
    .eq("is_archived", false)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const modules = (course.modules ?? []).sort(
    (a, b) => a.position - b.position,
  );

  return (
    <div className="space-y-6">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to courses
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{course.title}</h1>
        {isAdminPreview && !enrollment ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Admin preview — you are viewing this course as a student would, without enrolling.
          </p>
        ) : null}
        {course.description ? (
          <p className="mt-1 text-sm text-muted">{course.description}</p>
        ) : null}
      </div>

      {modules.length === 0 ? (
        <Card className="text-center text-sm text-muted">
          This course doesn&apos;t have any content yet. The course player
          (video, progress tracking, notes) arrives in Phase 2.
        </Card>
      ) : (
        <div className="space-y-4">
          {modules.map((m) => {
            const lessons = (m.lessons ?? []).sort(
              (a, b) => a.position - b.position,
            );
            return (
              <Card key={m.id}>
                <h3 className="font-semibold">{m.title}</h3>
                <ul className="mt-2 divide-y divide-[rgb(var(--border))]">
                  {lessons.map((l) => (
                    <li key={l.id} className="py-2 text-sm">
                      <Link href={`/lessons/${l.id}`} className="flex items-center justify-between hover:text-brand">
                        <span>{l.title}</span>
                        <PlayCircle className="h-4 w-4 text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <CourseResources resources={resources ?? []} />
    </div>
  );
}
