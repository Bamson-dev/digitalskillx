import crypto from "crypto";

/**
 * Verifies a Resend webhook (Svix scheme) against the raw request body.
 * Signed content: `${svix-id}.${svix-timestamp}.${body}`, HMAC-SHA256 with the
 * base64 secret after the `whsec_` prefix. Header holds space-separated `v1,<sig>`.
 */
export function verifySvixSignature(params: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  const { secret, id, timestamp, signature, body } = params;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > (params.toleranceSeconds ?? 300)) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  for (const part of signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    let given: Buffer;
    try {
      given = Buffer.from(sig, "base64");
    } catch {
      continue;
    }
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return true;
  }
  return false;
}
