import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export { resolvePostRedeemPath } from "@/lib/enrollment-links/redeem-path";

export type EnrollmentLinkAnalytics = {
  visits: number;
  registrationStarted: number;
  registrationCompleted: number;
  loginStarted: number;
  loginCompleted: number;
  redemptionAttempts: number;
  redemptionSuccess: number;
  redemptionFailed: number;
  continueLearning: number;
  conversionRate: number;
  remainingSlots: number | null;
  countries: Array<{ country: string; count: number }>;
  devices: Array<{ device: string; count: number }>;
  browsers: Array<{ browser: string; count: number }>;
  recentEvents: Array<{
    id: string;
    event: string;
    created_at: string;
    user_id: string | null;
    metadata: unknown;
  }>;
};

export async function getEnrollmentLinkAnalytics(
  admin: SupabaseClient<Database>,
  linkId: string,
): Promise<EnrollmentLinkAnalytics> {
  const { data: link } = await admin
    .from("enrollment_links")
    .select("max_redemptions, current_redemptions")
    .eq("id", linkId)
    .maybeSingle();

  const { data: events } = await admin
    .from("enrollment_events")
    .select("id, event, created_at, user_id, metadata")
    .eq("enrollment_link_id", linkId)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = events ?? [];
  const count = (name: string) => rows.filter((e) => e.event === name).length;

  const visits = count("link_opened");
  const redemptionSuccess = count("redemption_success");
  const conversionRate = visits > 0 ? redemptionSuccess / visits : 0;

  const { data: redemptions } = await admin
    .from("enrollment_link_redemptions")
    .select("country, device, browser")
    .eq("enrollment_link_id", linkId);

  function tally(key: "country" | "device" | "browser") {
    const map = new Map<string, number>();
    for (const r of redemptions ?? []) {
      const raw = (r[key] ?? "").trim() || "Unknown";
      map.set(raw, (map.get(raw) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, n]) => ({ [key]: label, count: n }) as never)
      .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
      .slice(0, 10);
  }

  const remainingSlots =
    link?.max_redemptions == null
      ? null
      : Math.max(0, link.max_redemptions - (link.current_redemptions ?? 0));

  return {
    visits,
    registrationStarted: count("registration_started"),
    registrationCompleted: count("registration_completed"),
    loginStarted: count("login_started"),
    loginCompleted: count("login_completed"),
    redemptionAttempts: count("redemption_attempt"),
    redemptionSuccess,
    redemptionFailed: count("redemption_failed"),
    continueLearning: count("continue_learning"),
    conversionRate,
    remainingSlots,
    countries: tally("country") as Array<{ country: string; count: number }>,
    devices: tally("device") as Array<{ device: string; count: number }>,
    browsers: tally("browser") as Array<{ browser: string; count: number }>,
    recentEvents: rows.slice(0, 50).map((e) => ({
      id: e.id,
      event: e.event,
      created_at: e.created_at,
      user_id: e.user_id,
      metadata: e.metadata,
    })),
  };
}
