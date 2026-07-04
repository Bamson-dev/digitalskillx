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
