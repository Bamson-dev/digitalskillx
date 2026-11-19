import "server-only";
import { randomUUID } from "node:crypto";
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import type { SendEmailParams, SendEmailResult } from "@/lib/email/types";
import type { EmailSenderConfig } from "@/lib/platform-settings";
import { secureLogError } from "@/lib/secure-log";
import { ErrorCode } from "@/lib/error-codes";

type Reply = { code: number; lines: string[] };
type SmtpSocket = Socket | TLSSocket;

function env(name: string): string {
  return (process.env as Record<string, string | undefined>)[name]?.trim() ?? "";
}

function validateAddress(address: string): void {
  if (address.length > 254 || /[\r\n<> ]/.test(address) || !/^[^@]+@[^@]+\.[^@]+$/.test(address)) {
    throw new Error("A valid email address is required.");
  }
}

function recipientsOf(to: string | string[]): string[] {
  const recipients = (Array.isArray(to) ? to : [to]).map((item) => item.trim()).filter(Boolean);
  if (recipients.length === 0) throw new Error("Email recipient is required.");
  recipients.forEach(validateAddress);
  return recipients;
}

function safeHeader(value: string, label: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error(label + " contains an invalid header character.");
  return value.trim();
}

function encodeHeader(value: string): string {
  const safe = safeHeader(value, "Email header");
  if (/^[\x20-\x7e]*$/.test(safe)) return safe;
  return "=?UTF-8?B?" + Buffer.from(safe, "utf8").toString("base64") + "?=";
}

function encodeDisplayName(value: string): string {
  const safe = safeHeader(value, "Sender name");
  if (!safe) return "";
  if (/^[\x20-\x7e]*$/.test(safe)) {
    return '"' + safe.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return encodeHeader(safe);
}

function wrapBase64(value: Buffer | string): string {
  const encoded = Buffer.isBuffer(value)
    ? value.toString("base64")
    : Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function makeZeptoMailMimeMessage(
  params: SendEmailParams,
  sender: EmailSenderConfig,
  fromAddress: string,
  fromName: string,
): { message: string; messageId: string } {
  validateAddress(fromAddress);
  const to = recipientsOf(params.to);
  const replyTo = params.replyTo ?? sender.replyTo;
  if (replyTo) validateAddress(replyTo);

  const messageId = "<" + randomUUID() + "@" + fromAddress.split("@")[1] + ">";
  const headers = [
    "From: " + encodeDisplayName(fromName) + " <" + fromAddress + ">",
    "To: " + to.join(", "),
    "Subject: " + encodeHeader(params.subject),
    "Date: " + new Date().toUTCString(),
    "Message-ID: " + messageId,
    "MIME-Version: 1.0",
  ];
  if (replyTo) headers.push("Reply-To: <" + replyTo + ">");

  for (const [name, value] of Object.entries(params.headers ?? {})) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,77}$/.test(name)) {
      throw new Error("An email header name is invalid.");
    }
    if (/^(from|to|subject|date|message-id|mime-version|content-type|content-transfer-encoding)$/i.test(name)) {
      continue;
    }
    headers.push(name + ": " + safeHeader(value, name));
  }
  if (params.idempotencyKey) {
    headers.push("X-DigitalSkillX-Idempotency-Key: " + safeHeader(params.idempotencyKey, "Idempotency key"));
  }
  if (params.tags?.length) {
    const tags = params.tags
      .map((tag) => safeHeader(tag.name, "Tag name") + "=" + safeHeader(tag.value, "Tag value"))
      .join(",");
    headers.push("X-DigitalSkillX-Tags: " + tags);
  }

  const alternativeBoundary = "dsx-alt-" + randomUUID();
  const htmlPart = [
    "--" + alternativeBoundary,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(plainTextFromHtml(params.html)),
    "--" + alternativeBoundary,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(params.html),
    "--" + alternativeBoundary + "--",
  ].join("\r\n");

  let body = [
    'Content-Type: multipart/alternative; boundary="' + alternativeBoundary + '"',
    "",
    htmlPart,
  ].join("\r\n");

  if (params.attachments?.length) {
    const mixedBoundary = "dsx-mixed-" + randomUUID();
    const parts = [
      'Content-Type: multipart/mixed; boundary="' + mixedBoundary + '"',
      "",
      "--" + mixedBoundary,
      'Content-Type: multipart/alternative; boundary="' + alternativeBoundary + '"',
      "",
      htmlPart,
    ];
    for (const attachment of params.attachments) {
      const filename = safeHeader(attachment.filename, "Attachment filename").replace(/[\\/"]/g, "_");
      const rawType = (attachment.contentType ?? "application/octet-stream").trim();
      const mimeType = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(rawType)
        ? rawType
        : "application/octet-stream";
      const safeFilename = filename.replace(/[^\x20-\x7e]/g, "_");
      parts.push(
        "--" + mixedBoundary,
        mimeType + '; name="' + safeFilename + '"',
        'Content-Disposition: attachment; filename="' + safeFilename + '"',
        "Content-Transfer-Encoding: base64",
        "",
        wrapBase64(attachment.content),
      );
    }
    parts.push("--" + mixedBoundary + "--");
    body = parts.join("\r\n");
  }

  return { message: headers.join("\r\n") + "\r\n" + body, messageId };
}

class SmtpSession {
  private socket: SmtpSocket;
  private buffer = "";
  private currentLines: string[] = [];
  private replies: Reply[] = [];
  private waiters: Array<{ resolve: (reply: Reply) => void; reject: (error: Error) => void }> = [];
  private failure: Error | null = null;

  private readonly onData = (chunk: Buffer | string) => {
    this.buffer += chunk.toString();
    let boundary = this.buffer.indexOf("\r\n");
    while (boundary >= 0) {
      const line = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      this.currentLines.push(line);
      if (/^\d{3} /.test(line)) {
        const reply = { code: Number(line.slice(0, 3)), lines: [...this.currentLines] };
        this.currentLines = [];
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(reply);
        else this.replies.push(reply);
      }
      boundary = this.buffer.indexOf("\r\n");
    }
  };

  private readonly onError = (error: Error) => this.fail(error);
  private readonly onClose = () => this.fail(new Error("Zoho SMTP connection closed unexpectedly."));

  constructor(socket: SmtpSocket) {
    this.socket = socket;
    this.attach(socket);
  }

  private attach(socket: SmtpSocket): void {
    this.socket = socket;
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
    socket.setTimeout(20_000, () => socket.destroy(new Error("Zoho SMTP connection timed out.")));
  }

  detach(): void {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  nextReply(): Promise<Reply> {
    if (this.failure) return Promise.reject(this.failure);
    const queued = this.replies.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async command(command: string, expectedCodes: number[]): Promise<Reply> {
    const replyPromise = this.nextReply();
    this.socket.write(command + "\r\n");
    const reply = await replyPromise;
    if (!expectedCodes.includes(reply.code)) {
      throw new Error("Zoho SMTP rejected a command (response " + reply.code + ").");
    }
    return reply;
  }

  writeMessage(message: string): Promise<Reply> {
    const replyPromise = this.nextReply();
    const dotStuffed = message.replace(/(^|\r\n)\./g, "$1..");
    this.socket.write(dotStuffed + "\r\n.\r\n");
    return replyPromise;
  }

  destroy(): void {
    this.detach();
    this.socket.destroy();
  }
}

function expectReply(reply: Reply, accepted: number[], operation: string): void {
  if (!accepted.includes(reply.code)) {
    throw new Error("Zoho SMTP " + operation + " failed (response " + reply.code + ").");
  }
}

function waitForSocketEvent(
  socket: Socket | TLSSocket,
  event: "connect" | "secureConnect",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      socket.off(event, onReady);
      reject(error);
    };
    const onReady = () => {
      socket.off("error", onError);
      resolve();
    };
    socket.once(event, onReady);
    socket.once("error", onError);
  });
}

async function openSmtpSession(host: string, port: number): Promise<SmtpSession> {
  if (port === 465) {
    const secure = tlsConnect({ host, port, servername: host, rejectUnauthorized: true });
    await waitForSocketEvent(secure, "secureConnect");
    const session = new SmtpSession(secure);
    expectReply(await session.nextReply(), [220], "greeting");
    await session.command("EHLO " + host, [250]);
    return session;
  }

  const plain = netConnect({ host, port });
  await waitForSocketEvent(plain, "connect");
  const session = new SmtpSession(plain);
  expectReply(await session.nextReply(), [220], "greeting");
  const hello = await session.command("EHLO " + host, [250]);
  if (!hello.lines.some((line) => /STARTTLS/i.test(line))) {
    session.destroy();
    throw new Error("Zoho SMTP server did not advertise STARTTLS. Refusing an unencrypted connection.");
  }
  await session.command("STARTTLS", [220]);
  session.detach();

  const secure = tlsConnect({ socket: plain, servername: host, rejectUnauthorized: true });
  await waitForSocketEvent(secure, "secureConnect");
  const secureSession = new SmtpSession(secure);
  await secureSession.command("EHLO " + host, [250]);
  return secureSession;
}

async function authenticate(session: SmtpSession, username: string, password: string): Promise<void> {
  await session.command("AUTH LOGIN", [334]);
  await session.command(Buffer.from(username, "utf8").toString("base64"), [334]);
  await session.command(Buffer.from(password, "utf8").toString("base64"), [235]);
}

/** True when Coolify has the ZeptoMail SMTP password in its runtime environment. */
export function zeptoConfigured(): boolean {
  return Boolean(env("ZEPTOMAIL_SMTP_PASSWORD"));
}

/** Send transactional email through the account's ZeptoMail SMTP credentials. */
export async function sendViaZeptoMail(
  params: SendEmailParams,
  sender: EmailSenderConfig,
): Promise<SendEmailResult> {
  if (!zeptoConfigured()) {
    return { skipped: true, error: new Error("Zoho ZeptoMail SMTP is not configured in the server runtime.") };
  }

  const host = env("ZEPTOMAIL_SMTP_HOST") || "smtp.zeptomail.com";
  const port = Number(env("ZEPTOMAIL_SMTP_PORT") || "587");
  const username = env("ZEPTOMAIL_SMTP_USER") || "emailapikey";
  const password = env("ZEPTOMAIL_SMTP_PASSWORD");
  const fromAddress = env("ZEPTOMAIL_FROM_EMAIL") || sender.fromAddress || "courses@digitalskillx.com";
  const fromName = env("ZEPTOMAIL_FROM_NAME") || sender.fromName || "DigitalSkillX";
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: new Error("Zoho ZeptoMail SMTP port is invalid.") };
  }

  let session: SmtpSession | null = null;
  try {
    recipientsOf(params.to);
    validateAddress(fromAddress);
    session = await openSmtpSession(host, port);
    await authenticate(session, username, password);
    await session.command("MAIL FROM:<" + fromAddress + ">", [250]);
    for (const recipient of recipientsOf(params.to)) {
      await session.command("RCPT TO:<" + recipient + ">", [250, 251]);
    }
    await session.command("DATA", [354]);
    const built = makeZeptoMailMimeMessage(params, sender, fromAddress, fromName);
    const accepted = await session.writeMessage(built.message);
    expectReply(accepted, [250], "message submission");
    try {
      await session.command("QUIT", [221]);
    } catch {
      // The server may close immediately after accepting the message.
    }
    return { messageId: built.messageId };
  } catch (error) {
    secureLogError("email", ErrorCode.EMAIL_DELIVERY_FAILED, "Zoho ZeptoMail SMTP send failed", {
      provider: "zeptomail",
      error: error instanceof Error ? error.message : String(error),
      subject: params.subject.slice(0, 120),
    });
    return { error: error instanceof Error ? error : new Error("Zoho ZeptoMail SMTP send failed.") };
  } finally {
    session?.destroy();
  }
}
