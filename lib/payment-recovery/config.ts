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
  /** Hours after the first email for emails 2..7. Fixed schedule, see RECOVERY_SEQUENCE. */
  sequenceOffsetsMs: number[];
  /** Minimum gap between two emails, so overdue sends after downtime never burst. */
  minGapMs: number;
  /** Quiet hours: emails only go out inside this Africa/Lagos window. */
  sendWindow: { startMinutes: number; endMinutes: number };
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

/**
 * Seven emails for one incomplete order, over five days. Hours count from the
 * first recovery email. Step names are stored in payment_recovery_messages.
 */
export const RECOVERY_SEQUENCE = [
  { step: "initial", afterInitialHours: 0 },
  { step: "followup_3h", afterInitialHours: 3 },
  { step: "help_12h", afterInitialHours: 12 },
  { step: "reminder_24h", afterInitialHours: 24 },
  { step: "reminder_48h", afterInitialHours: 48 },
  { step: "reminder_72h", afterInitialHours: 72 },
  { step: "final_120h", afterInitialHours: 120 },
] as const;

export type RecoverySequenceStep = (typeof RECOVERY_SEQUENCE)[number]["step"];

const LAGOS_OFFSET_MS = HOUR; // Africa/Lagos is UTC+1 all year, no DST.

/**
 * Move a send time into the allowed window (Africa/Lagos). Inside the window:
 * unchanged. Before it: same day at window start. After it: next day at window start.
 */
export function clampToSendWindow(
  ms: number,
  window: { startMinutes: number; endMinutes: number } = { startMinutes: 8 * 60 + 30, endMinutes: 20 * 60 },
) {
  const local = ms + LAGOS_OFFSET_MS;
  const dayStart = Math.floor(local / (24 * HOUR)) * 24 * HOUR;
  const minutes = (local - dayStart) / MIN;
  if (minutes >= window.startMinutes && minutes < window.endMinutes) return ms;
  const startToday = dayStart + window.startMinutes * MIN - LAGOS_OFFSET_MS;
  if (minutes < window.startMinutes) return startToday;
  return startToday + 24 * HOUR;
}

export function readRecoveryConfig(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): RecoveryConfig {
  return {
    enabled: flag(env, "PAYMENT_RECOVERY_ENABLED", false),
    failedDelayMs: num(env, "PAYMENT_RECOVERY_FIRST_FAILED_DELAY_MINUTES", 10) * MIN,
    abandonedDelayMs: num(env, "PAYMENT_RECOVERY_ABANDONED_DELAY_MINUTES", 30) * MIN,
    sequenceOffsetsMs: RECOVERY_SEQUENCE.map((s) => s.afterInitialHours * HOUR),
    minGapMs: num(env, "PAYMENT_RECOVERY_MIN_GAP_MINUTES", 120) * MIN,
    sendWindow: {
      startMinutes: num(env, "PAYMENT_RECOVERY_WINDOW_START_MINUTES", 8 * 60 + 30),
      endMinutes: num(env, "PAYMENT_RECOVERY_WINDOW_END_MINUTES", 20 * 60),
    },
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
