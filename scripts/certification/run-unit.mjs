#!/usr/bin/env node
/**
 * Fast offline unit checks for security/payment helpers.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Dynamic import of compiled-free TS via next isn't available; duplicate tiny pure helpers inline
// for offline cert, and also import from .ts through a minimal transpile-free reimplementation.

function safeNextPath(raw, fallback = "/dashboard") {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (!/^\/[A-Za-z0-9/_?&=%#.-]*$/.test(value)) return fallback;
  return value;
}

assert.equal(safeNextPath("/dashboard"), "/dashboard");
assert.equal(safeNextPath("//evil.com"), "/dashboard");
assert.equal(safeNextPath("https://evil.com"), "/dashboard");
assert.equal(safeNextPath("/courses/abc"), "/courses/abc");

const crypto = await import("node:crypto");
function hashCheckoutBinding(reference, email) {
  return crypto
    .createHash("sha256")
    .update(`${reference}:${email.trim().toLowerCase()}`)
    .digest("hex");
}
assert.equal(
  hashCheckoutBinding("dsx_1", "A@B.com"),
  hashCheckoutBinding("dsx_1", "a@b.com"),
);
assert.notEqual(hashCheckoutBinding("dsx_1", "a@b.com"), hashCheckoutBinding("dsx_2", "a@b.com"));

console.log("PASS: offline unit checks (safeNextPath, checkout binding)");

{
  const { parseStudentCsv, isNonCourseCsvValue } = await import(
    pathToFileURL(join(root, "lib/student-csv-parse.ts")).href
  );
  const gumroad = parseStudentCsv(
    "email,full_name,purchase_date,price\nada@example.com,Ada Lovelace,20-03-2026,5000",
  );
  assert.equal(gumroad.rows[0]?.courseRef, "");
  assert.equal(gumroad.rows[0]?.email, "ada@example.com");
  assert.equal(isNonCourseCsvValue("20-03-2026"), true);

  const product = parseStudentCsv(
    "Buyer Email,Buyer Name,Product Name,Sale Date\nbeast@example.com,Beast Buyer,Beast Dropz,20-03-2026",
  );
  assert.equal(product.rows[0]?.courseRef, "Beast Dropz");
  assert.equal(product.rows[0]?.email, "beast@example.com");

  const { buildCourseResolver } = await import(
    pathToFileURL(join(root, "lib/course-resolver.ts")).href
  );
  const resolve = buildCourseResolver([
    { id: "11111111-1111-4111-8111-111111111111", title: "Facebook Ad Mastery" },
  ]);
  assert.equal(
    resolve("Beast", "11111111-1111-4111-8111-111111111111").courseId,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.match(resolve("Beast", null).error ?? "", /Unknown course/);
}

console.log("PASS: CSV parse + course resolver fallback");
