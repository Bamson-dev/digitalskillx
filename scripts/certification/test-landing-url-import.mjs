#!/usr/bin/env node
/**
 * Offline Stage 11 URL landing-page importer tests — no live network, no DB writes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = (rel) => pathToFileURL(join(root, rel)).href;

let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`PASS: ${label}`);
}

const { validatePublicHttpUrl, normalizeSourceUrl, isPrivateIp } = await import(
  ts("lib/landing-import/ssrf.ts")
);
const { assertLandingSlug, isReservedLandingSlug } = await import(
  ts("lib/landing-import/reserved-slugs.ts")
);
const {
  sanitizeLandingHtml,
  collectAssetUrls,
  absolutizeRelativeUrls,
  extractDocumentTitle,
} = await import(ts("lib/landing-import/sanitize.ts"));
const {
  classifyCta,
  detectAnchorCtas,
  applyCtaRewrites,
  resolveDestinationUrl,
  isAllowedRewriteDestination,
} = await import(ts("lib/landing-import/cta.ts"));

assert.equal(validatePublicHttpUrl("not-a-url").ok, false);
assert.equal(validatePublicHttpUrl("ftp://example.com").ok, false);
assert.equal(validatePublicHttpUrl("http://localhost/x").ok, false);
assert.equal(validatePublicHttpUrl("http://127.0.0.1/x").ok, false);
assert.equal(validatePublicHttpUrl("http://10.0.0.5/x").ok, false);
assert.equal(validatePublicHttpUrl("http://192.168.1.1/x").ok, false);
assert.equal(validatePublicHttpUrl("http://169.254.169.254/latest").ok, false);
assert.equal(validatePublicHttpUrl("http://[::1]/x").ok, false);
assert.equal(validatePublicHttpUrl("http://[::ffff:127.0.0.1]/x").ok, false);
assert.equal(validatePublicHttpUrl("http://user:pass@example.com/x").ok, false);
assert.equal(validatePublicHttpUrl("https://example.com/offer").ok, true);
assert.equal(isPrivateIp("::ffff:127.0.0.1"), true);
assert.equal(isPrivateIp("::ffff:7f00:1"), true);
assert.equal(isPrivateIp("100.64.1.1"), true);
assert.equal(isPrivateIp("8.8.8.8"), false);
ok("rejects malformed, credentialed, localhost, and private IP URLs");

assert.equal(isReservedLandingSlug("admin"), true);
assert.equal(isReservedLandingSlug("learn"), true);
assert.equal(isReservedLandingSlug("p"), true);
assert.equal(assertLandingSlug("Buy Now!!").ok, true);
assert.equal(assertLandingSlug("Buy Now!!").slug, "buy-now");
assert.equal(assertLandingSlug("login").ok, false);
ok("slug normalization and reserved-slug checks work");

const dirty = `<html><head><title>Offer</title><script>alert(1)</script></head><body>
<a href="javascript:alert(1)">x</a>
<img src="/hero.png" onerror="alert(1)"/>
<p onclick="evil()">Hi</p>
</body></html>`;
const clean = sanitizeLandingHtml(dirty);
assert.doesNotMatch(clean, /<script/i);
assert.doesNotMatch(clean, /onerror=/i);
assert.doesNotMatch(clean, /onclick=/i);
assert.doesNotMatch(clean, /javascript:/i);
assert.equal(extractDocumentTitle(dirty), "Offer");
ok("HTML sanitization strips scripts and event handlers");

const abs = absolutizeRelativeUrls(`<img src="/a.png"><a href="buy">Buy</a>`, "https://ex.com/path/");
assert.match(abs, /https:\/\/ex\.com\/a\.png/);
assert.match(abs, /https:\/\/ex\.com\/path\/buy/);
const assets = collectAssetUrls(abs, "https://ex.com/");
assert.ok(assets.some((u) => u.includes("a.png")));
ok("relative asset URLs are absolutized and collected");

for (const label of ["Buy Now", "Get Started", "Enroll Now", "Register", "Order Now"]) {
  assert.equal(classifyCta(label, "https://x.com/pay"), "conversion", label);
}
assert.equal(classifyCta("Home", "https://x.com/"), "navigation");
assert.equal(classifyCta("Privacy Policy", "https://x.com/privacy"), "navigation");
assert.equal(classifyCta("Follow us", "https://twitter.com/x"), "navigation");
assert.equal(classifyCta("See details", "https://x.com/docs/guide"), "unknown");
ok("CTA labels Buy/Get Started/Enroll/Register/Order map to conversion; nav/social stay navigation");

const site = "https://www.digitalskillx.com";
const courseId = "11111111-1111-4111-8111-111111111111";
const html = `<a href="https://old.com/checkout">Buy now</a><a href="/about">About</a><a href="https://facebook.com/x">Facebook</a>`;
const ctas = detectAnchorCtas(html);
assert.equal(ctas.length, 3);
const buy = ctas.find((c) => c.text === "Buy now");
assert.ok(buy);
assert.equal(buy.rewrite, true);
buy.mappedHref = `${site}/course/${courseId}`;
const rewritten = applyCtaRewrites(html, ctas, null, site);
assert.match(rewritten, /www\.digitalskillx\.com\/course\/11111111/);
assert.match(rewritten, /href="\/about"/);
assert.match(rewritten, /facebook\.com\/x/);
assert.match(rewritten, />Buy now</);
const blocked = applyCtaRewrites(html, [{ ...buy, mappedHref: "https://evil.com/phish" }], null, site);
assert.doesNotMatch(blocked, /evil\.com/);
ok("CTA rewrite preserves text, keeps nav/social, blocks external rewrite destinations");

assert.equal(
  resolveDestinationUrl({
    destinationType: "course_checkout",
    courseId,
    siteOrigin: site,
  }),
  `${site}/course/${courseId}`,
);
assert.equal(
  resolveDestinationUrl({
    destinationType: "course_checkout",
    courseId: "not-a-uuid",
    siteOrigin: site,
  }),
  null,
);
assert.equal(
  resolveDestinationUrl({
    destinationType: "internal_url",
    destinationUrl: "https://evil.com/x",
    siteOrigin: site,
  }),
  null,
);
assert.equal(
  resolveDestinationUrl({
    destinationType: "product_checkout",
    destinationUrl: "https://evil.com/pay",
    siteOrigin: site,
  }),
  null,
);
assert.equal(
  isAllowedRewriteDestination("https://evil.com/x", site),
  false,
);
assert.equal(
  isAllowedRewriteDestination(`${site}/course/${courseId}`, site),
  true,
);
ok("destination resolver only allows same-origin DigitalSkillX destinations");

assert.equal(normalizeSourceUrl("https://Example.com/Offer/"), "https://example.com/offer");
ok("source URL normalization is stable");

{
  const panel = readFileSync(join(root, "components/admin/course-sales-page-panel.tsx"), "utf8");
  const jsonRoute = readFileSync(
    join(root, "app/api/admin/sales-pages/[courseId]/import/json/route.ts"),
    "utf8",
  );
  const zipRoute = readFileSync(
    join(root, "app/api/admin/sales-pages/[courseId]/import/zip/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(panel, /Import JSON/);
  assert.doesNotMatch(panel, /Import ZIP/);
  assert.match(panel, /Landing imports/);
  assert.match(jsonRoute, /410/);
  assert.match(zipRoute, /410/);
  ok("obsolete JSON/ZIP import UI is removed and APIs return 410");
}

{
  const mig = readFileSync(join(root, "supabase/migrations/0047_imported_landing_pages.sql"), "utf8");
  const pub = readFileSync(join(root, "app/p/[slug]/page.tsx"), "utf8");
  const admin = readFileSync(join(root, "app/(admin)/admin/(panel)/landing-pages/page.tsx"), "utf8");
  const importRoute = readFileSync(join(root, "app/api/admin/landing-pages/route.ts"), "utf8");
  const patchRoute = readFileSync(join(root, "app/api/admin/landing-pages/[id]/route.ts"), "utf8");
  const assetRoute = readFileSync(
    join(root, "app/api/landing-assets/[pageId]/[filename]/route.ts"),
    "utf8",
  );
  const middleware = readFileSync(join(root, "lib/supabase/middleware.ts"), "utf8");
  assert.match(mig, /imported_landing_pages/);
  assert.match(mig, /row level security/);
  assert.match(mig, /status = 'published'/);
  assert.match(pub, /sandbox=/);
  assert.match(pub, /status", "published"/);
  assert.match(admin, /LandingPagesPanel/);
  assert.match(importRoute, /rateLimitedResponse/);
  assert.match(importRoute, /admin-landing-url-import/);
  assert.match(patchRoute, /rateLimitedResponse/);
  assert.match(assetRoute, /requireAdminApiAuth/);
  assert.match(assetRoute, /status !== "published"/);
  assert.match(middleware, /"\/p"/);
  ok("URL importer migration, rate limits, public /p, and draft asset auth exist");
}

console.log(`\nLanding URL import: ${passed} passed`);
