"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import {
  parseAnnouncementType,
  type PlatformAnnouncementInput,
} from "@/lib/platform-announcements-shared";

export type AnnouncementActionState = {
  error?: string;
  message?: string;
};

function emptyToNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v ? v : null;
}

function parseDatetimeLocal(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function readInput(formData: FormData): PlatformAnnouncementInput | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!title) return { error: "Title is required." };
  if (!message) return { error: "Message is required." };

  const startsAt = parseDatetimeLocal(emptyToNull(formData.get("starts_at")));
  const endsAt = parseDatetimeLocal(emptyToNull(formData.get("ends_at")));
  if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
    return { error: "Start date must be before end date." };
  }

  return {
    title,
    message,
    type: parseAnnouncementType(formData.get("type")),
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
    is_fixed: formData.get("is_fixed") === "on" || formData.get("is_fixed") === "true",
    starts_at: startsAt,
    ends_at: endsAt,
  };
}

function missingTableMessage(message: string | undefined) {
  if (
    message?.includes("does not exist") ||
    message?.includes("schema cache") ||
    message?.includes("Could not find the table")
  ) {
    return "Announcements table is missing. Run migration 0056_platform_announcements.sql in Supabase.";
  }
  return message || "Something went wrong.";
}

export async function createPlatformAnnouncement(
  _prev: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  const admin = await requireAdmin();
  const parsed = readInput(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = (await getAdminSupabase()) as any;
  const { error } = await supabase.from("platform_announcements").insert({
    ...parsed,
    created_by: admin.id,
  });

  if (error) return { error: missingTableMessage(error.message) };

  revalidatePath("/admin/announcements");
  revalidatePath("/dashboard");
  return { message: "Announcement created." };
}

export async function updatePlatformAnnouncement(
  _prev: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing announcement id." };

  const parsed = readInput(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = (await getAdminSupabase()) as any;
  const { error } = await supabase
    .from("platform_announcements")
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: missingTableMessage(error.message) };

  revalidatePath("/admin/announcements");
  revalidatePath("/dashboard");
  return { message: "Announcement updated." };
}

export async function deletePlatformAnnouncement(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = (await getAdminSupabase()) as any;
  await supabase.from("platform_announcements").delete().eq("id", id);
  revalidatePath("/admin/announcements");
  revalidatePath("/dashboard");
}

export async function togglePlatformAnnouncementActive(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const next = formData.get("is_active") === "true";
  if (!id) return;

  const supabase = (await getAdminSupabase()) as any;
  await supabase
    .from("platform_announcements")
    .update({ is_active: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/admin/announcements");
  revalidatePath("/dashboard");
}
