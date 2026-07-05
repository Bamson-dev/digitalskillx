#!/usr/bin/env node
/**
 * Test assignment submission on production.
 * Usage: node scripts/test-assignment-submit.mjs [baseUrl] [assignmentId]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const assignmentIdArg = process.argv[3];

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
const preferredCourseId = "bfae3d3b-8d22-4dae-97d8-d27ffbb2ccfb";

if (!adminPassword) {
  console.error("Set TEST_ADMIN_PASSWORD in .env.test");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function curlJson(args) {
  const raw = curl(args);
  try {
    return JSON.parse(raw);
  } catch {
    console.error("Non-JSON:", raw.slice(0, 500));
    process.exit(1);
  }
}

function actionIdsFrom(html) {
  return [...new Set([...html.matchAll(/"\$ACTION_ID_([0-9a-f]+)"/gi)].map((m) => m[1]))];
}

console.log("Testing assignment submit on", base);

const adminJar = join(mkdtempSync(join(tmpdir(), "as-admin-")), "admin.txt");
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

let assignmentId = assignmentIdArg;
if (!assignmentId) {
  const title = `Submit Test ${Date.now()}`;
  const createRes = curlJson([
    "-b",
    adminJar,
    "-X",
    "POST",
    `${base}/api/admin/assignments`,
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify({
      action: "create",
      courseId: preferredCourseId,
      moduleId: null,
      title,
      instructions: "Submit any text.",
      submissionTypes: ["text"],
    }),
  ]);
  if (createRes.error) {
    console.error("FAIL: create assignment", createRes.error);
    process.exit(1);
  }
  assignmentId = createRes.assignment.id;
  const publishRes = curlJson([
    "-b",
    adminJar,
    "-X",
    "POST",
    `${base}/api/admin/assignments`,
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify({ action: "publish", assignmentId }),
  ]);
  if (publishRes.error) {
    console.error("FAIL: publish assignment", publishRes.error);
    process.exit(1);
  }
  console.log("Created + published assignment", assignmentId);
}

const testEmail = `assign-submit+${Date.now()}@digitalskillx.com`;
const testPassword = `Test-${crypto.randomBytes(4).toString("hex")}!9Aa`;
const studentsPage = curl(["-b", adminJar, `${base}/admin/students`]);
let provisioned = false;
for (const actionId of actionIdsFrom(studentsPage)) {
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
    `full_name=Submit Test Student`,
    "-F",
    `email=${testEmail}`,
    "-F",
    `password=${testPassword}`,
    "-F",
    `course_ids=${preferredCourseId}`,
  ]);
  if (/Student .+ created|enrolled/i.test(res)) {
    provisioned = true;
    break;
  }
}

if (!provisioned) {
  const bulk = curlJson([
    "-b",
    adminJar,
    "-X",
    "POST",
    `${base}/api/admin/bulk-students`,
    "-F",
    `default_course_id=${preferredCourseId}`,
    "-F",
    `csv=full_name,email\nSubmit Test,${testEmail}`,
  ]);
  if (bulk.bulkSummary?.failed?.length > 0) {
    console.error("FAIL: could not provision student", bulk);
    process.exit(1);
  }
  console.warn("WARN: bulk student created without known password — set TEST_STUDENT_EMAIL/PASSWORD");
  process.exit(0);
}

const studentJar = join(mkdtempSync(join(tmpdir(), "as-student-")), "student.txt");
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

const me = curlJson(["-b", studentJar, `${base}/api/auth/me`]);
if (!me.authenticated) {
  console.error("FAIL: student login failed");
  process.exit(1);
}
console.log("PASS: student logged in", testEmail);

const submitRes = curlJson([
  "-b",
  studentJar,
  "-X",
  "POST",
  `${base}/api/student/assignments/submit`,
  "-H",
  "Content-Type: application/json",
  "-d",
  JSON.stringify({
    assignmentId,
    content: "Automated submission test content.",
  }),
]);

if (submitRes.error || !submitRes.ok) {
  console.error("FAIL: submit API", submitRes);
  process.exit(1);
}
console.log("PASS: submission API accepted");

const page = curl(["-b", studentJar, `${base}/assignments/${assignmentId}`]);
if (!/Automated submission test content/i.test(page) && !/Pending/i.test(page)) {
  console.error("FAIL: submission not visible on assignment page");
  console.error(page.slice(0, 800));
  process.exit(1);
}
console.log("PASS: submission visible on assignment page");
console.log("=== ASSIGNMENT SUBMIT VERIFIED ===");
