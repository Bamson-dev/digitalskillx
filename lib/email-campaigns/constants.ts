export const AIMONEYCODE_CAMPAIGN_SLUG = "aimoneycode-30-day";
export const AIMONEYCODE_CAMPAIGN_NAME = "AI Money Code 30-Day Email Sequence";
export const AIMONEYCODE_TOTAL_STEPS = 30;

export const WEBINAR_CTA_URL = "https://aimoneycode.com.ng/reg";
export const OFFER_CTA_URL = "https://aimoneycode.com.ng/offer";

export const STEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MAX_SEND_ATTEMPTS = 8;
export const STALE_SENDING_MINUTES = 2;

export type CampaignStatus = "draft" | "active" | "paused";
export type RecipientStatus = "active" | "completed" | "unsubscribed" | "failed";
export type SendStatus = "pending" | "sending" | "sent" | "failed" | "skipped";
export type EnrollmentSource = "buyers" | "students" | "csv";

export function ctaUrlForStep(stepNumber: number): string {
  if (stepNumber < 1 || stepNumber > AIMONEYCODE_TOTAL_STEPS) {
    throw new Error(`Invalid campaign step ${stepNumber}`);
  }
  return stepNumber <= 10 ? WEBINAR_CTA_URL : OFFER_CTA_URL;
}

export function ctaLabelForStep(stepNumber: number): string {
  return stepNumber <= 10 ? "Register for the free training" : "Get the program — ₦49,999";
}

export function campaignTrackingUrl(baseUrl: string, stepNumber: number): string {
  const url = new URL(baseUrl);
  if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "email");
  if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "email");
  if (!url.searchParams.has("utm_campaign")) {
    url.searchParams.set("utm_campaign", AIMONEYCODE_CAMPAIGN_SLUG);
  }
  url.searchParams.set("utm_content", `day-${String(stepNumber).padStart(2, "0")}`);
  return url.toString();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function nextSendAtAfter(sentAt: Date, stepNumber: number): Date | null {
  if (stepNumber >= AIMONEYCODE_TOTAL_STEPS) return null;
  return new Date(sentAt.getTime() + STEP_INTERVAL_MS);
}

export function canProcessCampaign(status: CampaignStatus): { ok: true } | { ok: false; reason: "draft" | "paused" } {
  if (status === "draft") return { ok: false, reason: "draft" };
  if (status === "paused") return { ok: false, reason: "paused" };
  return { ok: true };
}

export function campaignIdempotencyKey(campaignId: string, recipientId: string, stepNumber: number): string {
  return `aimc:${campaignId}:${recipientId}:${stepNumber}`;
}
