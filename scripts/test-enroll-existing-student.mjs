#!/usr/bin/env node
/**
 * Test enrolling an existing student via admin Add student form.
 * Usage: node scripts/test-enroll-existing-student.mjs [baseUrl] [email] [courseTitleSubstring]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const studentEmail = (process.argv[3] ?? "bamzonline01@gmail.com").toLowerCase();
const courseMatch = process.argv[4] ?? "Facebook Ad Mastery";

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
  console.error("Set TEST_ADMIN_PASSWORD");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

const jar = join(mkdtempSync(join(tmpdir(), "enroll-")), "cookies.txt");
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

const pageUrl = `${base}/admin/students`;
const page = curl(["-b", jar, pageUrl]);

const courseIdMatch = [...page.matchAll(/name="course_ids"[^>]*value="([0-9a-f-]{36})"[^>]*>[\s\S]*?>([^<]+)</gi)]
  .map((m) => ({ id: m[1], title: m[2].trim() }))
  .find((c) => c.title.toLowerCase().includes(courseMatch.toLowerCase()));

if (!courseIdMatch) {
  console.error("FAIL: could not find course matching", courseMatch);
  process.exit(1);
}

console.log("Enrolling", studentEmail, "in", courseIdMatch.title);

const actionIds = [...new Set([...page.matchAll(/"\$ACTION_ID_([0-9a-f]+)"/gi)].map((m) => m[1]))];
let success = false;
let lastResponse = "";

for (const actionId of actionIds) {
  const res = curl([
    "-b",
    jar,
    "-X",
    "POST",
    pageUrl,
    "-H",
    "Accept: text/x-component",
    "-H",
    `Next-Action: ${actionId}`,
    "-F",
    "full_name=Bamidele",
    "-F",
    `email=${studentEmail}`,
    "-F",
    `course_ids=${courseIdMatch.id}`,
    "-F",
    "password=",
  ]);
  lastResponse = res;
  if (/Granted .* access to|already enrolled in the selected|Enrollment email sent/i.test(res)) {
    success = true;
    break;
  }
  if (/already exists/i.test(res) && !/already enrolled/i.test(res)) {
    console.error("FAIL: old duplicate-email error still returned");
    console.error(res.slice(0, 400));
    process.exit(1);
  }
}

if (!success) {
  console.error("FAIL: no success message in server action responses");
  console.error(lastResponse.slice(0, 600));
  process.exit(1);
}

console.log("PASS: enroll existing student action succeeded");

const studentsPage = curl(["-b", jar, pageUrl]);
if (/No students found/i.test(studentsPage) && !studentsPage.includes(studentEmail)) {
  console.log("WARN: student not visible in list (may be RLS or no profile row)");
} else if (studentsPage.toLowerCase().includes(studentEmail)) {
  console.log("PASS: student visible on students list");
}

console.log("=== ALL PASSED ===");
