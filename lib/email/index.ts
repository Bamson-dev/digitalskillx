import "server-only";
import { getEmailSenderConfig } from "@/lib/platform-settings";
import { sendViaResend } from "@/lib/email/providers/resend";
import { sendViaZeptoMail, zeptoConfigured } from "@/lib/email/providers/zeptomail";
import { isSyntheticTestRecipient } from "@/lib/email/synthetic-recipient";
import type { SendEmailParams, SendEmailResult } from "@/lib/email/types";

export type { SendEmailParams, SendEmailResult } from "@/lib/email/types";

function hasSyntheticRecipient(to: string | string[]) {
  return (Array.isArray(to) ? to : [to]).some(isSyntheticTestRecipient);
}

/**
 * Send a transactional email.
 * Primary: Resend. Fallback: ZeptoMail (keeps password-reset / access mail alive).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (hasSyntheticRecipient(params.to)) {
    return { skipped: true, error: new Error("Skipped synthetic test recipient") };
  }
  const sender = await getEmailSenderConfig();
  const primary = await sendViaResend(params, sender);
  if (!("error" in primary) && !("skipped" in primary && primary.skipped)) {
    return primary;
  }
  if (!zeptoConfigured()) return primary;
  const fallback = await sendViaZeptoMail(params, sender);
  if (!("error" in fallback) && !("skipped" in fallback && fallback.skipped)) {
    return fallback;
  }
  return primary.error ? primary : fallback;
}
