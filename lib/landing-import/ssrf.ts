import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { LANDING_IMPORT_LIMITS, LANDING_IMPORT_USER_AGENT } from "./constants";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "metadata",
]);

/** Convert ::ffff:7f00:1 style mapped IPv6 to dotted IPv4. */
function ipv4MappedFromHex(ip: string): string | null {
  const m = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!m) return null;
  const hi = Number.parseInt(m[1]!, 16);
  const lo = Number.parseInt(m[2]!, 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

/** Exported for offline security tests. */
export function isPrivateIp(ip: string): boolean {
  const raw = String(ip ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!raw) return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
  const mappedDotted = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedDotted) return isPrivateIp(mappedDotted[1]!);
  const mappedHex = ipv4MappedFromHex(raw);
  if (mappedHex) return isPrivateIp(mappedHex);

  if (raw === "::1" || raw === "::" || raw === "0.0.0.0") return true;

  // IPv4
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) {
    const parts = raw.split(".").map((p) => Number(p));
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 100 && b === 100) return true; // cloud metadata aliases
    return false;
  }

  // IPv6 unique-local / link-local / loopback prefixes
  if (raw.startsWith("fc") || raw.startsWith("fd") || raw.startsWith("fe80")) return true;
  if (raw === "0:0:0:0:0:0:0:1") return true;
  return false;
}

export type SafeUrlResult = { ok: true; url: URL } | { ok: false; reason: string };

export function validatePublicHttpUrl(raw: string): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return { ok: false, reason: "Invalid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http/https URLs are allowed." };
  }
  // Block credentialed URLs (user:pass@host)
  if (url.username || url.password) {
    return { ok: false, reason: "URLs with credentials are not allowed." };
  }
  // Some Node versions keep brackets on IPv6 hostnames ([::1]).
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    return { ok: false, reason: "Host is not allowed." };
  }
  if (isIP(host) && isPrivateIp(host)) {
    return { ok: false, reason: "Private IP addresses are not allowed." };
  }
  return { ok: true, url };
}

export async function assertSafePublicUrl(raw: string): Promise<SafeUrlResult> {
  const basic = validatePublicHttpUrl(raw);
  if (!basic.ok) return basic;
  const { url } = basic;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateIp(host)) return { ok: false, reason: "Private IP addresses are not allowed." };
    return basic;
  }
  try {
    const records = await lookup(host, { all: true });
    if (records.length === 0) return { ok: false, reason: "Could not resolve host." };
    for (const rec of records) {
      if (isPrivateIp(rec.address)) {
        return { ok: false, reason: "URL resolves to a private network address." };
      }
    }
  } catch {
    return { ok: false, reason: "Could not resolve host." };
  }
  return basic;
}

/**
 * Fetch a public URL with SSRF controls.
 * Re-validates the target before every hop (mitigates simple DNS rebinding / redirect chains).
 * Does not forward cookies or credentials.
 */
export async function fetchPublicUrl(
  rawUrl: string,
  opts?: { maxBytes?: number; accept?: string; fetchImpl?: typeof fetch },
): Promise<
  | { ok: true; body: Buffer; contentType: string; finalUrl: string }
  | { ok: false; reason: string }
> {
  const maxBytes = opts?.maxBytes ?? LANDING_IMPORT_LIMITS.maxAssetBytes;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  let current = await assertSafePublicUrl(rawUrl);
  if (!current.ok) return current;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LANDING_IMPORT_LIMITS.fetchTimeoutMs);

  try {
    for (let hop = 0; hop <= LANDING_IMPORT_LIMITS.maxRedirects; hop++) {
      // Re-check immediately before the network call (DNS rebinding mitigation).
      const recheck = await assertSafePublicUrl(current.url.toString());
      if (!recheck.ok) return recheck;
      current = recheck;

      const res = await fetchImpl(current.url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": LANDING_IMPORT_USER_AGENT,
          Accept: opts?.accept ?? "*/*",
          // Never forward cookies / authorization from DigitalSkillX.
        },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        if (hop === LANDING_IMPORT_LIMITS.maxRedirects) {
          return { ok: false, reason: "Too many redirects." };
        }
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, reason: "Redirect without location." };
        const next = new URL(loc, current.url);
        const safeNext = await assertSafePublicUrl(next.toString());
        if (!safeNext.ok) return { ok: false, reason: `Redirect blocked: ${safeNext.reason}` };
        current = safeNext;
        continue;
      }

      if (!res.ok) return { ok: false, reason: `Fetch failed (${res.status}).` };
      const len = Number(res.headers.get("content-length") || 0);
      if (len > maxBytes) return { ok: false, reason: "Response exceeds size limit." };
      const ab = await res.arrayBuffer();
      if (ab.byteLength > maxBytes) return { ok: false, reason: "Response exceeds size limit." };
      const contentType = (res.headers.get("content-type") || "application/octet-stream").split(";")[0]!.trim();
      return {
        ok: true,
        body: Buffer.from(ab),
        contentType,
        finalUrl: current.url.toString(),
      };
    }
    return { ok: false, reason: "Too many redirects." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fetch failed.";
    return { ok: false, reason: msg.includes("abort") ? "Request timed out." : "Fetch failed." };
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeSourceUrl(raw: string): string {
  const basic = validatePublicHttpUrl(raw);
  if (!basic.ok) return String(raw ?? "").trim().toLowerCase();
  const u = basic.url;
  u.hash = "";
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString().toLowerCase();
}
