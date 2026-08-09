import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Central ownership checks for recommendations and checkout. */

export async function listOwnedCourseIds(
  admin: SupabaseClient,
  studentId: string,
): Promise<Set<string>> {
  const { data } = await admin
    .from("enrollments")
    .select("course_id")
    .eq("student_id", studentId)
    .limit(2_000);
  return new Set((data ?? []).map((r) => r.course_id));
}

export async function studentOwnsCourse(
  admin: SupabaseClient,
  studentId: string,
  courseId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .maybeSingle();
  return Boolean(data);
}

export async function studentOwnsDigitalProduct(
  admin: SupabaseClient,
  studentId: string,
  digitalProductId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("digital_product_entitlements")
    .select("id")
    .eq("student_id", studentId)
    .eq("digital_product_id", digitalProductId)
    .maybeSingle();
  return Boolean(data);
}

export async function studentOwnsAllBundleCourses(
  admin: SupabaseClient,
  studentId: string,
  courseIds: string[],
): Promise<boolean> {
  if (!courseIds.length) return false;
  const owned = await listOwnedCourseIds(admin, studentId);
  return courseIds.every((id) => owned.has(id));
}

/** Bundle provides value if at least one course is not yet owned. */
export async function bundleProvidesNewValue(
  admin: SupabaseClient,
  studentId: string,
  courseIds: string[],
): Promise<boolean> {
  if (!courseIds.length) return false;
  const owned = await listOwnedCourseIds(admin, studentId);
  return courseIds.some((id) => !owned.has(id));
}
