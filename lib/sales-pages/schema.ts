import type {
  PublishValidationIssue,
  SalesPageSchema,
  SalesPageSection,
  SalesPageSectionType,
} from "./types";
import { emptySalesPageSchema } from "./types";

const KNOWN_TYPES = new Set<SalesPageSectionType>([
  "hero",
  "intro",
  "problem",
  "text",
  "image",
  "image_text",
  "video",
  "benefits",
  "features",
  "learning_outcomes",
  "testimonials",
  "testimonial_grid",
  "proof",
  "social_proof",
  "bonuses",
  "pricing",
  "faq",
  "instructor",
  "curriculum",
  "course_preview",
  "comparison",
  "guarantee",
  "cta",
  "countdown",
  "spacer",
  "lead_capture",
  "custom_html",
  "unsupported",
]);

/** Works in browser + Node (avoids node:crypto in client bundles). */
export function newSectionId(): string {
  return globalThis.crypto.randomUUID();
}

/** Strip scripts and event handlers from advanced custom HTML (best-effort). */
export function sanitizeCustomHtml(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "")
    .slice(0, 50_000);
}

export function makeCtaSection(label = "Enroll now"): SalesPageSection {
  return {
    id: newSectionId(),
    type: "cta",
    label: String(label || "Enroll now").slice(0, 80),
    behavior: "purchase",
  };
}

export function createDefaultSection(type: SalesPageSectionType): SalesPageSection {
  const id = newSectionId();
  switch (type) {
    case "hero":
      return {
        id,
        type: "hero",
        headline: "Your headline",
        subheadline: "Supporting sentence",
        ctaLabel: "Enroll now",
        mediaType: "image",
        alignment: "left",
      };
    case "intro":
      return { id, type: "intro", title: "Introduction", body: "" };
    case "problem":
      return { id, type: "problem", title: "The challenge", body: "" };
    case "text":
      return { id, type: "text", title: "", body: "" };
    case "image":
      return { id, type: "image", alt: "" };
    case "image_text":
      return { id, type: "image_text", title: "", body: "", imagePosition: "left" };
    case "video":
      return { id, type: "video", provider: "youtube" };
    case "benefits":
    case "features":
    case "bonuses":
      return { id, type, title: type[0]!.toUpperCase() + type.slice(1), items: [{ title: "", body: "" }] };
    case "learning_outcomes":
    case "instructor":
    case "curriculum":
    case "course_preview":
      return { id, type };
    case "pricing":
      return { id, type: "pricing", paymentDescription: "One-time · Lifetime access" };
    case "testimonials":
    case "testimonial_grid":
      return { id, type, title: "What students say", items: [{ name: "", quote: "" }] };
    case "proof":
    case "social_proof":
      return { id, type, title: type === "proof" ? "Results" : "Trusted by learners", items: [{ title: "", value: "" }] };
    case "faq":
      return { id, type: "faq", title: "FAQ", items: [{ question: "", answer: "" }] };
    case "comparison":
      return {
        id,
        type: "comparison",
        title: "Compare",
        columns: ["Feature", "This course", "Typical alternative"],
        rows: [{ feature: "", values: ["", ""] }],
      };
    case "guarantee":
      return { id, type: "guarantee", title: "Guarantee", body: "" };
    case "cta":
      return makeCtaSection();
    case "countdown":
      return { id, type: "countdown", label: "Offer ends" };
    case "spacer":
      return { id, type: "spacer", size: "md" };
    case "lead_capture":
      return {
        id,
        type: "lead_capture",
        title: "Get the syllabus",
        body: "Enter your email and we’ll send details.",
        buttonLabel: "Send me details",
        consentText: "I agree to receive course information from DigitalSkillX.",
      };
    case "custom_html":
      return { id, type: "custom_html", html: "", advanced: true };
    case "unsupported":
    default:
      return { id, type: "unsupported", reason: "Unknown section type." };
  }
}

function normalizeOneSection(raw: unknown): SalesPageSection | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const type = String(s.type ?? "");
  const id = typeof s.id === "string" && s.id ? s.id : newSectionId();
  const hidden = Boolean(s.hidden);

  if (!KNOWN_TYPES.has(type as SalesPageSectionType) || type === "unsupported") {
    if (type && type !== "unsupported") {
      return {
        id,
        type: "unsupported",
        hidden,
        reason: `Unsupported section type: ${type}`,
        sourceHint: type,
      };
    }
    if (type === "unsupported") {
      return {
        id,
        type: "unsupported",
        hidden,
        reason: String(s.reason ?? "Unsupported content."),
        sourceHint: typeof s.sourceHint === "string" ? s.sourceHint : undefined,
      };
    }
    return null;
  }

  const base = { id, hidden: hidden || undefined };

  if (type === "cta") {
    return {
      ...base,
      type: "cta",
      label: String(s.label ?? "Enroll now").slice(0, 80),
      behavior: "purchase",
    };
  }

  if (type === "custom_html") {
    return {
      ...base,
      type: "custom_html",
      html: sanitizeCustomHtml(String(s.html ?? "")),
      advanced: true,
    };
  }

  // Preserve known section payloads; coerce CTA behavior if ever present incorrectly
  const section = { ...s, ...base, type } as SalesPageSection;
  return section;
}

export function normalizeSalesPageSchema(raw: unknown): SalesPageSchema {
  if (!raw || typeof raw !== "object") return emptySalesPageSchema();
  const obj = raw as Record<string, unknown>;
  const sections: SalesPageSection[] = [];
  if (Array.isArray(obj.sections)) {
    for (const item of obj.sections) {
      const normalized = normalizeOneSection(item);
      if (normalized) sections.push(normalized);
    }
  }
  const settingsRaw =
    typeof obj.settings === "object" && obj.settings ? (obj.settings as Record<string, unknown>) : {};
  const offerRaw =
    typeof settingsRaw.offer === "object" && settingsRaw.offer
      ? (settingsRaw.offer as Record<string, unknown>)
      : null;
  return {
    version: 1,
    sections,
    settings: {
      showDynamicPrice: settingsRaw.showDynamicPrice === false ? false : true,
      theme: typeof settingsRaw.theme === "string" ? settingsRaw.theme : undefined,
      defaultAlignment:
        settingsRaw.defaultAlignment === "center" || settingsRaw.defaultAlignment === "left"
          ? settingsRaw.defaultAlignment
          : undefined,
      offer: offerRaw
        ? {
            headline: typeof offerRaw.headline === "string" ? offerRaw.headline.slice(0, 200) : undefined,
            description:
              typeof offerRaw.description === "string" ? offerRaw.description.slice(0, 2000) : undefined,
            urgencyMessage:
              typeof offerRaw.urgencyMessage === "string"
                ? offerRaw.urgencyMessage.slice(0, 300)
                : undefined,
            guarantee:
              typeof offerRaw.guarantee === "string" ? offerRaw.guarantee.slice(0, 1000) : undefined,
            ctaLabel: typeof offerRaw.ctaLabel === "string" ? offerRaw.ctaLabel.slice(0, 80) : undefined,
            status:
              offerRaw.status === "draft" ||
              offerRaw.status === "active" ||
              offerRaw.status === "paused"
                ? offerRaw.status
                : "draft",
            bonuses: Array.isArray(offerRaw.bonuses)
              ? offerRaw.bonuses.slice(0, 12).map((b) => {
                  const item = b && typeof b === "object" ? (b as Record<string, unknown>) : {};
                  return {
                    title: typeof item.title === "string" ? item.title.slice(0, 160) : undefined,
                    body: typeof item.body === "string" ? item.body.slice(0, 1000) : undefined,
                  };
                })
              : undefined,
          }
        : undefined,
    },
  };
}

export function visibleSections(schema: SalesPageSchema): SalesPageSection[] {
  return schema.sections.filter((s) => !s.hidden && s.type !== "unsupported");
}

export function validateSalesPageForPublish(schema: SalesPageSchema): PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];
  const visible = visibleSections(schema);
  if (!visible.length) {
    issues.push({
      code: "EMPTY",
      message: "Add at least one visible section before publishing.",
    });
  }
  const hasCta = visible.some((s) => s.type === "cta" && s.behavior === "purchase");
  if (!hasCta) {
    issues.push({
      code: "CTA_REQUIRED",
      message: "Add a visible DigitalSkillX purchase CTA before publishing.",
    });
  }
  for (const s of schema.sections) {
    if (s.type === "cta" && (s as { behavior?: string }).behavior !== "purchase") {
      issues.push({
        code: "CTA_INVALID",
        message: "Purchase CTAs must use DigitalSkillX checkout only.",
      });
    }
  }
  return issues;
}

/** Detect purchase-like button labels from imported content. */
export function looksLikePurchaseCta(text: string): boolean {
  const t = String(text ?? "").toLowerCase();
  return (
    /buy|enroll|get access|get instant|start learning|purchase|join now|add to cart|checkout|order now/.test(
      t,
    ) ||
    t.includes("₦") ||
    t.includes("ngn")
  );
}
