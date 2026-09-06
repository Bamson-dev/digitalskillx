export type PlatformAnnouncementType =
  | "information"
  | "important"
  | "success"
  | "warning";

export type PlatformAnnouncement = {
  id: string;
  title: string;
  message: string;
  type: PlatformAnnouncementType;
  is_active: boolean;
  is_fixed: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformAnnouncementInput = {
  title: string;
  message: string;
  type: PlatformAnnouncementType;
  is_active: boolean;
  is_fixed: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

const TYPES = new Set<PlatformAnnouncementType>([
  "information",
  "important",
  "success",
  "warning",
]);

export function parseAnnouncementType(raw: unknown): PlatformAnnouncementType {
  const v = String(raw ?? "").trim().toLowerCase();
  if (TYPES.has(v as PlatformAnnouncementType)) return v as PlatformAnnouncementType;
  return "information";
}

export function isAnnouncementVisibleNow(
  row: Pick<PlatformAnnouncement, "is_active" | "starts_at" | "ends_at">,
  now = new Date(),
): boolean {
  if (!row.is_active) return false;
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.ends_at && new Date(row.ends_at) < now) return false;
  return true;
}

/** Sort: fixed first, then newest. */
export function sortAnnouncementsForStudent<T extends { is_fixed: boolean; created_at: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.is_fixed !== b.is_fixed) return a.is_fixed ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function announcementVisibilityLabel(
  row: Pick<PlatformAnnouncement, "is_active" | "starts_at" | "ends_at" | "is_fixed">,
  now = new Date(),
): "live" | "scheduled" | "expired" | "inactive" {
  if (!row.is_active) return "inactive";
  if (row.starts_at && new Date(row.starts_at) > now) return "scheduled";
  if (row.ends_at && new Date(row.ends_at) < now) return "expired";
  return "live";
}
