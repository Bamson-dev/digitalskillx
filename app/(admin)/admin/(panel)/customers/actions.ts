"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { logAudit } from "@/lib/audit";
import {
  deleteSegment,
  normalizeSegmentDefinition,
  saveSegment,
  type SegmentDefinition,
} from "@/lib/customer-segments";
import {
  deleteCourseBundle,
  enrollStudentInBundle,
  saveCourseBundle,
} from "@/lib/course-bundles";
import { deleteTagCatalog, upsertTagCatalog, renameTagAcrossProfiles } from "@/lib/tag-catalog";

export async function saveSegmentAction(formData: FormData) {
  const adminUser = await requireAdmin();
  const admin = await getAdminSupabase();
  const id = String(formData.get("id") ?? "") || undefined;
  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  let definition: SegmentDefinition = { logic: "and", rules: [] };
  try {
    definition = normalizeSegmentDefinition(JSON.parse(String(formData.get("definition") ?? "{}")));
  } catch {
    definition = { logic: "and", rules: [] };
  }
  const row = await saveSegment(admin, {
    id,
    name,
    description,
    definition,
    createdBy: adminUser.id,
  });
  await logAudit({
    action: id ? "segment_updated" : "segment_created",
    targetType: "customer_segment",
    targetId: row.id,
  });
  revalidatePath("/admin/segments");
}

export async function deleteSegmentAction(formData: FormData) {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const id = String(formData.get("id") ?? "");
  await deleteSegment(admin, id);
  await logAudit({ action: "segment_deleted", targetType: "customer_segment", targetId: id });
  revalidatePath("/admin/segments");
}

export async function saveBundleAction(formData: FormData) {
  const adminUser = await requireAdmin();
  const admin = await getAdminSupabase();
  const id = String(formData.get("id") ?? "") || undefined;
  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "");
  const priceNgn = Number(formData.get("priceNgn") ?? 0);
  const courseIds = String(formData.get("courseIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const bundleId = await saveCourseBundle(admin, {
    id,
    title,
    description,
    priceNgn,
    courseIds,
    createdBy: adminUser.id,
  });
  await logAudit({
    action: id ? "bundle_updated" : "bundle_created",
    targetType: "course_bundle",
    targetId: bundleId,
  });
  revalidatePath("/admin/bundles");
}

export async function deleteBundleAction(formData: FormData) {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const id = String(formData.get("id") ?? "");
  await deleteCourseBundle(admin, id);
  await logAudit({ action: "bundle_deleted", targetType: "course_bundle", targetId: id });
  revalidatePath("/admin/bundles");
}

export async function enrollBundleAction(formData: FormData) {
  const adminUser = await requireAdmin();
  const admin = await getAdminSupabase();
  const studentId = String(formData.get("studentId") ?? "");
  const bundleId = String(formData.get("bundleId") ?? "");
  const result = await enrollStudentInBundle(admin, {
    studentId,
    bundleId,
    enrolledBy: adminUser.id,
  });
  await logAudit({
    action: "bundle_enrolled",
    targetType: "course_bundle",
    targetId: bundleId,
    metadata: { studentId, ...result },
  });
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/admin/bundles");
}

export async function saveTagCatalogAction(formData: FormData) {
  const adminUser = await requireAdmin();
  const admin = await getAdminSupabase();
  const id = String(formData.get("id") ?? "") || undefined;
  const label = String(formData.get("label") ?? "");
  const oldLabel = String(formData.get("oldLabel") ?? "");
  await upsertTagCatalog(admin, { id, label, createdBy: adminUser.id });
  if (id && oldLabel && oldLabel !== label) {
    await renameTagAcrossProfiles(admin, oldLabel, label);
  }
  await logAudit({
    action: id ? "tag_renamed" : "tag_created",
    targetType: "tag_catalog",
    metadata: { label, oldLabel: oldLabel || null },
  });
  revalidatePath("/admin/students");
  revalidatePath("/admin/segments");
}

export async function deleteTagCatalogAction(formData: FormData) {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const id = String(formData.get("id") ?? "");
  const label = await deleteTagCatalog(admin, id);
  await logAudit({
    action: "tag_deleted",
    targetType: "tag_catalog",
    targetId: id,
    metadata: { label },
  });
  revalidatePath("/admin/students");
}
