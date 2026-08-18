import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "./constants";
import { siteUrl } from "../org";

function unsubscribeSecret(): string | null {
  const secret = (
    process.env.EMAIL_UNSUBSCRIBE_SECRET ??
    process.env.CRON_SECRET ??
    ""
  ).trim();
  return secret || null;
}

export function createUnsubscribeToken(email: string, campaignSlug: string): string | null {
  const secret = unsubscribeSecret();
  if (!secret) return null;
  const payload = `${normalizeEmail(email)}|${campaignSlug}`;
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${digest}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { email: string; campaignSlug: string } | null {
  const secret = unsubscribeSecret();
  if (!secret) return null;
  const [encoded, digest] = token.split(".");
  if (!encoded || !digest) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [email, campaignSlug] = payload.split("|");
  if (!email || !campaignSlug) return null;
  return { email: normalizeEmail(email), campaignSlug };
}

export function unsubscribeUrl(email: string, campaignSlug: string): string | null {
  const token = createUnsubscribeToken(email, campaignSlug);
  if (!token) return null;
  const base = siteUrl().replace(/\/$/, "");
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function unsubscribeApiUrl(email: string, campaignSlug: string): string | null {
  const token = createUnsubscribeToken(email, campaignSlug);
  if (!token) return null;
  const base = siteUrl().replace(/\/$/, "");
  return `${base}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function listUnsubscribeHeader(unsubUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
