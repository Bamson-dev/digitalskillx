import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/platform-settings";
import {
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  normalizeCertificateTemplateKey,
} from "@/lib/certificate-templates";
import { CourseEditor } from "@/components/admin/course-editor";
import { YoutubeImport } from "@/components/admin/youtube-import";
import type { AttachmentDisplay } from "@/lib/lesson-attachments-shared";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { addResource, deleteResource } from "../actions";

export const metadata: Metadata = { title: "Edit course" };

export default async function AdminCourseEditorPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();
  const supabase = createClient();

  const { data: course } = await supabase
    .from("courses")
    .select(
      "*, modules(*, lessons(*))",
    )
    .eq("id", params.id)
    .single();

  if (!course) notFound();

  const [categories, settings] = await Promise.all([
    supabase.from("course_categories").select("id, name, template_key").order("name"),
    getPlatformSettings(supabase),
  ]);

  const globalDefaultTemplateKey =
    normalizeCertificateTemplateKey(settings.default_certificate_template_key) ??
    DEFAULT_CERTIFICATE_TEMPLATE_KEY;

  const { data: resources } = await supabase
    .from("resources")
    .select("id, title, file_url, file_type, lesson_id")
    .eq("course_id", params.id)
    .is("lesson_id", null)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  const { data: lessonResources } = await supabase
    .from("resources")
    .select("id, title, file_url, file_type, lesson_id")
    .eq("course_id", params.id)
    .not("lesson_id", "is", null)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });

  const lessonAttachments: Record<string, AttachmentDisplay[]> = {};
  for (const resource of lessonResources ?? []) {
    if (!resource.lesson_id) continue;
    (lessonAttachments[resource.lesson_id] ??= []).push({
      id: resource.id,
      title: resource.title,
      file_url: resource.file_url,
      file_type: resource.file_type,
    });
  }

  const modules = [...(course.modules ?? [])].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/admin/courses"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All courses
        </Link>
        <Link
          href={`/courses/${course.id}`}
          className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
          target="_blank"
        >
          <Eye className="h-4 w-4" /> Preview as student
        </Link>
      </div>

      <CourseEditor
        course={course}
        modules={modules}
        categories={categories.data ?? []}
        globalDefaultTemplateKey={globalDefaultTemplateKey}
        lessonAttachments={lessonAttachments}
      />

      <YoutubeImport
        courseId={course.id}
        modules={modules.map((m) => ({ id: m.id, title: m.title }))}
      />

      <Card>
        <CardHeader title="Resources" description="Downloadable files for this course (private bucket, signed URLs)." />
        <form action={addResource} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
          <input type="hidden" name="course_id" value={course.id} />
          <Input name="title" placeholder="Title" required />
          <Input name="file_url" placeholder="Storage path or https URL" required />
          <Input name="file_type" placeholder="pdf, zip…" />
          <Button type="submit" variant="outline">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
        <ul className="mt-3 divide-y divide-[rgb(var(--border))]">
          {(resources ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <span className="font-medium">{r.title}</span>{" "}
                {r.file_type ? <span className="text-muted">· {r.file_type}</span> : null}
              </span>
              <form action={deleteResource}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="course_id" value={course.id} />
                <button type="submit" className="text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </li>
          ))}
          {(resources ?? []).length === 0 ? <li className="py-2 text-sm text-muted">No resources yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
