import "server-only";
import { getEmailSenderConfig } from "@/lib/platform-settings";
import { sendViaZeptoMail } from "@/lib/email/providers/zeptomail";
import { isSyntheticTestRecipient } from "@/lib/email/synthetic-recipient";
import type { SendEmailParams, SendEmailResult } from "@/lib/email/types";

export type { SendEmailParams, SendEmailResult } from "@/lib/email/types";

function hasSyntheticRecipient(to: string | string[]) {
  return (Array.isArray(to) ? to : [to]).some(isSyntheticTestRecipient);
}

/**
 * Send a transactional application email through Zoho ZeptoMail.
 * There is intentionally no Resend fallback. A provider error must remain visible
 * to the caller so the existing outbox can retry without silently switching vendors.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (hasSyntheticRecipient(params.to)) {
    return { skipped: true, error: new Error("Skipped synthetic test recipient") };
  }
  const sender = await getEmailSenderConfig();
  return sendViaZeptoMail(params, sender);
}

/**
 * Promotional sequences and bulk marketing require a dedicated marketing provider.
 * ZeptoMail is reserved for transactional messages, so do not send campaign content
 * through this transport.
 */
export async function sendMarketingEmail(_params: SendEmailParams): Promise<SendEmailResult> {
  return {
    skipped: true,
    error: new Error(
      "Marketing email is not enabled. ZeptoMail supports transactional email only; connect Zoho Campaigns for promotional sequences and bulk campaigns.",
    ),
  };
}
