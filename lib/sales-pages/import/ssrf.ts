import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { STORAGE_LIMITS } from "../../storage/limits";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}

export type SafeUrlResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export function validateExternalAssetUrl(raw: string): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return { ok: false, reason: "Invalid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http/https URLs are allowed." };
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "Host is not allowed." };
  }
  if (isIP(host) && isPrivateIp(host)) {
    return { ok: false, reason: "Private IP addresses are not allowed." };
  }
  return { ok: true, url };
}

/**
 * Resolve hostname and reject private/link-local targets (SSRF protection).
 */
export async function assertSafeExternalUrl(raw: string): Promise<SafeUrlResult> {
  const basic = validateExternalAssetUrl(raw);
  if (!basic.ok) return basic;
  const { url } = basic;
  if (isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) {
      return { ok: false, reason: "Private IP addresses are not allowed." };
    }
    return basic;
  }
  try {
    const records = await lookup(url.hostname, { all: true });
    for (const rec of records) {
      if (isPrivateIp(rec.address)) {
        return { ok: false, reason: "URL resolves to a private network address." };
      }
    }
  } catch {
    return { ok: false, reason: "Could not resolve asset host." };
  }
  return basic;
}

export async function downloadExternalAsset(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; body: Buffer; contentType: string; finalUrl: string } | { ok: false; reason: string }> {
  const safe = await assertSafeExternalUrl(rawUrl);
  if (!safe.ok) return { ok: false, reason: safe.reason };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_LIMITS.remoteDownloadTimeoutMs);
  try {
    const res = await fetchImpl(safe.url.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "DigitalSkillX-SalesPageImporter/1.0" },
    });

    // Follow a single safe redirect manually
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, reason: "Redirect without location." };
      const redirected = new URL(loc, safe.url);
      const second = await assertSafeExternalUrl(redirected.toString());
      if (!second.ok) return { ok: false, reason: second.reason };
      const res2 = await fetchImpl(second.url.toString(), {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: { "User-Agent": "DigitalSkillX-SalesPageImporter/1.0" },
      });
      if (!res2.ok) return { ok: false, reason: `Download failed (${res2.status}).` };
      return readBody(res2, second.url.toString());
    }

    if (!res.ok) return { ok: false, reason: `Download failed (${res.status}).` };
    return readBody(res, safe.url.toString());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Download failed.";
    return { ok: false, reason: msg.includes("abort") ? "Download timed out." : "Download failed." };
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(res: Response, finalUrl: string) {
  const len = Number(res.headers.get("content-length") || 0);
  if (len > STORAGE_LIMITS.maxRemoteDownloadBytes) {
    return { ok: false as const, reason: "Remote file exceeds size limit." };
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > STORAGE_LIMITS.maxRemoteDownloadBytes) {
    return { ok: false as const, reason: "Remote file exceeds size limit." };
  }
  const contentType = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  return {
    ok: true as const,
    body: Buffer.from(ab),
    contentType,
    finalUrl,
  };
}
