"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  inferAttachmentType,
  uploadLessonAttachmentFile,
} from "@/lib/upload-lesson-attachment";
import { uploadPublicAsset } from "@/lib/upload-public-asset";
import { normalizeCertificateTemplateKey } from "@/lib/certificate-templates";
import type { CourseVisibility, EnrollmentType, LessonType } from "@/types/database";

export type LessonAttachmentState = { error?: string; message?: string };
export type CourseSettingsState = {
  error?: string;
  message?: string;
  thumbnail_url?: string | null;
};

function fileFrom(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size <= 0) return null;
  return value;
}

export async function createCourse(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = createClient();
  const title = String(formData.get("title") ?? "").trim() || "Untitled course";

  const { data, error } = await supabase
    .from("courses")
    .insert({ title, created_by: admin.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create course");

  await logAudit({ action: "course_created", targetType: "course", targetId: data.id });
  redirect(`/admin/courses/${data.id}`);
}

export async function updateCourseSettings(
  _prev: CourseSettingsState,
  formData: FormData,
): Promise<CourseSettingsState> {
  try {
    await requireAdmin();
    const supabase = createClient();
    const id = String(formData.get("id"));

    const { data: before, error: beforeError } = await supabase
      .from("courses")
      .select("price_ngn, price_usd")
      .eq("id", id)
      .single();

    if (beforeError) {
      if (beforeError.message.includes("price_usd") && beforeError.message.includes("does not exist")) {
        return {
          error:
            "The price_usd column is missing on courses. Run supabase/migrations/0006_price_usd.sql in the Supabase SQL Editor, then try again.",
        };
      }
      return { error: beforeError.message };
    }

    const required = Number(formData.get("required_completion_pct") ?? 100);
    const priceNgn = Number(formData.get("price_ngn") ?? 0);
    const priceUsd = Number(formData.get("price_usd") ?? 0);
    const outcomes = String(formData.get("learning_outcomes") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const clearThumbnail = formData.get("clear_thumbnail") === "1";
    const thumbnailFile = fileFrom(formData, "thumbnail");
    let thumbnailUrl = String(formData.get("thumbnail_url") ?? "").trim() || null;

    if (thumbnailFile) {
      try {
        thumbnailUrl = await uploadPublicAsset(thumbnailFile, `courses/${id}`);
      } catch (uploadError) {
        return {
          error:
            uploadError instanceof Error
              ? uploadError.message
              : "Could not upload course image.",
        };
      }
    } else if (clearThumbnail) {
      thumbnailUrl = null;
    }

    const templateOverrideRaw = String(formData.get("certificate_template_override") ?? "").trim();
    const certificateTemplateOverride = normalizeCertificateTemplateKey(templateOverrideRaw);

    const { error } = await supabase
      .from("courses")
      .update({
        title: String(formData.get("title") ?? "").trim(),
        description: String(formData.get("description") ?? ""),
        short_description: String(formData.get("short_description") ?? "") || null,
        thumbnail_url: thumbnailUrl,
        promo_video_url: String(formData.get("promo_video_url") ?? "") || null,
        category_id: String(formData.get("category_id") ?? "") || null,
        visibility: String(formData.get("visibility") ?? "draft") as CourseVisibility,
        enrollment_type: String(formData.get("enrollment_type") ?? "open") as EnrollmentType,
        certificate_enabled: formData.get("certificate_enabled") === "on",
        certificate_template_override: certificateTemplateOverride,
        drip_enabled: formData.get("drip_enabled") === "on",
        required_completion_pct: Number.isFinite(required) ? required : 100,
        price_ngn: Number.isFinite(priceNgn) && priceNgn >= 0 ? Math.round(priceNgn) : 0,
        price_usd: Number.isFinite(priceUsd) && priceUsd >= 0 ? Math.round(priceUsd) : 0,
        learning_outcomes: outcomes,
        instructor_name: String(formData.get("instructor_name") ?? "") || null,
        instructor_bio: String(formData.get("instructor_bio") ?? "") || null,
      })
      .eq("id", id);
    if (error) {
      if (error.message.includes("certificate_template_override")) {
        return {
          error:
            "The certificate_template_override column is missing on courses. Run sql/certificate-template-keys.sql in the Supabase SQL Editor, then try again.",
        };
      }
      if (error.message.includes("price_usd") && error.message.includes("does not exist")) {
        return {
          error:
            "The price_usd column is missing on courses. Run supabase/migrations/0006_price_usd.sql in the Supabase SQL Editor, then try again.",
        };
      }
      return { error: error.message };
    }

    if (before && (before.price_ngn !== priceNgn || before.price_usd !== priceUsd)) {
      await logAudit({
        action: "price_changed",
        targetType: "course",
        targetId: id,
        metadata: {
          price_ngn_before: before.price_ngn,
          price_ngn_after: priceNgn,
          price_usd_before: before.price_usd,
          price_usd_after: priceUsd,
        },
      });
    }

    await logAudit({ action: "course_edited", targetType: "course", targetId: id });
    revalidatePath(`/admin/courses/${id}`);
    revalidatePath(`/course/${id}`);
    return { message: "Course settings saved.", thumbnail_url: thumbnailUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save course settings." };
  }
}

export async function deleteCourse(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAudit({ action: "course_deleted", targetType: "course", targetId: id });
  redirect("/admin/courses");
}

export async function createModule(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const courseId = String(formData.get("course_id"));
  const title = String(formData.get("title") ?? "").trim() || "New module";

  const { count } = await supabase
    .from("modules")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId);

  const { error } = await supabase
    .from("modules")
    .insert({ course_id: courseId, title, position: count ?? 0 });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function renameModule(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));
  await supabase.from("modules").update({ title: String(formData.get("title") ?? "") }).eq("id", id);
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function deleteModule(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));
  await supabase.from("modules").delete().eq("id", id);
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function createLesson(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const moduleId = String(formData.get("module_id"));
  const courseId = String(formData.get("course_id"));

  const { count } = await supabase
    .from("lessons")
    .select("*", { count: "exact", head: true })
    .eq("module_id", moduleId);

  const { error } = await supabase.from("lessons").insert({
    module_id: moduleId,
    title: String(formData.get("title") ?? "").trim() || "New lesson",
    lesson_type: (String(formData.get("lesson_type") ?? "video") as LessonType),
    position: count ?? 0,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function updateLesson(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));

  const watch = Number(formData.get("required_watch_pct") ?? 0);
  const dripDays = formData.get("drip_days") ? Number(formData.get("drip_days")) : null;
  const duration = formData.get("duration_minutes")
    ? Math.round(Number(formData.get("duration_minutes")) * 60)
    : null;

  const { error } = await supabase
    .from("lessons")
    .update({
      title: String(formData.get("title") ?? "").trim(),
      description: String(formData.get("description") ?? "") || null,
      lesson_type: String(formData.get("lesson_type") ?? "video") as LessonType,
      content_url: String(formData.get("content_url") ?? "") || null,
      content_text: String(formData.get("content_text") ?? "") || null,
      is_free_preview: formData.get("is_free_preview") === "on",
      is_locked: formData.get("is_locked") === "on",
      required_watch_pct: Number.isFinite(watch) ? watch : 0,
      drip_days: dripDays,
      duration_seconds: duration,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function deleteLesson(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));
  await supabase.from("lessons").delete().eq("id", id);
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function reorderLessons(
  courseId: string,
  moduleId: string,
  lessonIds: string[],
) {
  await requireAdmin();
  const supabase = createClient();

  const updates = lessonIds.map((id, position) =>
    supabase.from("lessons").update({ position }).eq("id", id).eq("module_id", moduleId),
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  revalidatePath(`/admin/courses/${courseId}`);
}

export async function addLessonAttachment(
  _prev: LessonAttachmentState,
  formData: FormData,
): Promise<LessonAttachmentState> {
  await requireAdmin();
  const supabase = createClient();

  const courseId = String(formData.get("course_id") ?? "");
  const lessonId = String(formData.get("lesson_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const mode = String(formData.get("mode") ?? "file");

  if (!courseId || !lessonId) return { error: "Missing course or lesson." };
  if (!title) return { error: "Enter a display name for the attachment." };

  try {
    let fileUrl = "";
    let fileType: string | null = null;

    if (mode === "link") {
      fileUrl = String(formData.get("link_url") ?? "").trim();
      if (!/^https?:\/\//i.test(fileUrl)) {
        return { error: "Enter a valid URL starting with http:// or https://." };
      }
      fileType = "link";
    } else {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size <= 0) {
        return { error: "Choose a file to upload." };
      }
      fileUrl = await uploadLessonAttachmentFile(file, courseId, lessonId);
      fileType = inferAttachmentType(file);
    }

    const { error } = await supabase.from("resources").insert({
      course_id: courseId,
      lesson_id: lessonId,
      title,
      file_url: fileUrl,
      file_type: fileType,
    });
    if (error) return { error: error.message };

    await logAudit({
      action: "lesson_attachment_added",
      targetType: "lesson",
      targetId: lessonId,
      metadata: { title, file_type: fileType },
    });
    revalidatePath(`/admin/courses/${courseId}`);
    return { message: "Attachment added." };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not add attachment.",
    };
  }
}

export async function deleteLessonResource(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));
  const lessonId = String(formData.get("lesson_id"));

  const { error } = await supabase.from("resources").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await logAudit({
    action: "lesson_attachment_removed",
    targetType: "lesson",
    targetId: lessonId,
  });
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function addResource(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const courseId = String(formData.get("course_id"));
  const lessonId = String(formData.get("lesson_id") ?? "") || null;
  await supabase.from("resources").insert({
    course_id: courseId,
    lesson_id: lessonId,
    title: String(formData.get("title") ?? "Resource"),
    file_url: String(formData.get("file_url") ?? ""),
    file_type: String(formData.get("file_type") ?? "") || null,
    download_allowed: formData.get("download_allowed") !== "off",
  });
  await logAudit({ action: "resource_added", targetType: "course", targetId: courseId });
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function deleteResource(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const courseId = String(formData.get("course_id"));
  await supabase.from("resources").delete().eq("id", id);
  revalidatePath(`/admin/courses/${courseId}`);
}
