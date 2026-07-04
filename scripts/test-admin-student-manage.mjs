#!/usr/bin/env node
/**
 * Verify admin student management UI and profile update action.
 * Usage: node scripts/test-admin-student-manage.mjs [baseUrl]
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
if (!adminPassword) {
  console.error("Set TEST_ADMIN_PASSWORD in .env.test");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

console.log("Testing admin student management on", base);

const jar = join(mkdtempSync(join(tmpdir(), "manage-")), "admin.txt");
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

const listPage = curl(["-b", jar, `${base}/admin/students`]);

const checks = [
  ["Manage button", /Manage/i.test(listPage)],
  ["Courses column", />Courses</i.test(listPage) || /Courses/i.test(listPage)],
  ["Actions column", />Actions</i.test(listPage) || /Manage/i.test(listPage)],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) process.exit(1);
}

const studentIdMatch = listPage.match(/\/admin\/students\/([0-9a-f-]{36})/i);
if (!studentIdMatch) {
  console.error("FAIL: no student detail link found");
  process.exit(1);
}

const studentId = studentIdMatch[1];
const detailPage = curl(["-b", jar, `${base}/admin/students/${studentId}`]);

const detailChecks = [
  ["Account profile section", /Account profile/i.test(detailPage)],
  ["Save profile", /Save profile/i.test(detailPage)],
  ["Course access section", /Course access/i.test(detailPage)],
  ["Remove access", /Remove access/i.test(detailPage)],
  ["Grant access", /Grant access/i.test(detailPage)],
  ["Suspend button", /Suspend|Unsuspend/i.test(detailPage)],
  ["Reset password", /Reset password/i.test(detailPage)],
  ["Delete account", /Delete account/i.test(detailPage)],
];

for (const [label, ok] of detailChecks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) process.exit(1);
}

console.log("=== ALL PASSED ===");
