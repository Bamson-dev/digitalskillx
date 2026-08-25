import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type AnnouncementRecipient = {
  id: string;
  email: string;
  full_name: string | null;
};

export async function resolveAnnouncementRecipients(
  admin: SupabaseClient<Database>,
  params: { audience: "all" | "courses"; courseIds: string[] },
): Promise<AnnouncementRecipient[]> {
  if (params.audience === "all") {
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("role", "student")
      .eq("is_suspended", false);
    if (error) throw new Error(error.message);
    return (data ?? []).filter((row) => row.email?.trim());
  }

  const courseIds = [...new Set(params.courseIds.filter(Boolean))];
  if (courseIds.length === 0) {
    throw new Error("Select at least one course.");
  }

  const { data: enrollments, error: enrollError } = await admin
    .from("enrollments")
    .select("student_id")
    .in("course_id", courseIds);
  if (enrollError) throw new Error(enrollError.message);

  const studentIds = [...new Set((enrollments ?? []).map((row) => row.student_id))];
  if (studentIds.length === 0) return [];

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", studentIds)
    .eq("role", "student")
    .eq("is_suspended", false);
  if (profileError) throw new Error(profileError.message);

  const byId = new Map<string, AnnouncementRecipient>();
  for (const row of profiles ?? []) {
    if (!row.email?.trim()) continue;
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

/** Students to notify on course publish: paid/granted access plus anyone enrolled on the platform. */
export async function resolveCoursePublishRecipients(
  admin: SupabaseClient<Database>,
): Promise<AnnouncementRecipient[]> {
  const paid = await resolvePaidStudentRecipients(admin);
  const byId = new Map(paid.map((row) => [row.id, row]));

  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await admin
      .from("enrollments")
      .select("student_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) break;

    const missingIds = [...new Set(rows.map((row) => row.student_id))].filter((id) => !byId.has(id));
    if (missingIds.length > 0) {
      for (let i = 0; i < missingIds.length; i += 1000) {
        const slice = missingIds.slice(i, i + 1000);
        const { data: profiles, error: profileError } = await admin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", slice)
          .eq("role", "student")
          .eq("is_suspended", false);
        if (profileError) throw new Error(profileError.message);
        for (const row of profiles ?? []) {
          if (!row.email?.trim()) continue;
          byId.set(row.id, row);
        }
      }
    }
    if (rows.length < 1000) break;
  }

  return [...byId.values()];
}

/** Students who paid or were granted a paid DigitalSkillX course (not free self-enroll only). */
export async function resolvePaidStudentRecipients(
  admin: SupabaseClient<Database>,
): Promise<AnnouncementRecipient[]> {
  const studentIds = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; from < 50_000; from += pageSize) {
    const { data, error } = await admin
      .from("transactions")
      .select("student_id")
      .eq("status", "success")
      .not("student_id", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      if (row.student_id) studentIds.add(row.student_id);
    }
    if (rows.length < pageSize) break;
  }

  for (let from = 0; from < 50_000; from += pageSize) {
    const { data, error } = await admin
      .from("enrollments")
      .select("student_id")
      .in("source", ["purchase", "admin", "enrollment_link"])
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) studentIds.add(row.student_id);
    if (rows.length < pageSize) break;
  }

  const ids = [...studentIds];
  if (ids.length === 0) return [];

  const byId = new Map<string, AnnouncementRecipient>();
  for (let i = 0; i < ids.length; i += pageSize) {
    const slice = ids.slice(i, i + pageSize);
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", slice)
      .eq("role", "student")
      .eq("is_suspended", false);
    if (profileError) throw new Error(profileError.message);
    for (const row of profiles ?? []) {
      if (!row.email?.trim()) continue;
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

export function stripHtmlPreview(html: string, maxLength = 160) {
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}
