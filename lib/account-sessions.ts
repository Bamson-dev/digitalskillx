import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { notify } from "@/lib/notifications";

export type SessionClientMeta = {
  userAgent?: string | null;
  ipAddress?: string | null;
  country?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type AccountSessionRow = {
  id: string;
  user_id: string;
  session_token_hash: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  city: string | null;
  ip_address: string | null;
  user_agent: string | null;
  latitude: number | null;
  longitude: number | null;
  is_current: boolean;
  flagged_impossible_travel: boolean;
  last_active_at: string;
  created_at: string;
  revoked_at: string | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseUserAgent(ua: string | null | undefined) {
  const value = ua ?? "";
  const browser = value.includes("Edg/")
    ? "Edge"
    : value.includes("Chrome/")
      ? "Chrome"
      : value.includes("Firefox/")
        ? "Firefox"
        : value.includes("Safari/")
          ? "Safari"
          : "Other";
  const os = value.includes("Windows")
    ? "Windows"
    : value.includes("Mac OS")
      ? "macOS"
      : value.includes("Android")
        ? "Android"
        : value.includes("iPhone") || value.includes("iPad")
          ? "iOS"
          : value.includes("Linux")
            ? "Linux"
            : "Other";
  const device = /Mobile|Android|iPhone|iPad/i.test(value) ? "mobile" : "desktop";
  return { browser, os, device };
}

/** Approximate km between two lat/lng points (Haversine). */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Detect impossible travel: different country within 2 hours, or >500km within 2 hours.
 * Flags only — never locks the account.
 */
export function detectImpossibleTravel(params: {
  previous: { country: string | null; latitude: number | null; longitude: number | null; last_active_at: string };
  next: { country: string | null; latitude?: number | null; longitude?: number | null };
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  const prevAt = new Date(params.previous.last_active_at).getTime();
  const hours = (now.getTime() - prevAt) / (1000 * 60 * 60);
  if (hours > 2 || hours < 0) return false;

  const prevCountry = (params.previous.country ?? "").trim().toUpperCase();
  const nextCountry = (params.next.country ?? "").trim().toUpperCase();
  if (prevCountry && nextCountry && prevCountry !== nextCountry) return true;

  if (
    params.previous.latitude != null &&
    params.previous.longitude != null &&
    params.next.latitude != null &&
    params.next.longitude != null
  ) {
    const km = haversineKm(
      { lat: params.previous.latitude, lng: params.previous.longitude },
      { lat: params.next.latitude, lng: params.next.longitude },
    );
    if (km > 500) return true;
  }
  return false;
}

export async function trackAccountSession(
  admin: SupabaseClient<Database>,
  params: {
    userId: string;
    accessToken: string;
    meta: SessionClientMeta;
  },
) {
  const tokenHash = hashToken(params.accessToken);
  const parsed = parseUserAgent(params.meta.userAgent);

  const { data: existing } = await admin
    .from("account_sessions")
    .select("*")
    .eq("session_token_hash", tokenHash)
    .maybeSingle();

  const { data: recent } = await admin
    .from("account_sessions")
    .select("*")
    .eq("user_id", params.userId)
    .is("revoked_at", null)
    .neq("session_token_hash", tokenHash)
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const flagged =
    recent &&
    detectImpossibleTravel({
      previous: {
        country: recent.country,
        latitude: recent.latitude,
        longitude: recent.longitude,
        last_active_at: recent.last_active_at,
      },
      next: {
        country: params.meta.country ?? null,
        latitude: params.meta.latitude,
        longitude: params.meta.longitude,
      },
    });

  const isNewDevice = !existing;

  await admin
    .from("account_sessions")
    .update({ is_current: false })
    .eq("user_id", params.userId)
    .is("revoked_at", null);

  if (existing) {
    await admin
      .from("account_sessions")
      .update({
        browser: parsed.browser,
        os: parsed.os,
        device: parsed.device,
        country: params.meta.country ?? existing.country,
        city: params.meta.city ?? existing.city,
        ip_address: params.meta.ipAddress ?? existing.ip_address,
        user_agent: params.meta.userAgent ?? existing.user_agent,
        latitude: params.meta.latitude ?? existing.latitude,
        longitude: params.meta.longitude ?? existing.longitude,
        is_current: true,
        flagged_impossible_travel: existing.flagged_impossible_travel || Boolean(flagged),
        last_active_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await admin.from("account_sessions").insert({
      user_id: params.userId,
      session_token_hash: tokenHash,
      browser: parsed.browser,
      os: parsed.os,
      device: parsed.device,
      country: params.meta.country ?? null,
      city: params.meta.city ?? null,
      ip_address: params.meta.ipAddress ?? null,
      user_agent: params.meta.userAgent ?? null,
      latitude: params.meta.latitude ?? null,
      longitude: params.meta.longitude ?? null,
      is_current: true,
      flagged_impossible_travel: Boolean(flagged),
    });
  }

  if (isNewDevice) {
    try {
      await notify({
        studentId: params.userId,
        type: "announcement",
        title: "New device sign-in",
        message: `A new ${parsed.device} session (${parsed.browser} on ${parsed.os}${
          params.meta.country ? ` · ${params.meta.country}` : ""
        }) signed in to your account.`,
        linkUrl: "/settings#security",
      });
    } catch (err) {
      console.error("[account-sessions] new device notify", err);
    }
  }

  if (flagged) {
    try {
      await notify({
        studentId: params.userId,
        type: "announcement",
        title: "Unusual sign-in location",
        message:
          "We noticed a sign-in from a location that looks unusually far from your last session. If this wasn’t you, sign out other sessions in Account Security.",
        linkUrl: "/settings#security",
      });
    } catch (err) {
      console.error("[account-sessions] impossible travel notify", err);
    }
  }

  return { isNewDevice, flagged: Boolean(flagged) };
}

export async function listAccountSessions(
  admin: SupabaseClient<Database>,
  userId: string,
) {
  const { data, error } = await admin
    .from("account_sessions")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("last_active_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountSessionRow[];
}

export async function revokeAccountSession(
  admin: SupabaseClient<Database>,
  params: { userId: string; sessionId: string },
) {
  const { error } = await admin
    .from("account_sessions")
    .update({ revoked_at: new Date().toISOString(), is_current: false })
    .eq("id", params.sessionId)
    .eq("user_id", params.userId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}

export async function revokeAllAccountSessions(
  admin: SupabaseClient<Database>,
  params: { userId: string; keepTokenHash?: string | null },
) {
  let query = admin
    .from("account_sessions")
    .update({ revoked_at: new Date().toISOString(), is_current: false })
    .eq("user_id", params.userId)
    .is("revoked_at", null);
  if (params.keepTokenHash) {
    query = query.neq("session_token_hash", params.keepTokenHash);
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export function hashSessionAccessToken(accessToken: string) {
  return hashToken(accessToken);
}
