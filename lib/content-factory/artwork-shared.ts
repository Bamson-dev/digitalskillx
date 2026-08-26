/** Pure artwork helpers for Free Learning Library covers (no secrets). */

export type ArtworkStatus =
  | "generated"
  | "processing"
  | "retrying"
  | "source_thumbnail"
  | "category_fallback"
  | "failed"
  | "missing";

export type ArtworkSource = "openai" | "youtube" | "category" | "manual";

export const ARTWORK_RETRY_ATTEMPTS = 2;

export function buildLearningPathArtworkPrompt(input: {
  title: string;
  category: string;
  description?: string | null;
  shortDescription?: string | null;
  difficulty?: string | null;
  learningObjectives?: string[] | null;
  tags?: string[] | null;
}): string {
  const title = input.title.trim().slice(0, 120) || "Free learning path";
  const category = (input.category || "skills").trim().slice(0, 60);
  const difficulty = (input.difficulty || "beginner").trim().slice(0, 40);
  const blurb = (input.shortDescription || input.description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  const objectives = (input.learningObjectives ?? [])
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("; ");
  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5).join(", ");

  const categoryCue: Record<string, string> = {
    marketing: "clean marketing analytics charts, social media tiles, growth arrows",
    "digital marketing": "clean marketing analytics charts, campaign boards, growth arrows",
    business: "modern workspace desk, strategy notes, professional planning board",
    technology: "circuit motifs, soft tech gradients, product UI shapes",
    programming: "code editor glow, abstract code blocks, developer tools silhouette",
    coding: "code editor glow, abstract code blocks, developer tools silhouette",
    data: "bar charts, dashboards, clean data visualization shapes",
    analytics: "bar charts, dashboards, clean data visualization shapes",
    design: "layout grids, color swatches, typography specimens",
    ai: "neural network nodes, soft geometric AI motifs",
    mathematics: "geometric constructions, chalk-like math diagrams, clean vectors",
    math: "geometric constructions, chalk-like math diagrams, clean vectors",
    finance: "subtle ledger lines, upward finance curves, professional navy accents",
    career: "pathway milestones, professional growth symbols",
    productivity: "organized checklist blocks, calendar tiles, focus motifs",
  };

  const lower = category.toLowerCase();
  let cue = "professional education symbols related to the topic";
  for (const [key, value] of Object.entries(categoryCue)) {
    if (lower.includes(key)) {
      cue = value;
      break;
    }
  }

  return [
    "Create a professional DigitalSkillX course cover image for a free learning library card.",
    `Course title concept: ${title}.`,
    `Category: ${category}. Difficulty: ${difficulty}.`,
    blurb ? `Course focus: ${blurb}.` : "",
    objectives ? `Learning goals: ${objectives}.` : "",
    tags ? `Tags: ${tags}.` : "",
    `Visual direction: ${cue}.`,
    "Style: modern marketplace course thumbnail, crisp composition for 16:10 crop,",
    "flat-to-soft 3D illustration, strong focal subject, generous negative space,",
    "brand-safe red/charcoal/cream palette accents allowed but not purple neon glow.",
    "No readable paragraphs of text, no logos of other brands, no watermarks,",
    "no fake university seals, no photoreal celebrity faces, no YouTube UI chrome,",
    "no partnership badges, no stock-photo handshake clichés.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function categoryFallbackLabel(category: string | null | undefined): string {
  const value = String(category ?? "").trim();
  return value || "Free learning path";
}

/** Deterministic soft gradient classes for category covers (CSS only). */
export function categoryFallbackTone(category: string | null | undefined): {
  from: string;
  to: string;
  label: string;
} {
  const label = categoryFallbackLabel(category);
  const key = label.toLowerCase();
  if (/market|ads|social/.test(key)) return { from: "#7f1d1d", to: "#b91c1c", label };
  if (/program|code|tech|software/.test(key)) return { from: "#0f172a", to: "#1e3a5f", label };
  if (/data|analy/.test(key)) return { from: "#134e4a", to: "#0f766e", label };
  if (/math|algebra|calculus/.test(key)) return { from: "#312e81", to: "#4338ca", label };
  if (/ai|artificial/.test(key)) return { from: "#111827", to: "#4c1d95", label };
  if (/design|ui|ux/.test(key)) return { from: "#9a3412", to: "#c2410c", label };
  if (/finance|money/.test(key)) return { from: "#14532d", to: "#166534", label };
  if (/business|career/.test(key)) return { from: "#1f2937", to: "#374151", label };
  return { from: "#7f1d1d", to: "#991b1b", label };
}
