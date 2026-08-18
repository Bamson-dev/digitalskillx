export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  tags?: Array<{ name: string; value: string }>;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
};

export type SendEmailResult =
  | { messageId: string }
  | { skipped: true; error: Error }
  | { error: unknown };
