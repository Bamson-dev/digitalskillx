"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { CourseVisibility, EnrollmentType, LessonType } from "@/types/database";

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

export async function updateCourseSettings(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));

  const { data: before } = await supabase
    .from("courses")
    .select("price_ngn, price_usd")
    .eq("id", id)
    .single();

  const required = Number(formData.get("required_completion_pct") ?? 100);
  const priceNgn = Number(formData.get("price_ngn") ?? 0);
  const priceUsd = Number(formData.get("price_usd") ?? 0);
  const outcomes = String(formData.get("learning_outcomes") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const { error } = await supabase
    .from("courses")
    .update({
      title: String(formData.get("title") ?? "").trim(),
      description: String(formData.get("description") ?? ""),
      short_description: String(formData.get("short_description") ?? "") || null,
      thumbnail_url: String(formData.get("thumbnail_url") ?? "") || null,
      promo_video_url: String(formData.get("promo_video_url") ?? "") || null,
      category_id: String(formData.get("category_id") ?? "") || null,
      visibility: String(formData.get("visibility") ?? "draft") as CourseVisibility,
      enrollment_type: String(formData.get("enrollment_type") ?? "open") as EnrollmentType,
      certificate_enabled: formData.get("certificate_enabled") === "on",
      drip_enabled: formData.get("drip_enabled") === "on",
      required_completion_pct: Number.isFinite(required) ? required : 100,
      price_ngn: Number.isFinite(priceNgn) && priceNgn >= 0 ? Math.round(priceNgn) : 0,
      price_usd: Number.isFinite(priceUsd) && priceUsd >= 0 ? Math.round(priceUsd) : 0,
      learning_outcomes: outcomes,
      instructor_name: String(formData.get("instructor_name") ?? "") || null,
      instructor_bio: String(formData.get("instructor_bio") ?? "") || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

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
