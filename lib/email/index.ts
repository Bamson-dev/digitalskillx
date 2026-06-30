import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromName = process.env.EMAIL_FROM_NAME ?? "DigitalSkillX";
const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "courses@digitalskillx.com";

const resend = apiKey ? new Resend(apiKey) : null;

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
};

/**
 * Send a transactional email via Resend (PRD §13). No-ops with a warning when
 * RESEND_API_KEY is not configured, so local/dev flows don't crash.
 */
export async function sendEmail(params: SendEmailParams) {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping:", params.subject);
    return { skipped: true as const };
  }
  const { data, error } = await resend.emails.send({
    from: `${fromName} <${fromAddress}>`,
    to: params.to,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
  });
  if (error) {
    console.error("[email] send failed:", error);
    return { error };
  }
  return { id: data?.id };
}
