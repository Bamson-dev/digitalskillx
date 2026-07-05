import "server-only";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { resolveSmtpConfig } from "@/lib/env-email";
import { getEmailSenderConfig } from "@/lib/platform-settings";

function createTransporter(config: NonNullable<Awaited<ReturnType<typeof resolveSmtpConfig>>>) {
  const options: SMTPTransport.Options = {
    host: config.host,
    port: config.port,
    secure: false,
    auth: {
      user: config.user,
      pass: config.password,
    },
    requireTLS: config.port === 587,
  };
  return nodemailer.createTransport(options);
}

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

/**
 * Send a transactional email via ZeptoMail SMTP (Nodemailer).
 * SMTP credentials resolve from platform_secrets, runtime env, or Coolify.
 */
export async function sendEmail(params: SendEmailParams) {
  const smtp = await resolveSmtpConfig();
  const sender = await getEmailSenderConfig();

  if (!smtp) {
    console.warn("[email] ZeptoMail SMTP not configured — skipping:", params.subject);
    return {
      skipped: true as const,
      error: new Error(
        "ZeptoMail SMTP is not configured. Save the SMTP password under Admin → Settings → Integrations, or set ZEPTOMAIL_SMTP_PASSWORD in Coolify (Runtime only) and redeploy.",
      ),
    };
  }

  const fromAddress = sender.fromAddress || smtp.fromAddress;
  const transporter = createTransporter(smtp);

  try {
    const info = await transporter.sendMail({
      from: `${sender.fromName} <${fromAddress}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo ?? sender.replyTo,
      attachments: params.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType ?? "application/pdf",
      })),
    });
    return { messageId: info.messageId };
  } catch (error) {
    console.error("[email] send failed:", error);
    return { error };
  }
}
