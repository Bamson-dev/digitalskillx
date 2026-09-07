/**
 * Public HTTPS origin for redirects and emails.
 * Behind Coolify/Docker, request.url is often http://localhost:3000 — never send that to users in production.
 */

export const PUBLIC_SITE_ORIGIN = "https://www.digitalskillx.com";

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

function allowLocalOrigins() {
  return process.env.NODE_ENV !== "production";
}

/** Normalize to a safe public origin (never localhost / private IP in production). */
export function normalizePublicOrigin(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return PUBLIC_SITE_ORIGIN;

  let candidate = value;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (isPrivateOrLocalHost(url.hostname)) {
      return allowLocalOrigins() ? url.origin : PUBLIC_SITE_ORIGIN;
    }

    const host = url.hostname.toLowerCase();
    if (host === "digitalskillx.com" || host === "www.digitalskillx.com") {
      return PUBLIC_SITE_ORIGIN;
    }
    if (!allowLocalOrigins() && url.protocol !== "https:") {
      url.protocol = "https:";
    }
    return url.origin;
  } catch {
    return PUBLIC_SITE_ORIGIN;
  }
}

type HeaderSource = {
  get(name: string): string | null;
};

/**
 * Resolve the origin users should see in the browser.
 * Prefers forwarded host headers from the reverse proxy, then env, never localhost in production.
 */
export function publicSiteOrigin(input?: {
  headers?: HeaderSource;
  requestUrl?: string | null;
}): string {
  const headers = input?.headers;

  const forwardedHost = headers?.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = headers?.get("host")?.split(",")[0]?.trim();
  const forwardedProto = headers?.get("x-forwarded-proto")?.split(",")[0]?.trim();

  for (const host of [forwardedHost, hostHeader]) {
    if (!host) continue;
    const hostname = host.split(":")[0];
    if (isPrivateOrLocalHost(hostname) && !allowLocalOrigins()) continue;
    const proto =
      forwardedProto === "http" || forwardedProto === "https"
        ? forwardedProto
        : allowLocalOrigins() && isPrivateOrLocalHost(hostname)
          ? "http"
          : "https";
    return normalizePublicOrigin(`${proto}://${host}`);
  }

  if (input?.requestUrl) {
    try {
      return normalizePublicOrigin(new URL(input.requestUrl).origin);
    } catch {
      // fall through
    }
  }

  return normalizePublicOrigin(process.env.NEXT_PUBLIC_SITE_URL);
}

/** Build an absolute URL on the public site origin (safe for redirects). */
export function publicAbsoluteUrl(
  pathWithQuery: string,
  input?: { headers?: HeaderSource; requestUrl?: string | null },
): URL {
  const origin = publicSiteOrigin(input);
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return new URL(path, `${origin}/`);
}
