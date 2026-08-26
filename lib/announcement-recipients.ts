import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { formatPostgrestError } from "@/lib/postgrest-error";

export type AnnouncementRecipient = {
  id: string;
  email: string;
  full_name: string | null;
};

/** PostgREST `.in()` filters blow up URLs above ~100 UUIDs and return "Bad Request". */
const IN_CHUNK = 80;
const PAGE = 500;

async function loadStudentProfiles(
  admin: SupabaseClient<Database>,
  studentIds: string[],
): Promise<AnnouncementRecipient[]> {
  const unique = [...new Set(studentIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const byId = new Map<string, AnnouncementRecipient>();
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const slice = unique.slice(i, i + IN_CHUNK);
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", slice)
      .eq("role", "student")
      .eq("is_suspended", false);
    if (profileError) throw new Error(formatPostgrestError(profileError));
    for (const row of profiles ?? []) {
      if (!row.email?.trim()) continue;
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

async function collectPaidTransactionStudentIds(admin: SupabaseClient<Database>) {
  const ids = new Set<string>();
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await admin
      .from("transactions")
      .select("student_id")
      .eq("status", "success")
      .not("student_id", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(formatPostgrestError(error));
    const rows = data ?? [];
    for (const row of rows) {
      if (row.student_id) ids.add(row.student_id);
    }
    if (rows.length < PAGE) break;
  }
  return ids;
}

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
    if (error) throw new Error(formatPostgrestError(error));
    return (data ?? []).filter((row) => row.email?.trim());
  }

  const courseIds = [...new Set(params.courseIds.filter(Boolean))];
  if (courseIds.length === 0) {
    throw new Error("Select at least one course.");
  }

  const studentIds = new Set<string>();
  for (let i = 0; i < courseIds.length; i += IN_CHUNK) {
    const slice = courseIds.slice(i, i + IN_CHUNK);
    const { data: enrollments, error: enrollError } = await admin
      .from("enrollments")
      .select("student_id")
      .in("course_id", slice);
    if (enrollError) throw new Error(formatPostgrestError(enrollError));
    for (const row of enrollments ?? []) studentIds.add(row.student_id);
  }

  return loadStudentProfiles(admin, [...studentIds]);
}

async function resolveCoursePublishRecipientsViaRpc(
  admin: SupabaseClient<Database>,
): Promise<AnnouncementRecipient[] | null> {
  const { data, error } = await admin.rpc("list_course_publish_recipients");
  if (error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("does not exist") ||
      msg.includes("could not find the function") ||
      error.code === "PGRST202"
    ) {
      return null;
    }
    throw new Error(formatPostgrestError(error));
  }
  return (data ?? []).filter((row) => row.email?.trim()) as AnnouncementRecipient[];
}

/** Fast fallback: active students with email (no full enrollments table scan). */
async function resolveCoursePublishRecipientsViaProfiles(
  admin: SupabaseClient<Database>,
): Promise<AnnouncementRecipient[]> {
  const recipients: AnnouncementRecipient[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("role", "student")
      .eq("is_suspended", false)
      .not("email", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(formatPostgrestError(error));
    const rows = data ?? [];
    for (const row of rows) {
      if (row.email?.trim()) recipients.push(row);
    }
    if (rows.length < PAGE) break;
  }
  return recipients;
}

/** Students to notify on course publish: enrolled or paid (RPC), else active students. */
export async function resolveCoursePublishRecipients(
  admin: SupabaseClient<Database>,
): Promise<AnnouncementRecipient[]> {
  const viaRpc = await resolveCoursePublishRecipientsViaRpc(admin);
  if (viaRpc) return viaRpc;
  return resolveCoursePublishRecipientsViaProfiles(admin);
}

/** Students who paid or were granted a paid DigitalSkillX course (not free self-enroll only). */
export async function resolvePaidStudentRecipients(
  admin: SupabaseClient<Database>,
): Promise<AnnouncementRecipient[]> {
  const studentIds = new Set<string>();
  for (const id of await collectPaidTransactionStudentIds(admin)) studentIds.add(id);

  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await admin
      .from("enrollments")
      .select("student_id")
      .neq("source", "self")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(formatPostgrestError(error));
    const rows = data ?? [];
    for (const row of rows) studentIds.add(row.student_id);
    if (rows.length < PAGE) break;
  }

  return loadStudentProfiles(admin, [...studentIds]);
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

/** Strip HTML but keep paragraph breaks for readable email bodies. */
export function stripHtmlForEmail(html: string, maxLength = 1_200) {
  const text = html
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const lastBreak = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  const soft = lastBreak > maxLength * 0.6 ? cut.slice(0, lastBreak + (cut[lastBreak] === "." ? 1 : 0)) : cut;
  return `${soft.trim()}…`;
}

/** Turn plain text with newlines into spaced email paragraphs. */
export function proseToEmailHtml(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => block.replace(/\n/g, "<br/>"));
  if (paragraphs.length === 0) return "";
  return paragraphs
    .map(
      (block) =>
        `<p style="margin:0 0 16px;padding:0;font-size:15px;line-height:1.7;color:#334155">${block}</p>`,
    )
    .join("");
}
