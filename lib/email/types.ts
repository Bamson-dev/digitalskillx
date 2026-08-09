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

export type SendEmailResult =
  | { messageId: string }
  | { skipped: true; error: Error }
  | { error: unknown };
