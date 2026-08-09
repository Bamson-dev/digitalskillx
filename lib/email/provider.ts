import "server-only";
import { runtimeEnv } from "@/lib/runtime-env";

/** Resend is the only active email provider. */
export type EmailProviderId = "resend";

/**
 * Active provider is always Resend.
 * EMAIL_PROVIDER may still be set to "resend" in Coolify for clarity;
 * any other value is ignored (Resend-only production path).
 */
export function resolveEmailProvider(): EmailProviderId {
  const raw = (runtimeEnv("EMAIL_PROVIDER") ?? process.env.EMAIL_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  if (raw && raw !== "resend") {
    // Soft warning only — never fall back to ZeptoMail/SMTP.
    console.warn(
      `[email] EMAIL_PROVIDER="${raw}" is not supported; DigitalSkillX uses Resend only.`,
    );
  }
  return "resend";
}

export function resolveResendApiKey(): string | null {
  const key = (runtimeEnv("RESEND_API_KEY") ?? process.env.RESEND_API_KEY ?? "").trim();
  return key || null;
}

export function resolveResendFromEmail(): string {
  return (
    (runtimeEnv("RESEND_FROM_EMAIL") ?? process.env.RESEND_FROM_EMAIL ?? "").trim() ||
    "courses@digitalskillx.com"
  );
}

export function resolveResendFromName(): string {
  return (
    (runtimeEnv("RESEND_FROM_NAME") ?? process.env.RESEND_FROM_NAME ?? "").trim() ||
    "DigitalSkillX"
  );
}
