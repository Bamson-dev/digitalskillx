/**
 * Phase 5 — Customer + Business OS offline tests.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function load(rel) {
  return import(pathToFileURL(join(root, rel)).href);
}

async function main() {
  const segments = await load("lib/customer-segments-rules.ts");
  const def = segments.normalizeSegmentDefinition({
    logic: "and",
    rules: [
      { field: "total_spent_ngn", op: "gte", value: 100000 },
      { field: "inactive_days", op: "gte", value: 14 },
    ],
  });
  assert.equal(def.logic, "and");
  assert.equal(def.rules.length, 2);

  const match = segments.evaluateSegment(def, {
    purchaseCount: 2,
    totalSpentNgn: 150000,
    tags: ["High Value"],
    lastActiveAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    enrolledCourseIds: new Set(["c1"]),
    completedCourseIds: new Set(),
    purchasedCourseIds: new Set(["c1"]),
    hasCertificate: false,
  });
  assert.equal(match, true);

  const noMatch = segments.evaluateSegment(def, {
    purchaseCount: 0,
    totalSpentNgn: 5000,
    tags: [],
    lastActiveAt: new Date().toISOString(),
    enrolledCourseIds: new Set(),
    completedCourseIds: new Set(),
    purchasedCourseIds: new Set(),
    hasCertificate: false,
  });
  assert.equal(noMatch, false);

  const orDef = segments.normalizeSegmentDefinition({
    logic: "or",
    rules: [
      { field: "has_tag", op: "eq", value: "VIP" },
      { field: "purchase_count", op: "gte", value: 2 },
    ],
  });
  assert.equal(
    segments.evaluateSegment(orDef, {
      purchaseCount: 0,
      totalSpentNgn: 0,
      tags: ["VIP"],
      lastActiveAt: null,
      enrolledCourseIds: new Set(),
      completedCourseIds: new Set(),
      purchasedCourseIds: new Set(),
      hasCertificate: false,
    }),
    true,
  );
  console.log("PASS: phase5 segment rules");

  const crmSrc = readFileSync(join(root, "lib/customer-crm.ts"), "utf8");
  assert.ok(crmSrc.includes("export async function searchCustomers"));
  assert.ok(crmSrc.includes("export async function getCustomerTimeline"));
  assert.ok(crmSrc.includes("export async function getCustomerValue"));
  console.log("PASS: phase5 customer CRM exports");

  const bizSrc = readFileSync(join(root, "lib/business-analytics.ts"), "utf8");
  assert.ok(bizSrc.includes("export async function getBusinessOverview"));
  console.log("PASS: phase5 business analytics export");

  const bundlesSrc = readFileSync(join(root, "lib/course-bundles.ts"), "utf8");
  assert.ok(bundlesSrc.includes("export async function saveCourseBundle"));
  assert.ok(bundlesSrc.includes("export async function enrollStudentInBundle"));
  console.log("PASS: phase5 bundles exports");

  const tagsSrc = readFileSync(join(root, "lib/tag-catalog.ts"), "utf8");
  assert.ok(tagsSrc.includes("export async function upsertTagCatalog"));
  console.log("PASS: phase5 tag catalog exports");

  const sidebar = readFileSync(join(root, "components/admin/admin-sidebar.tsx"), "utf8");
  assert.ok(!/affiliate/i.test(sidebar));
  assert.ok(sidebar.includes("/admin/business"));
  assert.ok(sidebar.includes("/admin/segments"));
  assert.ok(sidebar.includes("/admin/bundles"));
  console.log("PASS: phase5 nav has business OS, no affiliate");

  console.log("\nAll Phase 5 Customer + Business OS offline tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
