import "server-only";
import { getEmailSenderConfig } from "@/lib/platform-settings";
import { sendViaZeptoMail, zeptoConfigured } from "@/lib/email/providers/zeptomail";
import { isSyntheticTestRecipient } from "@/lib/email/synthetic-recipient";
import type { SendEmailParams, SendEmailResult } from "@/lib/email/types";

export type { SendEmailParams, SendEmailResult } from "@/lib/email/types";

function hasSyntheticRecipient(to: string | string[]) {
  return (Array.isArray(to) ? to : [to]).some(isSyntheticTestRecipient);
}

/** Send one transactional email through the configured Zoho CPaaS agent. */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (hasSyntheticRecipient(params.to)) {
    return { skipped: true, error: new Error("Skipped synthetic test recipient") };
  }
  if (!zeptoConfigured()) {
    return {
      skipped: true,
      error: new Error("Zoho CPaaS is not configured. Set the agent Send API key in Coolify."),
    };
  }

  const sender = await getEmailSenderConfig();
  return sendViaZeptoMail(params, sender);
}
