import "server-only";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const smtpHost = process.env.ZEPTOMAIL_SMTP_HOST;
const smtpPort = Number(process.env.ZEPTOMAIL_SMTP_PORT ?? 587);
const smtpUser = process.env.ZEPTOMAIL_SMTP_USER;
const smtpPassword = process.env.ZEPTOMAIL_SMTP_PASSWORD;
const fromName = process.env.ZEPTOMAIL_FROM_NAME ?? "DigitalSkillX";
const fromAddress = process.env.ZEPTOMAIL_FROM_EMAIL ?? "courses@digitalskillx.com";

function isEmailConfigured() {
  return Boolean(smtpHost && smtpUser && smtpPassword && fromAddress);
}

function createTransporter() {
  const options: SMTPTransport.Options = {
    host: smtpHost,
    port: smtpPort,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
    requireTLS: smtpPort === 587,
  };
  return nodemailer.createTransport(options);
}

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
};

/**
 * Send a transactional email via ZeptoMail SMTP (Nodemailer). No-ops with a warning
 * when SMTP env vars are not configured, so local/dev flows don't crash.
 */
export async function sendEmail(params: SendEmailParams) {
  if (!isEmailConfigured()) {
    console.warn("[email] ZeptoMail SMTP not configured — skipping:", params.subject);
    return { skipped: true as const };
  }

  const transporter = createTransporter();

  try {
    const info = await transporter.sendMail({
      from: `${fromName} <${fromAddress}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });
    return { messageId: info.messageId };
  } catch (error) {
    console.error("[email] send failed:", error);
    return { error };
  }
}
