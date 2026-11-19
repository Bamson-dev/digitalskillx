import "server-only";
import { runtimeEnv } from "@/lib/runtime-env";

export type EmailProviderId = "zeptomail";

/** Transactional email is routed to ZeptoMail regardless of legacy Resend variables. */
export function resolveEmailProvider(): EmailProviderId {
  const raw = (runtimeEnv("EMAIL_PROVIDER") ?? process.env.EMAIL_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  if (raw && raw !== "zeptomail" && raw !== "zoho") {
    console.warn(
      '[email] Ignoring legacy EMAIL_PROVIDER="' + raw + '". DigitalSkillX transactional email uses ZeptoMail.',
    );
  }
  return "zeptomail";
}

export function resolveZeptoMailSmtpHost(): string {
  return (runtimeEnv("ZEPTOMAIL_SMTP_HOST") ?? process.env.ZEPTOMAIL_SMTP_HOST ?? "").trim() || "smtp.zeptomail.com";
}

export function resolveZeptoMailSmtpPort(): number {
  const raw = (runtimeEnv("ZEPTOMAIL_SMTP_PORT") ?? process.env.ZEPTOMAIL_SMTP_PORT ?? "").trim();
  const parsed = raw ? Number(raw) : 587;
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 587;
}

export function resolveZeptoMailSmtpUser(): string {
  return (runtimeEnv("ZEPTOMAIL_SMTP_USER") ?? process.env.ZEPTOMAIL_SMTP_USER ?? "").trim() || "emailapikey";
}

export function resolveZeptoMailSmtpPassword(): string | null {
  const value = (runtimeEnv("ZEPTOMAIL_SMTP_PASSWORD") ?? process.env.ZEPTOMAIL_SMTP_PASSWORD ?? "").trim();
  return value || null;
}

export function resolveZeptoMailFromEmail(): string {
  return (
    (runtimeEnv("ZEPTOMAIL_FROM_EMAIL") ?? process.env.ZEPTOMAIL_FROM_EMAIL ?? "").trim() ||
    "courses@digitalskillx.com"
  );
}

export function resolveZeptoMailFromName(): string {
  return (
    (runtimeEnv("ZEPTOMAIL_FROM_NAME") ?? process.env.ZEPTOMAIL_FROM_NAME ?? "").trim() ||
    "DigitalSkillX"
  );
}

/** Marketing sequences remain disabled until a marketing-specific provider is connected. */
export function marketingEmailConfigured(): boolean {
  return false;
}

/**
 * Legacy Resend helpers retained only so old, unused provider modules still compile.
 * Transactional sendEmail() never reads these values.
 * @deprecated Use the ZeptoMail SMTP resolvers above.
 */
export function resolveResendApiKey(): string | null {
  const value = (runtimeEnv("RESEND_API_KEY") ?? process.env.RESEND_API_KEY ?? "").trim();
  return value || null;
}

export function resolveResendFromEmail(): string {
  return (runtimeEnv("RESEND_FROM_EMAIL") ?? process.env.RESEND_FROM_EMAIL ?? "").trim() ||
    "courses@digitalskillx.com";
}

export function resolveResendFromName(): string {
  return (runtimeEnv("RESEND_FROM_NAME") ?? process.env.RESEND_FROM_NAME ?? "").trim() ||
    "DigitalSkillX";
}
