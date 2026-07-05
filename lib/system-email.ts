import "server-only";
import type { Json } from "@/types/database";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export type SystemEmailType =
  | "welcome"
  | "payment_receipt"
  | "course_completion_certificate"
  | "idle_reminder";

export type SendSystemEmailParams = {
  type: SystemEmailType;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  payload?: Record<string, Json>;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

/** Send a system email; log failures for retry without throwing. */
export async function sendSystemEmail(params: SendSystemEmailParams) {
  const result = await sendEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
    attachments: params.attachments,
  });

  if ("skipped" in result && result.skipped) {
    const message =
      result.error instanceof Error ? result.error.message : "Email delivery is not configured.";
    console.error(`[system-email] ${params.type} skipped for ${params.to}:`, message);
    try {
      const admin = await createAdminClientAsync();
      await admin.from("system_email_failures").insert({
        email_type: params.type,
        recipient: params.to,
        subject: params.subject,
        payload: (params.payload ?? {}) as Json,
        error_message: message,
      });
    } catch (logError) {
      console.error("[system-email] could not log failure:", logError);
    }
    return { sent: false as const, skipped: true as const, error: message };
  }

  if ("error" in result && result.error) {
    const message =
      result.error instanceof Error ? result.error.message : String(result.error);
    console.error(`[system-email] ${params.type} failed for ${params.to}:`, message);

    try {
      const admin = await createAdminClientAsync();
      await admin.from("system_email_failures").insert({
        email_type: params.type,
        recipient: params.to,
        subject: params.subject,
        payload: (params.payload ?? {}) as Json,
        error_message: message,
      });
    } catch (logError) {
      console.error("[system-email] could not log failure:", logError);
    }

    return { sent: false as const, error: message };
  }

  return { sent: true as const, messageId: "messageId" in result ? result.messageId : undefined };
}
