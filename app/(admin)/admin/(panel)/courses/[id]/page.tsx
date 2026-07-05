import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { requireAdmin } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/platform-settings";
import {
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  normalizeCertificateTemplateKey,
} from "@/lib/certificate-templates";
import { CourseEditor } from "@/components/admin/course-editor";
import { YoutubeImport } from "@/components/admin/youtube-import";
import type { AttachmentDisplay } from "@/lib/lesson-attachments-shared";

export const metadata: Metadata = { title: "Edit course" };

export default async function AdminCourseEditorPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();
  const supabase = await getAdminSupabase();

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

  const { data: courseResources } = await supabase
    .from("resources")
    .select("id, title, file_url, file_type, position")
    .eq("course_id", params.id)
    .is("lesson_id", null)
    .eq("is_archived", false)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

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

      <YoutubeImport
        courseId={course.id}
        modules={modules.map((m) => ({ id: m.id, title: m.title }))}
      />

      <CourseEditor
        course={course}
        modules={modules}
        categories={categories.data ?? []}
        globalDefaultTemplateKey={globalDefaultTemplateKey}
        lessonAttachments={lessonAttachments}
        courseResources={(courseResources ?? []) as AttachmentDisplay[]}
      />
    </div>
  );
}
