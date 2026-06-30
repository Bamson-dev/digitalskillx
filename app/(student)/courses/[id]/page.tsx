import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PlayCircle, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Course" };

export default async function CourseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireStudent();
  const supabase = createClient();

  // RLS ensures the student can only read this if enrolled (or it's published).
  const { data: course } = await supabase
    .from("courses")
    .select("id, title, description, modules(id, title, position, lessons(id, title, position))")
    .eq("id", params.id)
    .single();

  if (!course) notFound();

  const { data: resources } = await supabase
    .from("resources")
    .select("id, title, file_type")
    .eq("course_id", params.id)
    .eq("is_archived", false);

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

      {resources && resources.length > 0 ? (
        <Card>
          <h3 className="mb-2 font-semibold">Resources</h3>
          <ul className="space-y-1 text-sm">
            {resources.map((r) => (
              <li key={r.id}>
                <a href={`/api/resources/${r.id}/download`} className="inline-flex items-center gap-2 text-brand hover:underline">
                  <Download className="h-4 w-4" /> {r.title}
                  {r.file_type ? <span className="text-muted">· {r.file_type}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
