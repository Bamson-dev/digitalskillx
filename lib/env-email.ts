import "server-only";
import { zeptoConfigured } from "@/lib/email/providers/zeptomail";

/** True when the Zoho CPaaS agent Send API key is available in the server runtime. */
export async function emailDeliveryConfigured() {
  return zeptoConfigured();
}

/** @deprecated Retained for older callers; checks Zoho transactional email configuration. */
export async function emailSmtpConfigured() {
  return emailDeliveryConfigured();
}
