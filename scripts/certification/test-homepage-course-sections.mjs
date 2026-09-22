#!/usr/bin/env node
/**
 * Homepage free/paid catalog partition guards.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const home = read("app/(marketplace)/page.tsx");
assert.match(home, /Learn for free/);
assert.match(home, /Premium courses/);
assert.match(home, /#free-courses|browse\?price=free/);
assert.match(home, /partitionHomepageCatalog/);
assert.match(home, /Start learning free/);
assert.match(home, /HOME_CATALOG_TIMEOUT_MS/);
assert.match(home, /Promise\.all\(\[/);
assert.doesNotMatch(home, /₦49,?999/);
// Catalog must not share one timeout with trust stats
assert.doesNotMatch(
  home,
  /withTimeout\(\s*Promise\.all\(\[\s*getCachedPublishedCatalog/,
);

const browse = read("app/(marketplace)/browse/page.tsx");
assert.match(browse, /initialPrice/);
assert.match(browse, /price === "free"/);
assert.match(browse, /BROWSE_CATALOG_TIMEOUT_MS/);

const catalogLib = read("lib/homepage-catalog.ts");
assert.match(catalogLib, /isCatalogCourseFree/);
assert.match(catalogLib, /freePreview/);
assert.match(catalogLib, /paidPreview/);

const currency = read("lib/currency.ts");
assert.match(currency, /export function isCatalogCourseFree/);

const card = read("components/marketplace/course-card.tsx");
assert.match(card, /isCatalogCourseFree/);
assert.match(card, /Enroll free/);
assert.match(card, /aspect="video"/);

const media = read("components/marketplace/course-media-image.tsx");
assert.match(media, /object-cover/);
assert.match(media, /aspect-video/);

const published = read("lib/published-courses.ts");
assert.match(published, /CATALOG_SELECT_NO_CATEGORY/);

console.log("PASS — homepage free/paid course presentation guards");
