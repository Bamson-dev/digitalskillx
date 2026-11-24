/**
 * Payment recovery configuration. Pure: no server imports, so tests can load it.
 * Business details are fixed. Timings and the master switch come from env.
 */

export const RECOVERY_BUSINESS = {
  name: "DigitalSkillX",
  bankName: "Wema Bank",
  accountName: "Autoquicky Limited",
  accountNumber: "0125912341",
  whatsappLocal: "09023986992",
  whatsappIntl: "2349023986992",
  timezone: "Africa/Lagos",
  currency: "NGN",
} as const;

export type RecoveryConfig = {
  enabled: boolean;
  failedDelayMs: number;
  abandonedDelayMs: number;
  reminder24hEnabled: boolean;
  reminder48hEnabled: boolean;
  reminder24hAfterMs: number;
  reminder48hAfterMs: number;
  /** Open groups close as expired this long after the final email. */
  expireAfterFinalMs: number;
  /** Re-verify cadence for unresolved attempts. */
  verifyIntervalMs: number;
  /** Stop verifying attempts older than this. */
  verifyMaxAgeMs: number;
  batchLimit: number;
};

function num(env: Record<string, string | undefined>, key: string, fallback: number) {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function flag(env: Record<string, string | undefined>, key: string, fallback: boolean) {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export function readRecoveryConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): RecoveryConfig {
  return {
    enabled: flag(env, "PAYMENT_RECOVERY_ENABLED", false),
    failedDelayMs: num(env, "PAYMENT_RECOVERY_FIRST_FAILED_DELAY_MINUTES", 10) * MIN,
    abandonedDelayMs: num(env, "PAYMENT_RECOVERY_ABANDONED_DELAY_MINUTES", 30) * MIN,
    reminder24hEnabled: flag(env, "PAYMENT_RECOVERY_REMINDER_24H_ENABLED", true),
    reminder48hEnabled: flag(env, "PAYMENT_RECOVERY_REMINDER_48H_ENABLED", true),
    reminder24hAfterMs: num(env, "PAYMENT_RECOVERY_REMINDER_1_HOURS", 24) * HOUR,
    reminder48hAfterMs: num(env, "PAYMENT_RECOVERY_REMINDER_2_HOURS", 48) * HOUR,
    expireAfterFinalMs: 7 * 24 * HOUR,
    verifyIntervalMs: num(env, "PAYMENT_RECOVERY_VERIFY_INTERVAL_MINUTES", 5) * MIN,
    verifyMaxAgeMs: 7 * 24 * HOUR,
    batchLimit: Math.min(Math.max(num(env, "PAYMENT_RECOVERY_BATCH_LIMIT", 40), 1), 200),
  };
}

export function formatNaira(amountKobo: number) {
  const naira = amountKobo / 100;
  return `₦${naira.toLocaleString("en-NG", {
    minimumFractionDigits: Number.isInteger(naira) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function whatsappLink(params: { productTitle: string; amountKobo: number; bankReference?: string | null }) {
  const ref = params.bankReference ? ` My payment reference is ${params.bankReference}.` : "";
  const text =
    `Hello DigitalSkillX, I tried purchasing ${params.productTitle} for ${formatNaira(params.amountKobo)}, ` +
    `but my payment did not go through.${ref} Please help me complete my purchase.`;
  return `https://wa.me/${RECOVERY_BUSINESS.whatsappIntl}?text=${encodeURIComponent(text)}`;
}
