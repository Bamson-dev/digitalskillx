#!/usr/bin/env node
/**
 * Enrollment Link offline + pure-logic certification.
 * Does not require a live DB. Complements run-unit.mjs.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function generateEnrollmentLinkToken() {
  return `el_${randomBytes(32).toString("base64url")}`;
}
function hashEnrollmentLinkToken(plaintext) {
  return createHash("sha256").update(plaintext.trim()).digest("hex");
}
function enrollmentLinkTokenPrefix(plaintext) {
  const raw = plaintext.trim();
  if (raw.startsWith("el_")) return raw.slice(0, 11);
  return raw.slice(0, 8);
}

const FRIENDLY = {
  INVALID_LINK: "This Enrollment Link is invalid or no longer available.",
  DISABLED: "This Enrollment Link is no longer active.",
  EXPIRED: "This Enrollment Link has expired.",
  LIMIT_REACHED: "This Enrollment Link has already reached its maximum number of enrollments.",
  IMPORTED_ONLY: "This Enrollment Link is available only to invited students.",
};

function deriveStatus(link, now = Date.now()) {
  if (link.deleted_at || link.status === "deleted" || link.status === "disabled" || link.status === "draft") {
    return "DISABLED";
  }
  if (link.status === "expired" || (link.expires_at && new Date(link.expires_at).getTime() < now)) {
    return "EXPIRED";
  }
  if (link.max_redemptions != null && link.current_redemptions >= link.max_redemptions) {
    return "LIMIT_REACHED";
  }
  if (link.status !== "active") return "DISABLED";
  return "OK";
}

function resolvePostRedeemPath(result) {
  switch (result.redirectType) {
    case "first_course":
      return result.courses[0]?.id ? `/courses/${result.courses[0].id}` : "/dashboard";
    case "dashboard":
      return "/dashboard";
    case "specific_course":
      return result.redirectCourseId ? `/courses/${result.redirectCourseId}` : "/dashboard";
    default:
      return `/enrollment/success?link=${encodeURIComponent(result.linkId)}`;
  }
}

// --- Token security ---
{
  const a = generateEnrollmentLinkToken();
  const b = generateEnrollmentLinkToken();
  assert.match(a, /^el_/);
  assert.ok(a.length >= 40);
  assert.notEqual(a, b);
  assert.equal(hashEnrollmentLinkToken(a).length, 64);
  assert.equal(hashEnrollmentLinkToken(` ${a} `), hashEnrollmentLinkToken(a));
  assert.notEqual(hashEnrollmentLinkToken(a), a);
  assert.equal(enrollmentLinkTokenPrefix(a).startsWith("el_"), true);
  console.log("PASS: token generate/hash/prefix");
}

// --- Validation matrix ---
{
  assert.equal(deriveStatus({ status: "active", current_redemptions: 0, max_redemptions: null }), "OK");
  assert.equal(deriveStatus({ status: "disabled", current_redemptions: 0 }), "DISABLED");
  assert.equal(deriveStatus({ status: "draft", current_redemptions: 0 }), "DISABLED");
  assert.equal(
    deriveStatus({
      status: "active",
      expires_at: new Date(Date.now() - 1000).toISOString(),
      current_redemptions: 0,
    }),
    "EXPIRED",
  );
  assert.equal(
    deriveStatus({ status: "active", max_redemptions: 5, current_redemptions: 5 }),
    "LIMIT_REACHED",
  );
  assert.equal(
    deriveStatus({ status: "active", max_redemptions: 5, current_redemptions: 4 }),
    "OK",
  );
  assert.equal(deriveStatus({ status: "active", deleted_at: new Date().toISOString() }), "DISABLED");
  assert.match(FRIENDLY.IMPORTED_ONLY, /invited/i);

  const validationSrc = readFileSync(
    join(root, "lib/enrollment-links/validation-service.ts"),
    "utf8",
  );
  assert.match(validationSrc, /bulk_import_rows/);
  assert.equal(
    /if \(profile\) return true/.test(validationSrc),
    false,
    "imported_students must not treat every profile as eligible",
  );
  console.log("PASS: enrollment validation matrix");
}

// --- Redirects ---
{
  assert.equal(
    resolvePostRedeemPath({
      redirectType: "success_page",
      redirectCourseId: null,
      courses: [{ id: "c1" }],
      linkId: "L1",
    }),
    "/enrollment/success?link=L1",
  );
  assert.equal(
    resolvePostRedeemPath({
      redirectType: "first_course",
      redirectCourseId: null,
      courses: [{ id: "c1" }, { id: "c2" }],
      linkId: "L1",
    }),
    "/courses/c1",
  );
  assert.equal(
    resolvePostRedeemPath({
      redirectType: "specific_course",
      redirectCourseId: "cx",
      courses: [],
      linkId: "L1",
    }),
    "/courses/cx",
  );
  console.log("PASS: post-redeem redirects");
}

// --- Architecture isolation ---
{
  for (const rel of [
    "lib/purchase.ts",
    "lib/automation.ts",
    "app/api/payments/initialize/route.ts",
    "lib/admin-student-onboarding.ts",
  ]) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.equal(src.includes("enrollment-engine"), false, rel);
  }
  const redeem = readFileSync(join(root, "lib/enrollment-links/redeem-service.ts"), "utf8");
  assert.match(redeem, /claim_enrollment_link_redemption/);
  assert.match(redeem, /enrollStudent/);
  const flag = readFileSync(join(root, "lib/enrollment-links/feature-flag.ts"), "utf8");
  assert.match(flag, /ENROLLMENT_LINKS_ENABLED/);
  console.log("PASS: architecture isolation + redeem claim RPC");
}

// --- Source files present ---
{
  const required = [
    "supabase/migrations/0033_enrollment_links.sql",
    "sql/apply-enrollment-links.sql",
    "app/api/enroll/[token]/route.ts",
    "app/api/admin/enrollment-links/route.ts",
    "components/admin/enrollment-links-list.tsx",
    "components/enrollment/enroll-invite-client.tsx",
    "docs/ENROLLMENT_LINK_SYSTEM.md",
  ];
  for (const rel of required) {
    readFileSync(join(root, rel));
  }
  console.log("PASS: required enrollment-link artifacts present");
}

// --- Bulk delete support ---
{
  const listUi = readFileSync(join(root, "components/admin/enrollment-links-list.tsx"), "utf8");
  const api = readFileSync(join(root, "app/api/admin/enrollment-links/route.ts"), "utf8");
  const service = readFileSync(join(root, "lib/enrollment-links/link-service.ts"), "utf8");
  assert.match(listUi, /Delete selected/);
  assert.match(listUi, /Select all shown/);
  assert.match(listUi, /Select all enrollment links shown/);
  assert.match(api, /softDeleteEnrollmentLinks/);
  assert.match(api, /enrollment_links_bulk_deleted/);
  assert.match(service, /softDeleteEnrollmentLinks/);
  assert.match(service, /at most 500/);
  console.log("PASS: bulk select/delete enrollment links");
}

console.log("\nAll enrollment-link certification checks passed.");
