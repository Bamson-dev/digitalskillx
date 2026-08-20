import type { CtaDetectionKind, DetectedCta } from "./constants";

const CONVERSION_RE =
  /\b(buy|purchase|order|enroll|enrol|register|signup|sign[\s-]?up|checkout|pay|get[\s-]?(access|started)|join|claim|start[\s-]?now|add[\s-]?to[\s-]?cart)\b/i;

const NAV_RE =
  /\b(home|about|privacy|terms|blog|contact|login|log[\s-]?in|signin|sign[\s-]?in|faq|policy|cookie|twitter|facebook|instagram|linkedin|youtube|tiktok)\b/i;

function newCtaId(): string {
  return globalThis.crypto.randomUUID();
}

export function classifyCta(text: string, href: string): CtaDetectionKind {
  const t = `${text} ${href}`.toLowerCase();
  if (CONVERSION_RE.test(t)) return "conversion";
  if (NAV_RE.test(t) || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return "navigation";
  }
  if (/\/(checkout|cart|order|buy|enroll|register|pay)\b/i.test(href)) return "conversion";
  return "unknown";
}

/**
 * Detect anchor CTAs. Button text is preserved; only destinations are rewritten later.
 */
export function detectAnchorCtas(html: string): DetectedCta[] {
  const ctas: DetectedCta[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const hrefMatch = attrs.match(/\bhref\s*=\s*(['"])(.*?)\1/i) || attrs.match(/\bhref\s*=\s*([^\s>]+)/i);
    if (!hrefMatch) continue;
    const href = (hrefMatch[2] ?? hrefMatch[1] ?? "").trim();
    if (!href) continue;
    const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    const kind = classifyCta(text, href);
    ctas.push({
      id: newCtaId(),
      kind,
      text: text || "(no text)",
      originalHref: href,
      rewrite: kind === "conversion",
      mappedHref: null,
    });
  }
  return ctas;
}

/** Only same-origin http(s) destinations are allowed for rewritten conversion CTAs. */
export function isAllowedRewriteDestination(dest: string, siteOrigin: string): boolean {
  try {
    const origin = new URL(siteOrigin).origin;
    const u = new URL(dest, origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (u.origin !== origin) return false;
    return true;
  } catch {
    return false;
  }
}

function escapeReplacement(value: string): string {
  // Avoid $& / $1 injection in String.replace replacement strings.
  return value.replace(/\$/g, "$$$$");
}

export function applyCtaRewrites(
  html: string,
  ctas: DetectedCta[],
  defaultDestination: string | null,
  siteOrigin?: string,
): string {
  let out = html;
  for (const cta of ctas) {
    if (!cta.rewrite) continue;
    const dest = cta.mappedHref || defaultDestination;
    if (!dest) continue;
    if (siteOrigin && !isAllowedRewriteDestination(dest, siteOrigin)) continue;
    const from = cta.originalHref;
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const safeDest = escapeReplacement(dest);
    out = out.replace(
      new RegExp(`(\\bhref\\s*=\\s*)(['"])${escaped}\\2`, "i"),
      `$1$2${safeDest}$2 target="_top" rel="noopener"`,
    );
  }
  return out;
}

/**
 * Resolve destination for conversion CTAs.
 * External arbitrary URLs are never accepted — only DigitalSkillX same-origin
 * destinations (course checkout or internal path).
 */
export function resolveDestinationUrl(params: {
  destinationType: string;
  destinationUrl?: string | null;
  courseId?: string | null;
  siteOrigin: string;
}): string | null {
  const origin = params.siteOrigin.replace(/\/$/, "");
  if (params.destinationType === "course_checkout" && params.courseId) {
    if (!/^[0-9a-f-]{36}$/i.test(params.courseId)) return null;
    return `${origin}/course/${params.courseId}`;
  }

  // product_checkout / offer / internal_url: require same-origin destination_url
  if (
    (params.destinationType === "internal_url" ||
      params.destinationType === "product_checkout" ||
      params.destinationType === "offer") &&
    params.destinationUrl
  ) {
    try {
      const u = new URL(params.destinationUrl, origin);
      if (!isAllowedRewriteDestination(u.toString(), origin)) return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  return null;
}
