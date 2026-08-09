import "server-only";
import { resolveResendApiKey } from "@/lib/email/provider";

/**
 * True when Resend can send (RESEND_API_KEY present in Coolify/runtime).
 * ZeptoMail SMTP is not used for delivery.
 */
export async function emailDeliveryConfigured() {
  return Boolean(resolveResendApiKey());
}

/** @deprecated Use emailDeliveryConfigured — Resend-only. */
export async function emailSmtpConfigured() {
  return emailDeliveryConfigured();
}
