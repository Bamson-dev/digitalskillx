import "server-only";
import { Resend } from "resend";
import {
  resolveResendApiKey,
  resolveResendFromEmail,
  resolveResendFromName,
} from "@/lib/email/provider";
import type { SendEmailParams, SendEmailResult } from "@/lib/email/types";
import type { EmailSenderConfig } from "@/lib/platform-settings";
import { secureLogError } from "@/lib/secure-log";
import { ErrorCode } from "@/lib/error-codes";

function toRecipientList(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to])
    .map((v) => String(v).trim())
    .filter(Boolean);
}

/**
 * Send via Resend HTTP API (official SDK). Never uses SMTP.
 * Does not log API keys or Authorization headers.
 */
export async function sendViaResend(
  params: SendEmailParams,
  sender: EmailSenderConfig,
): Promise<SendEmailResult> {
  const apiKey = resolveResendApiKey();
  if (!apiKey) {
    return {
      skipped: true as const,
      error: new Error(
        "Resend is not configured. Set RESEND_API_KEY, RESEND_FROM_EMAIL, and RESEND_FROM_NAME in Coolify, then redeploy.",
      ),
    };
  }

  const fromAddress = resolveResendFromEmail() || sender.fromAddress || "courses@digitalskillx.com";
  const fromName = resolveResendFromName() || sender.fromName || "DigitalSkillX";

  const recipients = toRecipientList(params.to);
  if (recipients.length === 0) {
    return { error: new Error("Email recipient is required") };
  }

  const headers = {
    ...(params.headers ?? {}),
    ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
  };

  const resend = new Resend(apiKey);
  try {
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: recipients,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo ?? sender.replyTo,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(params.tags?.length ? { tags: params.tags } : {}),
      attachments: params.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType ?? "application/pdf",
      })),
    });

    if (error) {
      secureLogError("email", ErrorCode.EMAIL_DELIVERY_FAILED, "Resend API rejected send", {
        provider: "resend",
        name: error.name,
        message: error.message,
        subject: params.subject.slice(0, 120),
      });
      return { error };
    }

    const messageId = data?.id;
    if (!messageId) {
      return { error: new Error("Resend returned no message id") };
    }
    return { messageId };
  } catch (error) {
    secureLogError("email", ErrorCode.EMAIL_DELIVERY_FAILED, "Resend send failed", {
      provider: "resend",
      error: error instanceof Error ? error.message : String(error),
      subject: params.subject.slice(0, 120),
    });
    return { error };
  }
}

export function resendConfigured(): boolean {
  return Boolean(resolveResendApiKey());
}
