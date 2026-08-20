/**
 * Sanitize untrusted HTML for high-fidelity static landing pages.
 * Removes scripts, event handlers, and dangerous URLs. Does not execute JS.
 */

const DANGEROUS_TAGS =
  /<\/?(?:script|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option|frame|frameset)[\s\S]*?>/gi;

export function sanitizeLandingHtml(html: string, maxBytes = 2 * 1024 * 1024): string {
  let out = String(html ?? "");
  if (Buffer.byteLength(out, "utf8") > maxBytes) {
    out = out.slice(0, maxBytes);
  }

  // Remove scripts and dangerous tags (keep visible content where possible)
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, (block) => {
    // Styles stay but strip expression()/behavior
    return block
      .replace(/expression\s*\(/gi, "blocked(")
      .replace(/-moz-binding\s*:/gi, "blocked:")
      .replace(/behavior\s*:/gi, "blocked:");
  });
  out = out.replace(DANGEROUS_TAGS, "");
  out = out.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/\s(href|src|action|formaction|xlink:href)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
  out = out.replace(/\s(href|src|action|formaction)\s*=\s*javascript:[^\s>]*/gi, ' href="#"');
  out = out.replace(/<svg[\s\S]*?<\/svg>/gi, (svg) => {
    if (/<script|onload|onerror|javascript:/i.test(svg)) return "<!-- blocked unsafe svg -->";
    return svg;
  });
  return out;
}

export function extractDocumentTitle(html: string): string {
  const m = String(html ?? "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return m[1]!.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function extractBodyHtml(html: string): string {
  const m = String(html ?? "").match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1]! : String(html ?? "");
}

export function extractInlineAndLinkedStylesheetHrefs(html: string, baseUrl: string): string[] {
  const hrefs: string[] = [];
  const re = /<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const tag = match[0];
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i) || tag.match(/href=([^\s>]+)/i);
    if (!hrefMatch) continue;
    try {
      hrefs.push(new URL(hrefMatch[1]!, baseUrl).toString());
    } catch {
      /* skip */
    }
  }
  return hrefs;
}

export function extractInlineStyleBlocks(html: string): string {
  const blocks: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    blocks.push(match[1] ?? "");
  }
  return blocks.join("\n");
}

export function absolutizeRelativeUrls(html: string, baseUrl: string): string {
  return html.replace(
    /\s(href|src|poster)\s*=\s*(['"])([^'"]+)\2/gi,
    (full, attr: string, quote: string, value: string) => {
      const v = value.trim();
      if (!v || v.startsWith("#") || v.startsWith("data:") || v.startsWith("mailto:") || v.startsWith("tel:")) {
        return full;
      }
      try {
        const abs = new URL(v, baseUrl).toString();
        return ` ${attr}=${quote}${abs}${quote}`;
      } catch {
        return full;
      }
    },
  );
}

export function collectAssetUrls(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || v.startsWith("data:") || v.startsWith("#") || v.startsWith("mailto:") || v.startsWith("tel:")) return;
    try {
      found.add(new URL(v, baseUrl).toString());
    } catch {
      /* skip */
    }
  };

  for (const m of html.matchAll(/\s(?:src|poster)\s*=\s*(['"])([^'"]+)\1/gi)) {
    add(m[2]!);
  }
  for (const m of html.matchAll(/\ssrcset\s*=\s*(['"])([^'"]+)\1/gi)) {
    for (const part of m[2]!.split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url) add(url);
    }
  }
  for (const m of html.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
    add(m[2]!);
  }
  return [...found];
}

export function rewriteAssetUrls(html: string, map: Map<string, string>): string {
  let out = html;
  for (const [from, to] of map) {
    if (!from || !to || from === to) continue;
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), to);
  }
  return out;
}

export function sanitizeCss(css: string, maxBytes = 512 * 1024): string {
  let out = String(css ?? "");
  if (Buffer.byteLength(out, "utf8") > maxBytes) out = out.slice(0, maxBytes);
  return out
    .replace(/@import\s+/gi, "/* blocked-import */ ")
    .replace(/expression\s*\(/gi, "blocked(")
    .replace(/javascript:/gi, "blocked:")
    .replace(/-moz-binding\s*:/gi, "blocked:")
    .replace(/behavior\s*:/gi, "blocked:");
}
