import "server-only";
import { getEmailSenderConfig } from "@/lib/platform-settings";
import { sendViaResend } from "@/lib/email/providers/resend";
import { isSyntheticTestRecipient } from "@/lib/email/synthetic-recipient";
import type { SendEmailParams, SendEmailResult } from "@/lib/email/types";

export type { SendEmailParams, SendEmailResult } from "@/lib/email/types";

function hasSyntheticRecipient(to: string | string[]) {
  return (Array.isArray(to) ? to : [to]).some(isSyntheticTestRecipient);
}

/**
 * Send a transactional email via Resend (official API SDK).
 *
 * All DigitalSkillX triggers must call this function.
 * Resend is the only active delivery provider — no SMTP / ZeptoMail path.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (hasSyntheticRecipient(params.to)) {
    return { skipped: true, error: new Error("Skipped synthetic test recipient") };
  }
  const sender = await getEmailSenderConfig();
  return sendViaResend(params, sender);
}
