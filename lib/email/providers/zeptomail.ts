import "server-only";
import type { SendEmailParams, SendEmailResult } from "@/lib/email/types";
import type { EmailSenderConfig } from "@/lib/platform-settings";
import { secureLogError } from "@/lib/secure-log";
import { ErrorCode } from "@/lib/error-codes";

function toRecipientList(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to])
    .map((v) => String(v).trim())
    .filter(Boolean);
}

function zeptoToken(): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  return (
    env.ZEPTOMAIL_TOKEN?.trim() ||
    env.ZEPTOMAIL_SMTP_PASSWORD?.trim() ||
    env.ZEPTOMAIL_API_KEY?.trim() ||
    undefined
  );
}

export function zeptoConfigured(): boolean {
  return Boolean(zeptoToken());
}

/**
 * Fallback transactional email via ZeptoMail HTTP API.
 * Used when Resend is unreachable so password-reset / access mail still delivers.
 */
export async function sendViaZeptoMail(
  params: SendEmailParams,
  sender: EmailSenderConfig,
): Promise<SendEmailResult> {
  const token = zeptoToken();
  if (!token) {
    return {
      skipped: true as const,
      error: new Error("ZeptoMail is not configured."),
    };
  }

  const env = process.env as Record<string, string | undefined>;
  const fromAddress =
    env.ZEPTOMAIL_FROM_EMAIL?.trim() ||
    sender.fromAddress ||
    "Hello@digitalskillx.com";
  const fromName =
    env.ZEPTOMAIL_FROM_NAME?.trim() || sender.fromName || "DigitalSkillX";
  const recipients = toRecipientList(params.to);
  if (recipients.length === 0) {
    return { error: new Error("Email recipient is required") };
  }

  const payload = {
    from: { address: fromAddress, name: fromName },
    to: recipients.map((address) => ({
      email_address: { address, name: address.split("@")[0] || address },
    })),
    subject: params.subject,
    htmlbody: params.html,
    reply_to: params.replyTo
      ? [{ address: params.replyTo, name: fromName }]
      : sender.replyTo
        ? [{ address: sender.replyTo, name: fromName }]
        : undefined,
  };

  try {
    const res = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        Authorization: token.startsWith("Zoho-")
          ? token
          : `Zoho-enczapikey ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      secureLogError("email", ErrorCode.EMAIL_DELIVERY_FAILED, "ZeptoMail API rejected send", {
        provider: "zeptomail",
        status: res.status,
        body: text.slice(0, 200),
        subject: params.subject.slice(0, 120),
      });
      return { error: new Error(`ZeptoMail failed (${res.status})`) };
    }
    let messageId = `zepto-${Date.now()}`;
    try {
      const parsed = JSON.parse(text) as { request_id?: string };
      if (parsed.request_id) messageId = parsed.request_id;
    } catch {
      // ignore
    }
    return { messageId };
  } catch (error) {
    secureLogError("email", ErrorCode.EMAIL_DELIVERY_FAILED, "ZeptoMail send failed", {
      provider: "zeptomail",
      error: error instanceof Error ? error.message : String(error),
      subject: params.subject.slice(0, 120),
    });
    return { error };
  }
}
