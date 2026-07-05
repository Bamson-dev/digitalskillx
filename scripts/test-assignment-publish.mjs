#!/usr/bin/env node
/**
 * Verify assignment draft/publish on production (requires SQL migration 0022).
 * Usage: node scripts/test-assignment-publish.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
const studentEmail = process.env.TEST_STUDENT_EMAIL ?? "bamzonline01@gmail.com";
const studentPassword = process.env.TEST_STUDENT_PASSWORD ?? adminPassword;
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
    console.error("Non-JSON response:", raw.slice(0, 800));
    process.exit(1);
  }
}

console.log("Testing assignment publish on", base);

const adminJar = join(mkdtempSync(join(tmpdir(), "assign-admin-")), "admin.txt");
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

const assignmentsPage = curl(["-b", adminJar, `${base}/admin/assignments`]);
if (!/Create draft assignment/i.test(assignmentsPage)) {
  console.error("FAIL: assignments page missing draft UI");
  process.exit(1);
}
console.log("PASS: assignments page loaded");

const testTitle = `E2E Publish Test ${Date.now()}`;
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
    title: testTitle,
    instructions: "Automated test — submit any short text.",
    submissionTypes: ["text"],
  }),
]);

if (createRes.error) {
  console.error("FAIL: create draft —", createRes.error);
  if (/migration is missing/i.test(createRes.error)) {
    console.error("\nRun sql/assignment-course-publish.sql in Supabase SQL Editor first.");
  }
  process.exit(1);
}

const assignmentId = createRes.assignment?.id;
if (!assignmentId) {
  console.error("FAIL: create did not return assignment id", createRes);
  process.exit(1);
}
console.log("PASS: draft created", assignmentId);

const studentJar = join(mkdtempSync(join(tmpdir(), "assign-student-")), "student.txt");
curl([
  "-c",
  studentJar,
  "-b",
  studentJar,
  "-X",
  "POST",
  `${base}/api/auth/login`,
  "-d",
  new URLSearchParams({ email: studentEmail, password: studentPassword, next: "/dashboard" }).toString(),
  "-o",
  "/dev/null",
]);

const before = curl([
  "-b",
  studentJar,
  "-w",
  "\n__HTTP__%{http_code}",
  `${base}/assignments/${assignmentId}`,
]);
const beforeStatus = before.match(/__HTTP__(\d+)/)?.[1];
if (beforeStatus !== "404") {
  console.error("FAIL: draft should be hidden (HTTP", beforeStatus + ")");
  process.exit(1);
}
console.log("PASS: draft hidden from student");

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

if (publishRes.error || !publishRes.ok) {
  console.error("FAIL: publish —", publishRes.error ?? publishRes);
  process.exit(1);
}
console.log(
  "PASS: published —",
  publishRes.notified,
  "notification(s),",
  publishRes.emailsSent,
  "email(s)",
);

const republish = curlJson([
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
if (!/already published|not found/i.test(republish.error ?? "")) {
  console.error("FAIL: republish should be rejected", republish);
  process.exit(1);
}
console.log("PASS: republish blocked (notify once)");

const after = curl([
  "-b",
  studentJar,
  "-w",
  "\n__HTTP__%{http_code}",
  `${base}/assignments/${assignmentId}`,
]);
const afterStatus = after.match(/__HTTP__(\d+)/)?.[1];
const afterBody = after.replace(/\n__HTTP__.*$/, "");
if (afterStatus === "404" || /404\s*\|\s*This page could not be found/i.test(afterBody)) {
  console.error("FAIL: published assignment not visible to student");
  process.exit(1);
}
console.log("PASS: student can open published assignment");

if (afterBody.includes(testTitle)) {
  console.log("PASS: assignment title visible on student page");
}

console.log("=== ASSIGNMENT PUBLISH VERIFIED ===");
console.log("URL:", `${base}/assignments/${assignmentId}`);
