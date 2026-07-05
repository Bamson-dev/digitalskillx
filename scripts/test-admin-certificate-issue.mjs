#!/usr/bin/env node
/**
 * Admin issues certificate via API → student login → certificate visible + detail page loads.
 * Usage: node scripts/test-admin-certificate-issue.mjs [baseUrl]
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

const testEmail = `cert-test+${Date.now()}@digitalskillx.com`;
const testPassword = `Test-${crypto.randomBytes(4).toString("hex")}!9`;
const testName = "Certificate Test Student";

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function actionIdsFrom(html) {
  return [...new Set([...html.matchAll(/"\$ACTION_ID_([0-9a-f]+)"/gi)].map((m) => m[1]))];
}

console.log("Testing admin certificate issue on", base);

const adminJar = join(mkdtempSync(join(tmpdir(), "admin-cert-")), "admin.txt");
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
let studentId = null;
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
    `full_name=${testName}`,
    "-F",
    `email=${testEmail}`,
    "-F",
    `password=${testPassword}`,
  ]);
  if (/Student .+ created/i.test(res)) {
    const listPage = curl(["-b", adminJar, `${base}/admin/students`]);
    studentId = listPage.match(
      new RegExp(`/admin/students/([0-9a-f-]{36})[\\s\\S]{0,200}?${testEmail.replace(/[+]/g, "\\+")}`, "i"),
    )?.[1];
    break;
  }
}

if (!studentId) {
  console.error("FAIL: could not create test student");
  process.exit(1);
}
console.log("Created student:", studentId);

const detailPage = curl(["-b", adminJar, `${base}/admin/students/${studentId}`]);
const courseOptions = [
  ...detailPage.matchAll(/<option value="([0-9a-f-]{36})">([^<]+)<\/option>/gi),
].filter((m) => !/Select|Issue|Grant/i.test(m[2]));
const courseId = courseOptions[0]?.[1];
if (!courseId) {
  console.error("FAIL: no courses on student detail page");
  process.exit(1);
}

let enrolled = false;
for (const actionId of actionIdsFrom(detailPage)) {
  const res = curl([
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
  if (/enrolled=1|already_enrolled|Course enrolled|Granted/i.test(res)) {
    enrolled = true;
    break;
  }
}

if (!enrolled) {
  console.error("FAIL: could not grant course access before issuing certificate");
  process.exit(1);
}
console.log("Granted course access:", courseId);

const issueRes = curl([
  "-b",
  adminJar,
  "-X",
  "POST",
  `${base}/api/admin/certificates`,
  "-H",
  "Content-Type: application/json",
  "-d",
  JSON.stringify({
    action: "issue",
    studentId,
    courseId,
    recipientName: testName,
  }),
]);

let issueJson;
try {
  issueJson = JSON.parse(issueRes);
} catch {
  console.error("FAIL: certificate issue API did not return JSON", issueRes.slice(0, 500));
  process.exit(1);
}

if (!issueJson.ok || !issueJson.certificateId) {
  console.error("FAIL: certificate issue API failed", issueRes.slice(0, 500));
  process.exit(1);
}
console.log("PASS: admin issued certificate", issueJson.certificateNumber);

const studentJar = join(mkdtempSync(join(tmpdir(), "student-cert-")), "student.txt");
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
const certsPage = curl(["-b", studentJar, `${base}/certificates`]);
const certDetail = curl([
  "-b",
  studentJar,
  "-w",
  "\n__HTTP__%{http_code}",
  `${base}/certificates/${issueJson.certificateId}`,
]);

if (/auth_error|Could not load your profile/i.test(dashboard)) {
  console.error("FAIL: student login failed");
  process.exit(1);
}

const detailBody = certDetail.replace(/\n__HTTP__.*$/, "");
const detailStatus = certDetail.match(/__HTTP__(\d+)/)?.[1];
if (detailStatus === "404" || /404\s*\|\s*This page could not be found/i.test(detailBody)) {
  console.error("FAIL: certificate detail page returned 404");
  process.exit(1);
}

const hasCert =
  /Your certificates/i.test(dashboard) ||
  /PDG-/i.test(dashboard + certsPage) ||
  dashboard.includes(testName) ||
  certsPage.includes(testName);
const empty = /No certificates yet/i.test(certsPage);

if (!hasCert || empty) {
  console.error("FAIL: certificate not visible to student");
  console.error("Dashboard snippet:", dashboard.slice(0, 900));
  process.exit(1);
}

if (!detailBody.includes(testName)) {
  console.error("FAIL: certificate detail missing recipient name");
  process.exit(1);
}

console.log("PASS: student sees certificate on dashboard/certificates page");
console.log("PASS: certificate detail page loads with recipient name");
console.log("=== ALL PASSED ===");
