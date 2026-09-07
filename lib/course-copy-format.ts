/**
 * Format course marketing / overview copy for readable LMS presentation.
 * Descriptions are often pasted as a single wall of text from docs or AI.
 */

export function splitCourseParagraphs(raw: string | null | undefined): string[] {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  // Prefer explicit blank-line paragraphs.
  let parts = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (parts.length === 1 && parts[0].length > 420) {
    // Soft-split long single blobs on sentence boundaries into ~2–4 readable blocks.
    parts = softSplitLongParagraph(parts[0]);
  }

  return parts;
}

function softSplitLongParagraph(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [
    text,
  ];
  if (sentences.length <= 2) return [text];

  const target = Math.min(4, Math.max(2, Math.ceil(sentences.length / 3)));
  const chunkSize = Math.ceil(sentences.length / target);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    out.push(sentences.slice(i, i + chunkSize).join(" ").trim());
  }
  return out.filter(Boolean);
}

/** Strip trailing "What you'll learn" lists from description when outcomes are shown separately. */
export function stripEmbeddedOutcomesSection(raw: string | null | undefined): string {
  const text = String(raw ?? "");
  if (!text) return "";
  const patterns = [
    /\n+\s*(what you(?:'|’)ll learn|what you will learn|you(?:'|’)ll learn)\s*:?\s*\n/i,
    /\s+(what you(?:'|’)ll learn|what you will learn)\s*:?\s+(?=[A-Z•\-\*])/i,
  ];
  for (const pattern of patterns) {
    const cut = text.search(pattern);
    if (cut > 80) return text.slice(0, cut).trim();
  }
  return text.trim();
}

export function courseOverviewBlurb(
  shortDescription: string | null | undefined,
  description: string | null | undefined,
  maxChars = 220,
): string {
  const short = String(shortDescription ?? "").trim();
  if (short) return short;
  const first = splitCourseParagraphs(stripEmbeddedOutcomesSection(description))[0] ?? "";
  if (first.length <= maxChars) return first;
  return `${first.slice(0, maxChars - 1).replace(/\s+\S*$/, "")}…`;
}
