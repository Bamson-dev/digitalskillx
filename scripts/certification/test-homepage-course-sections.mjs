#!/usr/bin/env node
/**
 * Homepage free programs + search guards.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const home = read("app/(marketplace)/page.tsx");
assert.match(home, /HomepageProgramSearch/);
assert.match(home, /getCachedHomepageFreeLibrary/);
assert.match(home, /Start learning free/);
assert.match(home, /partitionHomepageCatalog/);
assert.doesNotMatch(home, /₦49,?999/);

const catalogLib = read("lib/homepage-catalog.ts");
assert.match(catalogLib, /freePreview: free/);
assert.match(catalogLib, /HOMEPAGE_PAID_COURSE_LIMIT/);

const search = read("components/marketplace/homepage-program-search.tsx");
assert.match(search, /Search free programs/);
assert.match(search, /freeLibrary/);
assert.match(search, /\/learn\?q=/);

const currency = read("lib/currency.ts");
assert.match(currency, /export function isCatalogCourseFree/);

const cache = read("lib/content-factory/library-cache.ts");
assert.match(cache, /getCachedHomepageFreeLibrary/);

console.log("PASS — homepage free programs + search guards");
