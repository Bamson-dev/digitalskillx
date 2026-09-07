import "server-only";

import {
  isAnnouncementVisibleNow,
  sortAnnouncementsForStudent,
  type PlatformAnnouncement,
} from "@/lib/platform-announcements-shared";

export type {
  PlatformAnnouncement,
  PlatformAnnouncementInput,
  PlatformAnnouncementType,
} from "@/lib/platform-announcements-shared";

export {
  announcementVisibilityLabel,
  isAnnouncementVisibleNow,
  parseAnnouncementType,
  sortAnnouncementsForStudent,
} from "@/lib/platform-announcements-shared";

const SELECT_COLS =
  "id, title, message, type, is_active, is_fixed, starts_at, ends_at, created_by, created_at, updated_at";

type LooseClient = {
  from: (table: string) => any;
};

/** Visible announcements for the student dashboard. */
export async function fetchVisibleStudentAnnouncements(
  supabase: LooseClient,
  limit = 5,
): Promise<PlatformAnnouncement[]> {
  try {
    const { data, error } = await supabase
      .from("platform_announcements")
      .select(SELECT_COLS)
      .eq("is_active", true)
      .order("is_fixed", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[platform_announcements] student fetch failed:", error.message);
      return [];
    }

    const now = new Date();
    const visible = ((data ?? []) as PlatformAnnouncement[]).filter((row) =>
      isAnnouncementVisibleNow(row, now),
    );
    return sortAnnouncementsForStudent(visible).slice(0, limit);
  } catch (err) {
    console.error("[platform_announcements] student fetch error:", err);
    return [];
  }
}

export async function fetchAllPlatformAnnouncements(
  supabase: LooseClient,
): Promise<PlatformAnnouncement[]> {
  try {
    const { data, error } = await supabase
      .from("platform_announcements")
      .select(SELECT_COLS)
      .order("is_fixed", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[platform_announcements] admin list failed:", error.message);
      return [];
    }
    return (data ?? []) as PlatformAnnouncement[];
  } catch (err) {
    console.error("[platform_announcements] admin list error:", err);
    return [];
  }
}
