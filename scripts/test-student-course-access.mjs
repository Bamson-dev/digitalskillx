#!/usr/bin/env node
/**
 * Admin grants course → student login → /courses/:id opens (not purchase redirect).
 * Usage: node scripts/test-student-course-access.mjs [baseUrl]
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

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function actionIdsFrom(html) {
  return [...new Set([...html.matchAll(/"\$ACTION_ID_([0-9a-f]+)"/gi)].map((m) => m[1]))];
}

const testEmail = `course-access+${Date.now()}@digitalskillx.com`;
const testPassword = `Test-${crypto.randomBytes(4).toString("hex")}!9`;
const testName = "Course Access Test";

console.log("Testing student course player access on", base);

curl([
  "-X",
  "POST",
  `${base}/register`,
  "-H",
  "Content-Type: application/x-www-form-urlencoded",
  "-d",
  new URLSearchParams({
    full_name: testName,
    email: testEmail,
    password: testPassword,
    confirm_password: testPassword,
  }).toString(),
  "-o",
  "/dev/null",
]);

const adminJar = join(mkdtempSync(join(tmpdir(), "admin-course-")), "admin.txt");
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
  console.error("FAIL: registered student not found in admin list");
  process.exit(1);
}

const detailPage = curl(["-b", adminJar, `${base}/admin/students/${studentId}`]);
const courseOptions = [
  ...detailPage.matchAll(/<option value="([0-9a-f-]{36})">([^<]+)<\/option>/gi),
].filter((m) => !m[2].includes("Select a course"));
if (courseOptions.length === 0) {
  console.error("FAIL: no grantable courses on student detail page");
  process.exit(1);
}
const courseId = courseOptions[0][1];
console.log("Granting course:", courseOptions[0][2], courseId);

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
    `course_id=${courseId}`,
  ]);
  if (/enrolled=1|already_enrolled|Course enrolled/i.test(grantRes)) {
    grantOk = true;
    break;
  }
}

if (!grantOk) {
  console.error("FAIL: admin grant server action did not succeed");
  process.exit(1);
}
console.log("PASS: admin granted course");

const studentJar = join(mkdtempSync(join(tmpdir(), "student-course-")), "cookies.txt");
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

const loginProbe = curl([
  "-b",
  studentJar,
  "-w",
  "\n__HTTP__%{http_code}",
  `${base}/dashboard`,
]);
if (
  loginProbe.split("__HTTP__")[1]?.trim() !== "200" ||
  /auth_error|Could not load your profile/i.test(loginProbe)
) {
  console.error("FAIL: student login failed");
  process.exit(1);
}
console.log("PASS: student logged in");

const playerRes = curl([
  "-b",
  studentJar,
  "-w",
  "\n__HTTP__%{http_code}__URL__%{url_effective}",
  `${base}/courses/${courseId}`,
]);
const urlMatch = playerRes.match(/__URL__(.+)$/);
const effectiveUrl = urlMatch?.[1]?.trim() ?? "";
const body = playerRes.replace(/\n__HTTP__.*$/, "");

if (effectiveUrl.includes(`/course/${courseId}`) && !effectiveUrl.includes(`/courses/${courseId}`)) {
  console.error("FAIL: redirected to purchase page instead of course player");
  console.error("Final URL:", effectiveUrl);
  process.exit(1);
}

if (!/Back to courses/i.test(body)) {
  console.error("FAIL: course player content not found");
  console.error(body.slice(0, 500));
  process.exit(1);
}

console.log("PASS: student can open course player at /courses/" + courseId);
console.log("=== ALL PASSED ===");
