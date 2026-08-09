#!/usr/bin/env node
/** Phase 2 Sales Page offline certification tests. */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function load(rel) {
  return import(pathToFileURL(join(root, rel)).href);
}

console.log("\nSales Page Phase 2 tests\n");

{
  const {
    normalizeSalesPageSchema,
    sanitizeCustomHtml,
    validateSalesPageForPublish,
    createDefaultSection,
    visibleSections,
  } = await load("lib/sales-pages/schema.ts");
  const { SECTION_LIBRARY } = await load("lib/sales-pages/types.ts");

  assert.ok(SECTION_LIBRARY.length >= 20);

  const dirty = normalizeSalesPageSchema({
    version: 1,
    sections: [
      { id: "1", type: "custom_html", html: '<script>alert(1)</script><p>Hi</p>', advanced: true },
      { id: "2", type: "weird_widget", foo: 1 },
      { id: "3", type: "cta", label: "Buy", behavior: "external" },
      { id: "4", type: "hero", headline: "H", hidden: true },
      { id: "5", type: "cta", label: "Enroll", behavior: "purchase" },
    ],
  });
  const htmlSec = dirty.sections.find((s) => s.type === "custom_html");
  assert.ok(htmlSec && !String(htmlSec.html).includes("script"));
  assert.ok(dirty.sections.some((s) => s.type === "unsupported"));
  const cta = dirty.sections.find((s) => s.type === "cta" && s.label === "Buy");
  assert.equal(cta?.behavior, "purchase");

  const issuesEmpty = validateSalesPageForPublish(normalizeSalesPageSchema({ sections: [] }));
  assert.ok(issuesEmpty.some((i) => i.code === "EMPTY"));

  const onlyHidden = normalizeSalesPageSchema({
    sections: [
      { id: "a", type: "cta", label: "X", behavior: "purchase", hidden: true },
      { id: "b", type: "text", title: "T", hidden: true },
    ],
  });
  assert.equal(visibleSections(onlyHidden).length, 0);
  assert.ok(validateSalesPageForPublish(onlyHidden).some((i) => i.code === "CTA_REQUIRED" || i.code === "EMPTY"));

  const ok = normalizeSalesPageSchema({
    sections: [
      createDefaultSection("hero"),
      createDefaultSection("cta"),
    ],
  });
  assert.equal(validateSalesPageForPublish(ok).length, 0);

  assert.equal(sanitizeCustomHtml('<img src=x onerror=alert(1)>').toLowerCase().includes("onerror"), false);
  console.log("PASS: phase2 normalize / sanitize / publish validation / library");
}

console.log("\nAll Sales Page Phase 2 offline tests passed.\n");
