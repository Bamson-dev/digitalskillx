#!/usr/bin/env node
/**
 * Test mark-lesson-complete on production.
 * Usage: node scripts/test-mark-lesson-complete.mjs [baseUrl] [courseId]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const preferredCourseId = process.argv[3] ?? "5125b8f8-953f-413e-8e62-68207210b69b";

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

function actionIdsFrom(html) {
  return [...new Set([...html.matchAll(/"\$ACTION_ID_([0-9a-f]+)"/gi)].map((m) => m[1]))];
}

const testEmail = `mark-complete+${Date.now()}@digitalskillx.com`;
const testPassword = `Test-${crypto.randomBytes(4).toString("hex")}!9`;
const testName = "Mark Complete Test";

console.log("Testing mark lesson complete on", base);

curl([
  "-X",
  "POST",
  `${base}/api/auth/register`,
  "-H",
  "Content-Type: application/json",
  "-d",
  JSON.stringify({
    full_name: testName,
    email: testEmail,
    password: testPassword,
  }),
  "-o",
  "/dev/null",
]);

const adminJar = join(mkdtempSync(join(tmpdir(), "mc-admin-")), "admin.txt");
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

const listPage = curl(["-b", adminJar, `${base}/admin/students?q=${encodeURIComponent(testEmail)}`]);
const studentId = listPage.match(/\/admin\/students\/([0-9a-f-]{36})/i)?.[1];
if (!studentId) {
  console.error("FAIL: registered student not found");
  process.exit(1);
}

const detailPage = curl(["-b", adminJar, `${base}/admin/students/${studentId}`]);
let grantOk = false;
for (const actionId of actionIdsFrom(detailPage)) {
  const grantRes = curl([
    "-b",
    adminJar,
    "-X",
    "POST",
    `${base}/admin/students/${studentId}`,
    "-H",
    "Accept: text/x-component",
    "-H",
    `Next-Action: ${actionId}`,
    "-F",
    `student_id=${studentId}`,
    "-F",
    `course_id=${preferredCourseId}`,
  ]);
  if (/enrolled=1|already_enrolled|Course enrolled/i.test(grantRes)) {
    grantOk = true;
    break;
  }
}
if (!grantOk) {
  console.error("FAIL: could not grant course");
  process.exit(1);
}
console.log("PASS: course granted");

const studentJar = join(mkdtempSync(join(tmpdir(), "mc-student-")), "student.txt");
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

const coursePage = curl(["-b", studentJar, `${base}/courses/${preferredCourseId}`]);
const lessonId = coursePage.match(/\/lessons\/([0-9a-f-]{36})/i)?.[1];
if (!lessonId) {
  console.error("FAIL: no lesson link on course page");
  process.exit(1);
}
console.log("Lesson:", lessonId);

const lessonPage = curl(["-b", studentJar, `${base}/lessons/${lessonId}`]);
if (/Something went wrong|unexpected error occurred/i.test(lessonPage)) {
  console.error("FAIL: lesson page already shows global error");
  process.exit(1);
}

const actionIds = actionIdsFrom(lessonPage);
if (actionIds.length === 0) {
  console.error("FAIL: no server actions found on lesson page");
  process.exit(1);
}

let markOk = false;
let lastRes = "";
for (const actionId of actionIds) {
  const res = curl([
    "-b",
    studentJar,
    "-X",
    "POST",
    `${base}/lessons/${lessonId}`,
    "-H",
    "Accept: text/x-component",
    "-H",
    `Next-Action: ${actionId}`,
    "-F",
    `lesson_id=${lessonId}`,
  ]);
  lastRes = res;
  if (/Something went wrong|unexpected error occurred|GlobalError/i.test(res)) {
    continue;
  }
  if (/Completed|Mark complete|lesson_id/i.test(res) || res.includes("1:")) {
    markOk = true;
    break;
  }
}

if (!markOk) {
  console.error("FAIL: mark complete triggered global error or no success response");
  console.error(lastRes.slice(0, 800));
  process.exit(1);
}

const afterPage = curl(["-b", studentJar, `${base}/lessons/${lessonId}`]);
if (/Something went wrong|unexpected error occurred/i.test(afterPage)) {
  console.error("FAIL: lesson page shows error after mark complete");
  process.exit(1);
}

console.log("PASS: mark lesson complete succeeded without global error");
console.log("=== ALL PASSED ===");
