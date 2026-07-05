#!/usr/bin/env node
/**
 * Student with admin-granted course can open /courses/:id (not redirected to purchase page).
 * Usage: node scripts/test-student-course-access.mjs [baseUrl] [email] [password] [courseId]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const studentEmail = (process.argv[3] ?? process.env.TEST_STUDENT_EMAIL ?? "bamzonline01@gmail.com").toLowerCase();
const studentPassword =
  process.argv[4] ?? process.env.TEST_STUDENT_PASSWORD ?? process.env.TEST_ADMIN_PASSWORD;
const courseId =
  process.argv[5] ?? "1611149e-4530-4380-8ee8-5c02c38c25d7";

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

if (!studentPassword) {
  console.error("Set TEST_STUDENT_PASSWORD or pass password as 4th argument");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

console.log("Testing student course player access on", base);
console.log("Student:", studentEmail, "Course:", courseId);

const jar = join(mkdtempSync(join(tmpdir(), "student-course-")), "cookies.txt");
curl([
  "-c",
  jar,
  "-b",
  jar,
  "-X",
  "POST",
  `${base}/api/auth/login`,
  "-d",
  new URLSearchParams({ email: studentEmail, password: studentPassword, next: "/dashboard" }).toString(),
  "-o",
  "/dev/null",
]);

const loginProbe = curl([
  "-b",
  jar,
  "-w",
  "\n__HTTP__%{http_code}",
  `${base}/dashboard`,
]);
const loginHttp = loginProbe.split("__HTTP__")[1]?.trim();
if (loginHttp !== "200" || /auth_error|Could not load your profile/i.test(loginProbe)) {
  console.error("FAIL: student login failed — check email/password");
  console.error(loginProbe.slice(0, 400));
  process.exit(1);
}
console.log("PASS: student logged in");

const playerRes = curl([
  "-b",
  jar,
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

if (/You haven't purchased a course yet|Enroll Now/i.test(body) && !/Back to courses/i.test(body)) {
  console.error("FAIL: course player page looks like marketplace purchase page");
  process.exit(1);
}

if (!/Back to courses|Course player|lesson/i.test(body)) {
  console.error("FAIL: course player content not found");
  console.error(body.slice(0, 500));
  process.exit(1);
}

console.log("PASS: student can open course player at /courses/" + courseId);
console.log("=== ALL PASSED ===");
