import "server-only";
import { createHash } from "node:crypto";
import type { SendEmailParams, SendEmailResult } from "@/lib/email/types";
import type { EmailSenderConfig } from "@/lib/platform-settings";
import {
  resolveZeptoMailApiKey,
  resolveZeptoMailApiUrl,
  resolveZeptoMailFromEmail,
  resolveZeptoMailFromName,
} from "@/lib/email/provider";
import { secureLogError } from "@/lib/secure-log";
import { ErrorCode } from "@/lib/error-codes";

type ZeptoResponse = {
  messageId?: string;
  mailId?: string;
  request_id?: string;
  data?: { messageId?: string; mailId?: string; request_id?: string };
  code?: string;
  message?: string;
  error?: { code?: string; message?: string; details?: Array<{ code?: string; message?: string }> };
  details?: Array<{ code?: string; message?: string }>;
};

function toRecipientList(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to])
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function normalizeIdempotencyKey(key: string): string {
  if (key.length <= 100) return key;
  return `dsx-${createHash("sha256").update(key).digest("hex")}`;
}

function isDuplicateIdempotencyResponse(data: ZeptoResponse): boolean {
  const serialized = JSON.stringify(data);
  return serialized.includes("TM_7001") || serialized.includes("SM_158");
}

/** Send a transactional email through the Zoho CPaaS Send Email API. */
export async function sendViaZeptoMail(
  params: SendEmailParams,
  sender: EmailSenderConfig,
): Promise<SendEmailResult> {
  const token = resolveZeptoMailApiKey();
  if (!token) {
    return { skipped: true, error: new Error("Zoho CPaaS Send API key is missing.") };
  }

  const recipients = toRecipientList(params.to);
  if (recipients.length === 0) {
    return { error: new Error("Email recipient is required") };
  }

  const fromAddress = resolveZeptoMailFromEmail() || sender.fromAddress;
  const fromName = resolveZeptoMailFromName() || sender.fromName || "DigitalSkillX";
  const authorization = token.startsWith("Zoho-enczapikey")
    ? token
    : `Zoho-enczapikey ${token}`;

  const payload: Record<string, unknown> = {
    from: { address: fromAddress, name: fromName },
    to: recipients.map((address) => ({
      email_address: { address, name: address.split("@")[0] || address },
    })),
    subject: params.subject,
    htmlbody: params.html,
  };

  const replyTo = params.replyTo ?? sender.replyTo;
  if (replyTo) {
    payload.reply_to = [{ address: replyTo, name: fromName }];
  }
  if (params.headers && Object.keys(params.headers).length > 0) {
    payload.mime_headers = params.headers;
  }
  if (params.idempotencyKey) {
    payload.idempotency_key = normalizeIdempotencyKey(params.idempotencyKey);
  }
  if (params.attachments?.length) {
    payload.attachments = params.attachments.map((attachment) => ({
      name: attachment.filename,
      mime_type: attachment.contentType ?? "application/pdf",
      content: attachment.content.toString("base64"),
    }));
  }

  try {
    const response = await fetch(resolveZeptoMailApiUrl(), {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });

    const responseText = await response.text();
    let responseData: ZeptoResponse = {};
    try {
      responseData = JSON.parse(responseText) as ZeptoResponse;
    } catch {
      // The error path below reports the HTTP status without exposing the response body.
    }

    if (!response.ok) {
      if (params.idempotencyKey && isDuplicateIdempotencyResponse(responseData)) {
        const stableId = createHash("sha256").update(params.idempotencyKey).digest("hex").slice(0, 24);
        return { messageId: `zeptomail-duplicate-${stableId}` };
      }

      const code =
        responseData.error?.code ??
        responseData.code ??
        responseData.error?.details?.[0]?.code ??
        responseData.details?.[0]?.code ??
        "unknown";
      const detail =
        responseData.error?.message ??
        responseData.message ??
        responseData.error?.details?.[0]?.message ??
        responseData.details?.[0]?.message ??
        "Zoho CPaaS rejected the send request.";

      secureLogError("email", ErrorCode.EMAIL_DELIVERY_FAILED, "Zoho CPaaS rejected send", {
        provider: "zeptomail",
        status: response.status,
        code,
        message: detail.slice(0, 200),
        subject: params.subject.slice(0, 120),
      });
      return { error: new Error(`Zoho CPaaS send failed (${response.status}, ${code}): ${detail}`) };
    }

    const messageId =
      responseData.data?.messageId ??
      responseData.messageId ??
      responseData.data?.mailId ??
      responseData.mailId ??
      responseData.data?.request_id ??
      responseData.request_id;

    if (!messageId) {
      secureLogError("email", ErrorCode.EMAIL_DELIVERY_FAILED, "Zoho CPaaS returned no message identifier", {
        provider: "zeptomail",
        subject: params.subject.slice(0, 120),
      });
      return { error: new Error("Zoho CPaaS accepted the request but returned no message identifier.") };
    }

    return { messageId };
  } catch (error) {
    secureLogError("email", ErrorCode.EMAIL_DELIVERY_FAILED, "Zoho CPaaS send failed", {
      provider: "zeptomail",
      error: error instanceof Error ? error.message : String(error),
      subject: params.subject.slice(0, 120),
    });
    return { error };
  }
}
