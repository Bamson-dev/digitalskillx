#!/usr/bin/env node
/**
 * Admin grants course on student detail page → student login → course visible.
 * Usage: node scripts/test-admin-grant-course.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
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

const testEmail = `grant-test+${Date.now()}@digitalskillx.com`;
const testPassword = `Test-${crypto.randomBytes(4).toString("hex")}!9`;
const testName = "Grant Course Test";

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

console.log("Testing admin grant course on", base);

const adminJar = join(mkdtempSync(join(tmpdir(), "admin-grant-")), "admin.txt");
curl([
  "-c",
  adminJar,
  "-b",
  adminJar,
  "-X",
  "POST",
  `${base}/api/auth/admin-login`,
  "-d",
  new URLSearchParams({ email: adminEmail, password: adminPassword }).toString(),
  "-o",
  "/dev/null",
]);

const studentsPage = curl(["-b", adminJar, `${base}/admin/students`]);
const actionIds = [...new Set([...studentsPage.matchAll(/"\$ACTION_ID_([0-9a-f]+)"/gi)].map((m) => m[1]))];
let createOk = false;
let studentId = null;

for (const actionId of actionIds) {
  const res = curl([
    "-b",
    adminJar,
    "-X",
    "POST",
    `${base}/admin/students`,
    "-H",
    "Accept: text/x-component",
    "-H",
    `Next-Action: ${actionId}`,
    "-F",
    `full_name=${testName}`,
    "-F",
    `email=${testEmail}`,
    "-F",
    `password=${testPassword}`,
  ]);
  if (/Student .* created\./i.test(res)) {
    createOk = true;
    const idMatch = res.match(/\/admin\/students\/([0-9a-f-]{36})/i);
    if (idMatch) studentId = idMatch[1];
    break;
  }
}

if (!createOk || !studentId) {
  console.error("FAIL: could not create test student");
  process.exit(1);
}
console.log("Created student:", studentId);

const detailPage = curl(["-b", adminJar, `${base}/admin/students/${studentId}`]);
const courseOptions = [
  ...detailPage.matchAll(/<option value="([0-9a-f-]{36})">([^<]+)<\/option>/gi),
].filter((m) => !m[2].includes("Select a course"));
if (courseOptions.length === 0) {
  console.error("FAIL: no courses on student detail page");
  process.exit(1);
}
const courseId = courseOptions[0][1];
console.log("Granting course:", courseId);

const grantRes = curl([
  "-b",
  adminJar,
  "-X",
  "POST",
  `${base}/admin/students/${studentId}`,
  "-d",
  new URLSearchParams({
    student_id: studentId,
    course_id: courseId,
  }).toString(),
  "-w",
  "\nHTTP:%{http_code}",
]);

const grantStatus = grantRes.match(/HTTP:(\d+)/)?.[1];
if (grantStatus !== "303" && grantStatus !== "302") {
  console.error("FAIL: grant access did not redirect, status", grantStatus);
  console.error(grantRes.slice(0, 500));
  process.exit(1);
}
if (!/enrolled=1/.test(grantRes)) {
  console.error("FAIL: grant redirect missing enrolled=1");
  process.exit(1);
}
console.log("PASS: admin granted course on detail page");

const detailAfter = curl(["-b", adminJar, `${base}/admin/students/${studentId}?enrolled=1`]);
if (!detailAfter.includes("Facebook Ad Mastery") && !detailAfter.includes(courseOptions[0][2].trim())) {
  const hasCourseRow = /Remove access/i.test(detailAfter);
  if (!hasCourseRow) {
    console.error("FAIL: admin detail does not show enrolled course");
    process.exit(1);
  }
}
console.log("PASS: admin detail lists enrolled course");

const studentJar = join(mkdtempSync(join(tmpdir(), "student-grant-")), "student.txt");
curl([
  "-c",
  studentJar,
  "-b",
  studentJar,
  "-X",
  "POST",
  `${base}/api/auth/login`,
  "-d",
  new URLSearchParams({ email: testEmail, password: testPassword, next: "/dashboard" }).toString(),
  "-o",
  "/dev/null",
]);

const dashboard = curl(["-b", studentJar, `${base}/dashboard`]);
const coursesPage = curl(["-b", studentJar, `${base}/courses`]);
if (/auth_error|Could not load your profile/i.test(dashboard)) {
  console.error("FAIL: student login failed");
  process.exit(1);
}

const hasCourse =
  dashboard.includes(`/courses/${courseId}`) || coursesPage.includes(`/courses/${courseId}`);
const empty = /You haven't purchased a course yet|No courses yet/i.test(dashboard + coursesPage);
if (!hasCourse || empty) {
  console.error("FAIL: granted course not visible to student after login");
  console.error(dashboard.slice(0, 900));
  process.exit(1);
}

console.log("PASS: student dashboard shows granted course");
console.log("=== ALL PASSED ===");
