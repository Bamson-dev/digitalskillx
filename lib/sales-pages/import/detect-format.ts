export type WordPressFormat =
  | "elementor"
  | "gutenberg"
  | "bricks"
  | "generic"
  | "digitalskillx"
  | "unsupported";

export function detectWordPressFormat(payload: unknown): WordPressFormat {
  if (!payload || typeof payload !== "object") return "unsupported";
  const obj = payload as Record<string, unknown>;

  // Native DigitalSkillX schema
  if (obj.version === 1 && Array.isArray(obj.sections)) {
    return "digitalskillx";
  }

  // Elementor export shapes
  if (
    obj.type === "elementor" ||
    obj.version === "0.4" ||
    (Array.isArray(obj.content) &&
      obj.content.some(
        (n) =>
          n &&
          typeof n === "object" &&
          ("elType" in (n as object) || "widgetType" in (n as object)),
      ))
  ) {
    return "elementor";
  }
  if (Array.isArray(payload) && payload.some((n) => n && typeof n === "object" && "elType" in n)) {
    return "elementor";
  }

  // Gutenberg block JSON
  if (
    Array.isArray(obj.blocks) ||
    (typeof obj.content === "string" && obj.content.includes("<!-- wp:")) ||
    (Array.isArray(obj) &&
      (payload as unknown[]).some(
        (b) => b && typeof b === "object" && ("blockName" in (b as object) || "name" in (b as object)),
      ))
  ) {
    if (Array.isArray(obj.blocks) || (typeof obj.content === "string" && obj.content.includes("<!-- wp:"))) {
      return "gutenberg";
    }
  }
  if (
    Array.isArray(payload) &&
    (payload as unknown[]).every(
      (b) => !b || (typeof b === "object" && ("blockName" in (b as object) || "name" in (b as object))),
    ) &&
    (payload as unknown[]).some((b) => b && typeof b === "object" && "blockName" in (b as object))
  ) {
    return "gutenberg";
  }

  // Bricks builder
  if (
    obj.generator === "bricks" ||
    (Array.isArray(obj.content) &&
      obj.content.some(
        (n) => n && typeof n === "object" && "name" in (n as object) && "id" in (n as object) && "settings" in (n as object),
      ) &&
      !obj.content.some((n) => n && typeof n === "object" && "elType" in (n as object)))
  ) {
    return "bricks";
  }

  // Generic: title + content string, or sections-like
  if (typeof obj.title === "string" && (typeof obj.content === "string" || Array.isArray(obj.elements))) {
    return "generic";
  }
  if (Array.isArray(obj.elements) || Array.isArray(obj.widgets)) {
    return "generic";
  }

  return "unsupported";
}
