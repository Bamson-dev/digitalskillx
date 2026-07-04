#!/usr/bin/env node
/** Verify published courses appear on homepage and admin students page. */
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

const email = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const password = process.env.TEST_ADMIN_PASSWORD;
if (!password) {
  console.error("Set TEST_ADMIN_PASSWORD");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

console.log("Testing", base);

const home = curl([base]);
const homeCourseLinks = (home.match(/\/course\/[0-9a-f-]{36}/gi) || []).length;
console.log("Homepage course links:", homeCourseLinks);

if (homeCourseLinks === 0) {
  console.error("FAIL: no course links on homepage");
  process.exit(1);
}

const jar = join(mkdtempSync(join(tmpdir(), "catalog-")), "cookies.txt");
curl([
  "-c",
  jar,
  "-b",
  jar,
  "-X",
  "POST",
  `${base}/api/auth/admin-login`,
  "-d",
  new URLSearchParams({ email, password }).toString(),
  "-o",
  "/dev/null",
]);

const students = curl(["-b", jar, `${base}/admin/students`]);
const noCourses = /No courses yet\. Create a course/i.test(students);
const hasCheckbox = /name="course_ids"/.test(students);

console.log("Students page empty courses message:", noCourses);
console.log("Students page course checkboxes:", hasCheckbox);

if (noCourses || !hasCheckbox) {
  console.error("FAIL: courses not listed on admin students page");
  process.exit(1);
}

console.log("PASS: published courses visible on homepage and students page");
console.log("=== ALL PASSED ===");
