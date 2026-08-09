import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/schema-guard";

export type CourseBundle = {
  id: string;
  title: string;
  description: string | null;
  price_ngn: number;
  price_usd: number;
  is_active: boolean;
  courseIds: string[];
};

export async function listCourseBundles(admin: SupabaseClient): Promise<CourseBundle[]> {
  const { data, error } = await admin
    .from("course_bundles")
    .select("id, title, description, price_ngn, price_usd, is_active, items:course_bundle_items(course_id, sort_order)")
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((b) => {
    const items = Array.isArray(b.items) ? b.items : [];
    const sorted = [...items].sort(
      (a, b) => Number((a as { sort_order?: number }).sort_order ?? 0) - Number((b as { sort_order?: number }).sort_order ?? 0),
    );
    return {
      id: b.id,
      title: b.title,
      description: b.description,
      price_ngn: b.price_ngn,
      price_usd: Number(b.price_usd),
      is_active: b.is_active,
      courseIds: sorted.map((i) => String((i as { course_id: string }).course_id)),
    };
  });
}

export async function saveCourseBundle(
  admin: SupabaseClient,
  input: {
    id?: string;
    title: string;
    description?: string;
    priceNgn: number;
    priceUsd?: number;
    isActive?: boolean;
    courseIds: string[];
    createdBy?: string | null;
  },
): Promise<string> {
  const courseIds = [...new Set(input.courseIds.filter(Boolean))];
  if (!courseIds.length) throw new Error("Add at least one course to the bundle.");

  const row = {
    title: input.title.trim().slice(0, 200),
    description: input.description?.trim().slice(0, 2000) || null,
    price_ngn: Math.max(0, Math.round(input.priceNgn)),
    price_usd: Math.max(0, Number(input.priceUsd ?? 0)),
    is_active: input.isActive !== false,
    updated_at: new Date().toISOString(),
  };

  let bundleId = input.id;
  if (bundleId) {
    const { error } = await admin.from("course_bundles").update(row).eq("id", bundleId);
    if (error) throw new Error(error.message);
    await admin.from("course_bundle_items").delete().eq("bundle_id", bundleId);
  } else {
    const { data, error } = await admin
      .from("course_bundles")
      .insert({ ...row, created_by: input.createdBy ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    bundleId = data.id;
  }

  const items = courseIds.map((course_id, sort_order) => ({
    bundle_id: bundleId!,
    course_id,
    sort_order,
  }));
  const { error: itemErr } = await admin.from("course_bundle_items").insert(items);
  if (itemErr) throw new Error(itemErr.message);
  return bundleId!;
}

export async function deleteCourseBundle(admin: SupabaseClient, id: string) {
  const { error } = await admin.from("course_bundles").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Grant access to all courses in a bundle using existing enrollments insert.
 * Does not create a second payment system — caller must already authorize the grant (admin).
 */
export async function enrollStudentInBundle(
  admin: SupabaseClient,
  params: {
    studentId: string;
    bundleId: string;
    enrolledBy?: string | null;
    /** Default admin for manual grants; use purchase for paid checkout. */
    source?: "admin" | "purchase";
  },
): Promise<{ enrolled: string[]; skipped: string[] }> {
  const { data: items, error } = await admin
    .from("course_bundle_items")
    .select("course_id")
    .eq("bundle_id", params.bundleId);
  if (error) throw new Error(error.message);

  const enrolled: string[] = [];
  const skipped: string[] = [];
  const source = params.source ?? "admin";
  for (const item of items ?? []) {
    const { data: existing } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", params.studentId)
      .eq("course_id", item.course_id)
      .maybeSingle();
    if (existing) {
      skipped.push(item.course_id);
      continue;
    }
    const { error: enrErr } = await admin.from("enrollments").insert({
      student_id: params.studentId,
      course_id: item.course_id,
      source,
      enrolled_by: params.enrolledBy ?? null,
    });
    if (enrErr && !enrErr.message.toLowerCase().includes("duplicate")) {
      throw new Error(enrErr.message);
    }
    enrolled.push(item.course_id);
  }
  return { enrolled, skipped };
}
