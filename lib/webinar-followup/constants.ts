/** Standalone webinar follow-up campaign engine — isolated from AIMC / LMS. */

export const WEBINAR_FOLLOWUP_DEFAULT_SLUG = "build-software-with-ai";
export const WEBINAR_FOLLOWUP_DEFAULT_NAME =
  "How To Build Software With AI And Get Paid For It";
export const WEBINAR_FOLLOWUP_OFFER_URL = "https://aimoneycode.com.ng/offer";
export const WEBINAR_FOLLOWUP_WEBINAR_URL = "https://aimoneycode.com.ng/reg";
export const WEBINAR_FOLLOWUP_ALLOWED_CTA_URLS = [
  WEBINAR_FOLLOWUP_OFFER_URL,
  WEBINAR_FOLLOWUP_WEBINAR_URL,
] as const;
export const WEBINAR_FOLLOWUP_OFFER_PRICE = "₦49,999";
export const WEBINAR_FOLLOWUP_REGULAR_PRICE = "₦100,000";
export const WEBINAR_FOLLOWUP_OFFER_VALUE = "₦805,000";
/** Exact evergreen sequence length for the first campaign. */
export const WEBINAR_FOLLOWUP_REQUIRED_STEPS = 40;
export const WEBINAR_FOLLOWUP_SEQUENCE_SOURCE_VERSION = "build-software-with-ai.v40.4";

/** Steps 1–10 default to webinar/replay CTA; 11–40 default to offer. */
export function defaultCtaUrlForStep(stepNumber: number): string {
  return stepNumber <= 10 ? WEBINAR_FOLLOWUP_WEBINAR_URL : WEBINAR_FOLLOWUP_OFFER_URL;
}

export const MAX_SEND_ATTEMPTS = 8;
export const STALE_SENDING_MINUTES = 2;
export const DEFAULT_STEP_DELAY_HOURS = 24;
export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 20_000;

export type CampaignStatus = "draft" | "active" | "paused" | "archived";
export type ContactStatus =
  | "active"
  | "waiting"
  | "completed"
  | "unsubscribed"
  | "failed"
  | "paused";
export type SendStatus = "pending" | "sending" | "sent" | "failed" | "skipped";
export type StepStatus = "active" | "draft" | "retired";
export type ImportStatus = "dry_run" | "confirmed" | "failed" | "cancelled";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function canProcessCampaign(
  status: CampaignStatus,
): { ok: true } | { ok: false; reason: "draft" | "paused" | "archived" } {
  if (status === "draft") return { ok: false, reason: "draft" };
  if (status === "paused") return { ok: false, reason: "paused" };
  if (status === "archived") return { ok: false, reason: "archived" };
  return { ok: true };
}

export function webinarIdempotencyKey(
  campaignId: string,
  contactId: string,
  stepNumber: number,
): string {
  return `wfu:${campaignId}:${contactId}:${stepNumber}`;
}

export function nextSendAtAfter(sentAt: Date, delayHours: number): Date {
  const hours = Math.max(0, delayHours);
  return new Date(sentAt.getTime() + hours * 60 * 60 * 1000);
}

export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "***";
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

const NOT_A_PERSONAL_NAME =
  /^(null|undefined|n\/a|na|-|platform|admin|administrator|user|test|staff|support|info|hello|team|official|noreply|no-reply|digitalskillx|pdigital|marketstore|ltd|limited|company)$/i;

/** First token only when it looks like a real given name — never org/role labels. */
export function webinarPersonalFirstName(firstName: string | null | undefined): string | null {
  const name = (firstName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!name || NOT_A_PERSONAL_NAME.test(name)) return null;
  if (!/^[\p{L}][\p{L}.'’-]*$/u.test(name)) return null;
  if (name.length > 40) return null;
  return name;
}

export function campaignTrackingUrl(baseUrl: string, campaignSlug: string, stepNumber: number): string {
  try {
    const url = new URL(baseUrl);
    if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "email");
    if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "email");
    if (!url.searchParams.has("utm_campaign")) {
      url.searchParams.set("utm_campaign", `wfu-${campaignSlug}`);
    }
    url.searchParams.set("utm_content", `step-${String(stepNumber).padStart(2, "0")}`);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

const TEST_GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Test sends: admin, same org domain, allowlist, or any Gmail address. */
export function isAuthorizedTestRecipient(to: string, adminEmail: string): boolean {
  const target = normalizeEmail(to);
  const admin = normalizeEmail(adminEmail);
  if (target === admin) return true;
  const allow = (process.env.WEBINAR_FOLLOWUP_TEST_EMAILS ?? "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
  if (allow.includes(target)) return true;
  const adminDomain = admin.split("@")[1];
  const targetDomain = target.split("@")[1];
  if (adminDomain && targetDomain && adminDomain === targetDomain) return true;
  if (targetDomain && TEST_GMAIL_DOMAINS.has(targetDomain)) return true;
  return false;
}
