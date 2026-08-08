import { randomUUID } from "node:crypto";
import type { SalesPageSchema, SalesPageSection } from "./types";
import { emptySalesPageSchema } from "./types";

export function newSectionId(): string {
  return randomUUID();
}

export function normalizeSalesPageSchema(raw: unknown): SalesPageSchema {
  if (!raw || typeof raw !== "object") return emptySalesPageSchema();
  const obj = raw as Record<string, unknown>;
  const sections = Array.isArray(obj.sections)
    ? (obj.sections as SalesPageSection[]).filter(
        (s) => s && typeof s === "object" && typeof s.type === "string",
      )
    : [];
  return {
    version: 1,
    sections,
    settings: {
      showDynamicPrice: true,
      ...(typeof obj.settings === "object" && obj.settings ? (obj.settings as object) : {}),
    },
  };
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

/** Detect purchase-like button labels from imported content. */
export function looksLikePurchaseCta(text: string): boolean {
  const t = String(text ?? "").toLowerCase();
  return (
    /buy|enroll|get access|get instant|start learning|purchase|join now|add to cart|checkout|order now/.test(
      t,
    ) || t.includes("₦") || t.includes("ngn")
  );
}
