#!/usr/bin/env node
/**
 * End-to-end: admin creates student with course → student login → dashboard shows course.
 * Usage: node scripts/test-admin-student-enrollment.mjs [baseUrl]
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

const testEmail = `enroll-test+${Date.now()}@digitalskillx.com`;
const testPassword = `Test-${crypto.randomBytes(4).toString("hex")}!9`;
const testName = "Enrollment Test Student";

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function curlJson(args) {
  const out = curl(args);
  try {
    return JSON.parse(out);
  } catch {
    return { _raw: out };
  }
}

console.log("Testing admin student enrollment on", base);

const adminJar = join(mkdtempSync(join(tmpdir(), "admin-enroll-")), "admin.txt");
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
const courseMatch = [...studentsPage.matchAll(/type="hidden" name="course_ids" value="([0-9a-f-]{36})"/gi)][0];
if (!courseMatch) {
  console.error("FAIL: no course_ids hidden input on admin students page");
  process.exit(1);
}
const courseId = courseMatch[1];
console.log("Using course:", courseId);

const actionIds = [...new Set([...studentsPage.matchAll(/"\$ACTION_ID_([0-9a-f]+)"/gi)].map((m) => m[1]))];
let createOk = false;
let createResponse = "";

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
    `course_ids=${courseId}`,
    "-F",
    `password=${testPassword}`,
  ]);
  createResponse = res;
  if (/Student .* created\./i.test(res) && /Enrolled in \d+ course/i.test(res)) {
    createOk = true;
    break;
  }
  if (/Account was created but course access could not be saved/i.test(res)) {
    console.error("FAIL: enrollment verification failed on server");
    console.error(res.slice(0, 500));
    process.exit(1);
  }
}

if (!createOk) {
  console.error("FAIL: admin create student did not return success with enrollment");
  console.error(createResponse.slice(0, 700));
  process.exit(1);
}
console.log("PASS: admin created student with course enrollment");

const studentJar = join(mkdtempSync(join(tmpdir(), "student-enroll-")), "student.txt");
const loginRes = curlJson([
  "-c",
  studentJar,
  "-b",
  studentJar,
  "-X",
  "POST",
  `${base}/api/auth/login`,
  "-H",
  "Content-Type: application/json",
  "-d",
  JSON.stringify({ email: testEmail, password: testPassword }),
]);

if (loginRes.error) {
  console.error("FAIL: student login failed:", loginRes.error);
  process.exit(1);
}
console.log("PASS: student logged in");

const dashboard = curl(["-b", studentJar, `${base}/dashboard`]);
const coursesPage = curl(["-b", studentJar, `${base}/courses`]);

const hasCourseLink =
  dashboard.includes(`/courses/${courseId}`) || coursesPage.includes(`/courses/${courseId}`);
const emptyDashboard =
  /You haven't purchased a course yet|No courses yet/i.test(dashboard + coursesPage);

if (!hasCourseLink || emptyDashboard) {
  console.error("FAIL: enrolled course not visible after student login");
  console.error("Dashboard snippet:", dashboard.slice(0, 800));
  process.exit(1);
}

console.log("PASS: student dashboard lists enrolled course");
console.log("=== ALL PASSED ===");
