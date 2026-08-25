import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import {
  inferAttachmentType,
  uploadLessonAttachmentFile,
} from "@/lib/upload-lesson-attachment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { lessonId: string } },
) {
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const courseId = String(form.get("course_id") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const mode = String(form.get("mode") ?? "file");
  const lessonId = params.lessonId;

  if (!courseId || !lessonId) {
    return NextResponse.json({ error: "Missing course or lesson." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Enter a display name for the attachment." }, { status: 400 });
  }

  try {
    let fileUrl = "";
    let fileType: string | null = null;

    if (mode === "link") {
      fileUrl = String(form.get("link_url") ?? "").trim();
      if (!/^https?:\/\//i.test(fileUrl)) {
        return NextResponse.json(
          { error: "Enter a valid URL starting with http:// or https://." },
          { status: 400 },
        );
      }
      fileType = "link";
    } else {
      const file = form.get("file");
      if (!(file instanceof File) || file.size <= 0) {
        return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
      }
      fileUrl = await uploadLessonAttachmentFile(file, courseId, lessonId);
      fileType = inferAttachmentType(file);
    }

    const { data, error } = await auth.admin
      .from("resources")
      .insert({
        course_id: courseId,
        lesson_id: lessonId,
        title,
        file_url: fileUrl,
        file_type: fileType,
      })
      .select("id, title, file_url, file_type")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAudit({
      action: "lesson_attachment_added",
      targetType: "lesson",
      targetId: lessonId,
      metadata: { title, file_type: fileType, storage_path: fileUrl },
    });

    return NextResponse.json({
      ok: true,
      message: "Attachment uploaded to server storage.",
      attachment: data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add attachment." },
      { status: 500 },
    );
  }
}
