import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPaystackSecretKey } from "@/lib/env-paystack";
import { secureLog } from "@/lib/secure-log";
import type { Db, RecoveryDeps } from "./engine";
import { registerPulledRows, type PulledRow } from "./page-pull-core";

/**
 * Paystack Payment Page (paystack.shop) buyers never touch DigitalSkillX before paying, so
 * their failed and abandoned attempts are invisible to the app. Every cycle we list recent
 * failed and abandoned Paystack transactions and register the ones that clearly belong to a
 * catalog product. They then follow the normal verify -> failed/abandoned -> seven-email
 * sequence. Idempotent by reference. Only the last WINDOW_HOURS are read, so old history is
 * never mass-registered.
 */
const WINDOW_HOURS = 6;

export async function pullPaymentPageAttempts(db: Db, deps: RecoveryDeps, admin: SupabaseClient<Database>) {
  const total = { listed: 0, registered: 0, skipped: 0, error: null as string | null };
  try {
    const secret = await getPaystackSecretKey(admin);
    const from = new Date(deps.now() - WINDOW_HOURS * 3_600_000).toISOString();
    for (const status of ["failed", "abandoned"] as const) {
      const res = await fetch(
        `https://api.paystack.co/transaction?status=${status}&perPage=100&from=${encodeURIComponent(from)}`,
        { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" },
      );
      const json = (await res.json()) as { status?: boolean; data?: PulledRow[] };
      if (!json.status || !Array.isArray(json.data)) throw new Error(`paystack_list_${status}_${res.status}`);
      const s = await registerPulledRows(db, deps, json.data);
      total.listed += s.listed;
      total.registered += s.registered;
      total.skipped += s.skipped;
    }
  } catch (err) {
    total.error = err instanceof Error ? err.message.slice(0, 120) : "error";
    secureLog("warn", "payment-recovery", "page_pull_failed", { error: total.error });
  }
  return total;
}
