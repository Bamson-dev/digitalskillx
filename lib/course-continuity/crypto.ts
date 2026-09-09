/**
 * HMAC helpers for course-continuity tokens.
 * Uses Web Crypto so the same code works in Edge middleware and Node.
 */

function getSecretBytes(): ArrayBuffer {
  const env = process.env as Record<string, string | undefined>;
  const raw =
    env.COURSE_CONTINUITY_SECRET?.trim() ||
    env.CRON_SECRET?.trim() ||
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  const bytes = new TextEncoder().encode(
    raw || "digitalskillx-continuity-dev-only",
  );
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const b64 = padded + pad;
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getSecretBytes(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signPayload(payloadJson: string): Promise<string> {
  const key = await hmacKey();
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const sig = await crypto.subtle.sign("HMAC", key, payloadBytes);
  return `${bytesToBase64Url(payloadBytes)}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

export async function verifySignedToken(
  token: string,
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  try {
    const key = await hmacKey();
    const payloadBytes = base64UrlToBytes(body);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(base64UrlToBytes(sig)),
      toArrayBuffer(payloadBytes),
    );
    if (!ok) return null;
    return new TextDecoder().decode(payloadBytes);
  } catch {
    return null;
  }
}
