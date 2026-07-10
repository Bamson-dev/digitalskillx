#!/usr/bin/env node
/**
 * Test CSV student import parsing + admin monitoring columns.
 * Usage: node scripts/test-csv-bulk-import.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");

function loadEnvFile(name) {
  const path = join(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.test");

const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
if (!adminPassword) {
  console.error("Set TEST_ADMIN_PASSWORD in .env.test");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

console.log("Testing CSV bulk import on", base);

const jar = join(mkdtempSync(join(tmpdir(), "csv-import-")), "admin.txt");
curl([
  "-c",
  jar,
  "-b",
  jar,
  "-X",
  "POST",
  `${base}/api/auth/admin-login`,
  "-d",
  new URLSearchParams({ email: adminEmail, password: adminPassword }).toString(),
  "-o",
  "/dev/null",
]);

const studentsPage = curl(["-b", jar, `${base}/admin/students`]);
const monitoringChecks = [
  ["Progress column", />Progress</i.test(studentsPage) || /Progress/i.test(studentsPage)],
  ["Last access column", /Last access/i.test(studentsPage)],
  ["Bulk CSV tab", /Bulk CSV/i.test(studentsPage)],
];

for (const [label, ok] of monitoringChecks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) process.exit(1);
}

let courseId;
const courseIdMatch = [
  ...studentsPage.matchAll(/name="default_course_id"[\s\S]*?<option value="([0-9a-f-]{36})">/gi),
][0];

if (courseIdMatch) {
  courseId = courseIdMatch[1];
} else {
  const coursesPage = curl(["-b", jar, `${base}/admin/courses`]);
  const fallback = coursesPage.match(/\/admin\/courses\/([0-9a-f-]{36})/i);
  if (!fallback) {
    console.error("FAIL: could not find course id on students page");
    process.exit(1);
  }
  courseId = fallback[1];
}

const testEmail = `csv-test+${Date.now()}@digitalskillx.com`;
const semicolonEmail = `csv-semi+${Date.now()}@digitalskillx.com`;

function runBulkImport(fields) {
  return curl(["-b", jar, "-X", "POST", `${base}/api/admin/bulk-students`, ...fields]);
}

function assertBulkSuccess(importRes, label) {
  let importOk = false;
  try {
    const json = JSON.parse(importRes);
    importOk =
      typeof json.message === "string" &&
      /Bulk upload finished/i.test(json.message) &&
      json.bulkSummary?.failed?.length === 0 &&
      (json.bulkSummary?.created >= 1 || json.bulkSummary?.enrolled >= 1);
    if (!importOk) {
      console.error(`FAIL: ${label}`, importRes.slice(0, 900));
    }
    return importOk;
  } catch {
    console.error(`FAIL: ${label} did not return JSON`);
    console.error(importRes.slice(0, 900));
    return false;
  }
}

const commaRes = runBulkImport([
  "-F",
  `default_course_id=${courseId}`,
  "-F",
  `csv=full_name,email\nCSV Test User,${testEmail}`,
]);

if (!assertBulkSuccess(commaRes, "comma CSV import")) {
  process.exit(1);
}
console.log("PASS: comma CSV bulk import succeeded for", testEmail);

const semicolonRes = runBulkImport([
  "-F",
  `default_course_id=${courseId}`,
  "-F",
  `csv=full_name;email\nCSV Semi User;${semicolonEmail}`,
]);

if (!assertBulkSuccess(semicolonRes, "semicolon CSV import")) {
  process.exit(1);
}
console.log("PASS: semicolon CSV bulk import succeeded for", semicolonEmail);

const updatedPage = curl(["-b", jar, `${base}/admin/students`]);
if (!updatedPage.toLowerCase().includes(testEmail.toLowerCase())) {
  console.error("FAIL: imported student not visible in list");
  process.exit(1);
}
console.log("PASS: imported student visible in admin list");

console.log("=== ALL PASSED ===");
