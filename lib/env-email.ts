import "server-only";
import { resolveZeptoMailSmtpPassword } from "@/lib/email/provider";

/** True when Zoho ZeptoMail SMTP credentials are available in the server runtime. */
export async function emailDeliveryConfigured() {
  return Boolean(resolveZeptoMailSmtpPassword());
}

/** @deprecated Use emailDeliveryConfigured. */
export async function emailSmtpConfigured() {
  return emailDeliveryConfigured();
}
