import "server-only";
import { runtimeEnv } from "@/lib/runtime-env";

/** DigitalSkillX uses Zoho CPaaS for transactional email. */
export type EmailProviderId = "zeptomail";

export function resolveEmailProvider(): EmailProviderId {
  const configured = (runtimeEnv("EMAIL_PROVIDER") ?? process.env.EMAIL_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  if (configured && configured !== "zeptomail") {
    console.warn(`[email] EMAIL_PROVIDER="${configured}" is ignored; Zoho CPaaS is the active transactional provider.`);
  }
  return "zeptomail";
}

/** Prefer the agent-specific Send API key. The SMTP password alias remains for existing Coolify setups. */
export function resolveZeptoMailApiKey(): string | null {
  const env = process.env as Record<string, string | undefined>;
  const key =
    runtimeEnv("ZEPTOMAIL_API_KEY") ??
    runtimeEnv("ZEPTOMAIL_TOKEN") ??
    runtimeEnv("ZEPTOMAIL_SMTP_PASSWORD") ??
    env.ZEPTOMAIL_API_KEY ??
    env.ZEPTOMAIL_TOKEN ??
    env.ZEPTOMAIL_SMTP_PASSWORD ??
    "";
  return key.trim() || null;
}

export function resolveZeptoMailApiUrl(): string {
  const env = process.env as Record<string, string | undefined>;
  const configured = (
    runtimeEnv("ZEPTOMAIL_API_URL") ??
    env.ZEPTOMAIL_API_URL ??
    "https://cpaas.zoho.com/v1.1/email"
  ).trim();
  return configured || "https://cpaas.zoho.com/v1.1/email";
}

export function resolveZeptoMailFromEmail(): string {
  const env = process.env as Record<string, string | undefined>;
  return (
    (runtimeEnv("ZEPTOMAIL_FROM_EMAIL") ?? env.ZEPTOMAIL_FROM_EMAIL ?? "").trim() ||
    "courses@digitalskillx.com"
  );
}

export function resolveZeptoMailFromName(): string {
  const env = process.env as Record<string, string | undefined>;
  return (
    (runtimeEnv("ZEPTOMAIL_FROM_NAME") ?? env.ZEPTOMAIL_FROM_NAME ?? "").trim() ||
    "DigitalSkillX"
  );
}

export function zeptoConfigured(): boolean {
  return Boolean(resolveZeptoMailApiKey());
}
