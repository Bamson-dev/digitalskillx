/**
 * Sales Conversion Engine — Phase 3 offline tests.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function load(rel) {
  return import(pathToFileURL(join(root, rel)).href);
}

async function main() {
  const analytics = await load("lib/product-analytics.ts");
  assert.ok(analytics.PRODUCT_EVENT_NAMES.includes("sales_page_view"));
  assert.ok(analytics.PRODUCT_EVENT_NAMES.includes("sales_page_cta_click"));
  assert.ok(analytics.PRODUCT_EVENT_NAMES.includes("sales_page_checkout_start"));
  assert.ok(analytics.PRODUCT_EVENT_NAMES.includes("sales_page_purchase"));
  assert.ok(analytics.PRODUCT_EVENT_NAMES.includes("sales_page_lead_capture"));
  assert.ok(analytics.PRODUCT_EVENT_NAMES.includes("sales_page_scroll_depth"));
  assert.ok(analytics.PRODUCT_EVENT_NAMES.includes("sales_page_section_view"));
  assert.ok(analytics.PRODUCT_EVENT_NAMES.includes("product_recommendation_click"));
  assert.ok(analytics.PRODUCT_EVENT_NAMES.includes("upsell_click"));
  console.log("PASS: phase3 event allowlist");

  const attr = await load("lib/sales-attribution.ts");
  const meta = attr.attributionToMetadata(
    {
      session_id: "sess-1",
      sales_page_id: "sp-1",
      course_id: "c-1",
      utm_source: "facebook",
      utm_medium: "cpc",
      utm_campaign: "spring",
      device: "mobile",
    },
    { cta_id: "hero" },
  );
  assert.equal(meta.utm_source, "facebook");
  assert.equal(meta.cta_id, "hero");
  const pay = attr.attributionToPaystackStrings({
    session_id: "sess-1",
    utm_source: "google",
  });
  assert.equal(typeof pay.session_id, "string");
  assert.equal(pay.utm_source, "google");
  console.log("PASS: phase3 attribution helpers");

  const schema = await load("lib/sales-pages/schema.ts");
  const types = await load("lib/sales-pages/types.ts");
  const lead = schema.createDefaultSection("lead_capture");
  assert.equal(lead.type, "lead_capture");
  const normalized = schema.normalizeSalesPageSchema({
    sections: [{ type: "lead_capture", title: "Hi", body: "x" }],
    settings: {
      offer: {
        status: "active",
        headline: "Offer",
        bonuses: [{ title: "B1", body: "extra" }],
      },
    },
  });
  assert.equal(normalized.settings.offer?.status, "active");
  assert.equal(normalized.settings.offer?.bonuses?.[0]?.title, "B1");
  assert.ok(types.SECTION_LIBRARY.some((s) => s.type === "lead_capture"));
  console.log("PASS: phase3 offer + lead_capture schema");

  // CTA purchase-only still enforced
  const withBad = schema.normalizeSalesPageSchema({
    sections: [{ type: "cta", label: "Buy", behavior: "external" }],
  });
  assert.equal(withBad.sections[0].behavior, "purchase");
  console.log("PASS: phase3 CTA purchase-only invariant");

  console.log("\nAll Sales Conversion Phase 3 offline tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
