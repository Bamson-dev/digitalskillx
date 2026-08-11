import "server-only";

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "metadata.google.internal"
  ) {
    return true;
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (
    host.startsWith("[") &&
    (/^\[::ffff:127\./i.test(host) || /^\[fc/i.test(host) || /^\[fd/i.test(host) || /^\[fe80/i.test(host))
  ) {
    return true;
  }
  return false;
}

/**
 * Allow only public http(s) URLs for creator research fetches (SSRF guard).
 */
export function assertSafePublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error("Private or local URLs are not allowed.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed.");
  }
  return url;
}

async function fetchOnce(url: URL, signal: AbortSignal) {
  return fetch(url.toString(), {
    method: "GET",
    redirect: "manual",
    signal,
    headers: {
      "User-Agent": "DigitalSkillXContentFactory/1.0",
      Accept: "text/html,application/xhtml+xml,text/plain",
    },
  });
}

export async function fetchPublicTextSnippet(
  rawUrl: string,
  options?: { maxBytes?: number; timeoutMs?: number },
): Promise<{ url: string; title: string; text: string } | null> {
  let url = assertSafePublicHttpUrl(rawUrl);
  const maxBytes = options?.maxBytes ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 8_000);
  try {
    let res = await fetchOnce(url, controller.signal);
    // Manually follow a small number of redirects, re-validating each hop.
    for (let hop = 0; hop < 3 && res.status >= 300 && res.status < 400; hop++) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      url = assertSafePublicHttpUrl(new URL(loc, url).toString());
      res = await fetchOnce(url, controller.signal);
    }
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(ctype)) return null;
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const title =
      html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8_000);
    return { url: url.toString(), title, text };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
