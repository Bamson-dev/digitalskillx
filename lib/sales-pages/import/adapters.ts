import { newSectionId, makeCtaSection, looksLikePurchaseCta, sanitizeCustomHtml } from "../schema";
import type { SalesPageSchema, SalesPageSection } from "../types";
import { emptySalesPageSchema } from "../types";

export type AdapterResult = {
  schema: SalesPageSchema;
  assetUrls: string[];
  unsupported: Array<{ type?: string; reason: string }>;
  ctaDetected: number;
  ctaConverted: number;
  videosDetected: number;
  testimonialsDetected: number;
  warnings: string[];
};

function collectUrlsFromString(text: string, into: Set<string>) {
  const re = /https?:\/\/[^\s"'<>)\\]+/gi;
  for (const match of text.match(re) ?? []) {
    const cleaned = match.replace(/[),.;]+$/, "");
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(cleaned) || cleaned.includes("/wp-content/uploads/")) {
      into.add(cleaned);
    }
  }
}

function walkCollectUrls(node: unknown, into: Set<string>) {
  if (!node) return;
  if (typeof node === "string") {
    collectUrlsFromString(node, into);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkCollectUrls(item, into);
    return;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) walkCollectUrls(v, into);
  }
}

function textFromSettings(settings: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["title", "editor", "description", "text", "caption", "heading_title"]) {
    const v = settings[key];
    if (typeof v === "string") parts.push(v);
  }
  return parts.join("\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function adaptDigitalSkillX(payload: unknown): AdapterResult {
  const obj = payload as SalesPageSchema;
  return {
    schema: {
      version: 1,
      sections: Array.isArray(obj.sections) ? obj.sections : [],
      settings: { showDynamicPrice: true, ...(obj.settings ?? {}) },
    },
    assetUrls: [],
    unsupported: [],
    ctaDetected: (obj.sections ?? []).filter((s) => s.type === "cta").length,
    ctaConverted: (obj.sections ?? []).filter((s) => s.type === "cta").length,
    videosDetected: (obj.sections ?? []).filter((s) => s.type === "video").length,
    testimonialsDetected: (obj.sections ?? []).filter((s) => s.type === "testimonials").length,
    warnings: [],
  };
}

export function adaptElementor(payload: unknown): AdapterResult {
  const root = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { content?: unknown }).content)
      ? (payload as { content: unknown[] }).content
      : null;
  if (!root) {
    return {
      schema: emptySalesPageSchema(),
      assetUrls: [],
      unsupported: [{ reason: "Elementor content array missing." }],
      ctaDetected: 0,
      ctaConverted: 0,
      videosDetected: 0,
      testimonialsDetected: 0,
      warnings: ["Could not find Elementor content nodes."],
    };
  }

  const sections: SalesPageSection[] = [];
  const unsupported: AdapterResult["unsupported"] = [];
  const assetUrls = new Set<string>();
  let ctaDetected = 0;
  let ctaConverted = 0;
  let videosDetected = 0;
  let testimonialsDetected = 0;
  const warnings: string[] = [];

  walkCollectUrls(root, assetUrls);

  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    const elType = String(n.elType ?? "");
    const widgetType = String(n.widgetType ?? "");
    const settings = (n.settings && typeof n.settings === "object" ? n.settings : {}) as Record<
      string,
      unknown
    >;

    if (elType === "widget") {
      if (widgetType === "heading" || widgetType === "theme-post-title") {
        const text = textFromSettings(settings);
        if (text) {
          sections.push({
            id: newSectionId(),
            type: sections.some((s) => s.type === "hero") ? "text" : "hero",
            ...(sections.some((s) => s.type === "hero")
              ? { title: text, body: "" }
              : { headline: text }),
          } as SalesPageSection);
        }
      } else if (widgetType === "text-editor" || widgetType === "theme-post-content") {
        const body = textFromSettings(settings);
        if (body) sections.push({ id: newSectionId(), type: "text", body });
      } else if (widgetType === "image") {
        const url =
          (settings.image as { url?: string } | undefined)?.url ||
          (typeof settings.url === "string" ? settings.url : "");
        if (url) assetUrls.add(url);
        sections.push({ id: newSectionId(), type: "image", alt: String(settings.caption ?? "") });
      } else if (widgetType === "button" || widgetType === "call-to-action") {
        const label = String(settings.text ?? settings.title ?? "Enroll now");
        ctaDetected += 1;
        if (looksLikePurchaseCta(label) || true) {
          // All Elementor buttons that look like CTAs become native purchase CTAs —
          // never preserve external payment hrefs.
          sections.push(makeCtaSection(label));
          ctaConverted += 1;
        }
      } else if (widgetType === "video" || widgetType === "youtube") {
        videosDetected += 1;
        const url = String(settings.youtube_url ?? settings.vimeo_url ?? settings.link ?? "");
        sections.push({
          id: newSectionId(),
          type: "video",
          url: url || undefined,
          provider: url.includes("vimeo") ? "vimeo" : url.includes("youtu") ? "youtube" : "unknown",
        });
      } else if (widgetType.includes("testimonial")) {
        testimonialsDetected += 1;
        const quote = textFromSettings(settings);
        sections.push({
          id: newSectionId(),
          type: "testimonials",
          items: [
            {
              name: String(settings.name ?? settings.author ?? "Student"),
              role: String(settings.title ?? settings.job ?? ""),
              quote,
            },
          ],
        });
      } else if (widgetType === "accordion" || widgetType === "toggle") {
        const tabs = Array.isArray(settings.tabs) ? settings.tabs : [];
        const items = tabs
          .map((t) => {
            const row = t as Record<string, unknown>;
            return {
              question: String(row.tab_title ?? row.title ?? "").replace(/<[^>]+>/g, ""),
              answer: String(row.tab_content ?? row.content ?? "").replace(/<[^>]+>/g, ""),
            };
          })
          .filter((i) => i.question);
        if (items.length) sections.push({ id: newSectionId(), type: "faq", items });
        else unsupported.push({ type: widgetType, reason: "Accordion had no readable items." });
      } else if (widgetType === "icon-list" || widgetType === "icon-box") {
        const itemsRaw = Array.isArray(settings.icon_list) ? settings.icon_list : [];
        const items = itemsRaw.map((it) => {
          const row = it as Record<string, unknown>;
          return {
            title: String(row.text ?? row.title ?? "").replace(/<[^>]+>/g, ""),
            body: String(row.description ?? ""),
          };
        });
        if (items.length) sections.push({ id: newSectionId(), type: "benefits", items });
        else {
          const single = textFromSettings(settings);
          if (single) sections.push({ id: newSectionId(), type: "benefits", items: [{ title: single }] });
        }
      } else if (widgetType === "html") {
        const html = sanitizeCustomHtml(String(settings.html ?? ""));
        if (html) {
          sections.push({ id: newSectionId(), type: "custom_html", html, advanced: true });
          warnings.push("Imported advanced custom HTML (sandboxed / sanitized).");
        }
      } else {
        unsupported.push({ type: widgetType || elType, reason: `Unsupported Elementor widget: ${widgetType || elType}` });
      }
    }

    const children = n.elements;
    if (Array.isArray(children)) for (const child of children) visit(child);
  }

  for (const node of root) visit(node);

  // Ensure pricing + curriculum dynamic sections exist once
  if (!sections.some((s) => s.type === "pricing")) {
    sections.push({ id: newSectionId(), type: "pricing" });
  }
  if (!sections.some((s) => s.type === "cta")) {
    sections.push(makeCtaSection("Enroll now"));
    ctaDetected += 1;
    ctaConverted += 1;
  }

  return {
    schema: { version: 1, sections, settings: { showDynamicPrice: true } },
    assetUrls: [...assetUrls],
    unsupported,
    ctaDetected,
    ctaConverted,
    videosDetected,
    testimonialsDetected,
    warnings,
  };
}

export function adaptGutenberg(payload: unknown): AdapterResult {
  const blocks: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { blocks?: unknown[] }).blocks)
      ? (payload as { blocks: unknown[] }).blocks
      : [];

  if (!blocks.length && typeof (payload as { content?: string }).content === "string") {
    const content = (payload as { content: string }).content;
    const sections: SalesPageSection[] = [];
    const assetUrls = new Set<string>();
    walkCollectUrls(content, assetUrls);
    const text = content.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) sections.push({ id: newSectionId(), type: "hero", headline: text.slice(0, 120), subheadline: text.slice(120, 400) });
    sections.push({ id: newSectionId(), type: "pricing" });
    sections.push(makeCtaSection("Enroll now"));
    return {
      schema: { version: 1, sections, settings: { showDynamicPrice: true } },
      assetUrls: [...assetUrls],
      unsupported: [{ reason: "Gutenberg HTML content was normalized to text; complex blocks may be incomplete." }],
      ctaDetected: 1,
      ctaConverted: 1,
      videosDetected: 0,
      testimonialsDetected: 0,
      warnings: ["Gutenberg string content path used — limited fidelity."],
    };
  }

  const sections: SalesPageSection[] = [];
  const unsupported: AdapterResult["unsupported"] = [];
  const assetUrls = new Set<string>();
  let ctaDetected = 0;
  let ctaConverted = 0;
  let videosDetected = 0;
  const warnings: string[] = [];
  walkCollectUrls(blocks, assetUrls);

  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const name = String(b.blockName ?? b.name ?? "");
    const attrs = (b.attrs && typeof b.attrs === "object" ? b.attrs : {}) as Record<string, unknown>;
    const innerHTML = String(b.innerHTML ?? "");
    const text = innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (name === "core/heading" || name === "core/post-title") {
      sections.push({
        id: newSectionId(),
        type: sections.some((s) => s.type === "hero") ? "text" : "hero",
        ...(sections.some((s) => s.type === "hero") ? { title: text, body: "" } : { headline: text }),
      } as SalesPageSection);
    } else if (name === "core/paragraph") {
      if (text) sections.push({ id: newSectionId(), type: "text", body: text });
    } else if (name === "core/image") {
      const url = String(attrs.url ?? "");
      if (url) assetUrls.add(url);
      sections.push({ id: newSectionId(), type: "image", alt: String(attrs.alt ?? "") });
    } else if (name === "core/button" || name === "core/buttons") {
      ctaDetected += 1;
      const label = text || String(attrs.text ?? "Enroll now");
      sections.push(makeCtaSection(label));
      ctaConverted += 1;
    } else if (name === "core/embed" || name === "core/video") {
      videosDetected += 1;
      const url = String(attrs.url ?? "");
      sections.push({
        id: newSectionId(),
        type: "video",
        url: url || undefined,
        provider: url.includes("youtu") ? "youtube" : url.includes("vimeo") ? "vimeo" : "unknown",
      });
    } else if (name === "core/list") {
      const items = text
        .split(/\n+/)
        .map((line) => line.replace(/^[\d.•*-]+\s*/, "").trim())
        .filter(Boolean)
        .map((title) => ({ title }));
      if (items.length) sections.push({ id: newSectionId(), type: "benefits", items });
    } else if (name) {
      unsupported.push({ type: name, reason: `Unsupported Gutenberg block: ${name}` });
    }
  }

  if (!sections.some((s) => s.type === "pricing")) sections.push({ id: newSectionId(), type: "pricing" });
  if (!sections.some((s) => s.type === "cta")) {
    sections.push(makeCtaSection("Enroll now"));
    ctaDetected += 1;
    ctaConverted += 1;
  }

  return {
    schema: { version: 1, sections, settings: { showDynamicPrice: true } },
    assetUrls: [...assetUrls],
    unsupported,
    ctaDetected,
    ctaConverted,
    videosDetected,
    testimonialsDetected: 0,
    warnings,
  };
}

export function adaptBricks(payload: unknown): AdapterResult {
  const content = Array.isArray((payload as { content?: unknown[] }).content)
    ? (payload as { content: unknown[] }).content
    : [];
  const sections: SalesPageSection[] = [];
  const unsupported: AdapterResult["unsupported"] = [];
  const assetUrls = new Set<string>();
  let ctaDetected = 0;
  let ctaConverted = 0;
  let videosDetected = 0;
  walkCollectUrls(content, assetUrls);

  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    const name = String(n.name ?? "");
    const settings = (n.settings && typeof n.settings === "object" ? n.settings : {}) as Record<
      string,
      unknown
    >;
    const text = String(settings.text ?? settings.title ?? settings.content ?? "").replace(/<[^>]+>/g, " ").trim();

    if (name === "heading" || name === "text-basic") {
      if (text) {
        sections.push({
          id: newSectionId(),
          type: sections.some((s) => s.type === "hero") ? "text" : "hero",
          ...(sections.some((s) => s.type === "hero") ? { title: text, body: "" } : { headline: text }),
        } as SalesPageSection);
      }
    } else if (name === "text" || name === "text-link") {
      if (text) sections.push({ id: newSectionId(), type: "text", body: text });
    } else if (name === "image") {
      const url = String((settings.image as { url?: string })?.url ?? settings.url ?? "");
      if (url) assetUrls.add(url);
      sections.push({ id: newSectionId(), type: "image" });
    } else if (name === "button") {
      ctaDetected += 1;
      sections.push(makeCtaSection(text || "Enroll now"));
      ctaConverted += 1;
    } else if (name === "video") {
      videosDetected += 1;
      sections.push({ id: newSectionId(), type: "video", url: String(settings.url ?? "") || undefined });
    } else if (name && !["section", "container", "div", "block"].includes(name)) {
      unsupported.push({ type: name, reason: `Unsupported Bricks element: ${name}` });
    }
    if (Array.isArray(n.children)) for (const c of n.children) visit(c);
  }

  for (const node of content) visit(node);
  if (!sections.some((s) => s.type === "pricing")) sections.push({ id: newSectionId(), type: "pricing" });
  if (!sections.some((s) => s.type === "cta")) {
    sections.push(makeCtaSection("Enroll now"));
    ctaDetected += 1;
    ctaConverted += 1;
  }

  return {
    schema: { version: 1, sections, settings: { showDynamicPrice: true } },
    assetUrls: [...assetUrls],
    unsupported,
    ctaDetected,
    ctaConverted,
    videosDetected,
    testimonialsDetected: 0,
    warnings: ["Bricks adapter is best-effort; complex elements may be reported as unsupported."],
  };
}

export function adaptGeneric(payload: unknown): AdapterResult {
  const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const sections: SalesPageSection[] = [];
  const assetUrls = new Set<string>();
  walkCollectUrls(obj, assetUrls);
  const title = String(obj.title ?? "Sales page");
  const content = String(obj.content ?? obj.description ?? "").replace(/<[^>]+>/g, " ").trim();
  sections.push({ id: newSectionId(), type: "hero", headline: title, subheadline: content.slice(0, 280) });
  if (content.length > 280) sections.push({ id: newSectionId(), type: "text", body: content });
  sections.push({ id: newSectionId(), type: "pricing" });
  sections.push(makeCtaSection("Enroll now"));
  return {
    schema: { version: 1, sections, settings: { showDynamicPrice: true } },
    assetUrls: [...assetUrls],
    unsupported: [],
    ctaDetected: 1,
    ctaConverted: 1,
    videosDetected: 0,
    testimonialsDetected: 0,
    warnings: ["Generic WordPress adapter used — limited structure fidelity."],
  };
}
