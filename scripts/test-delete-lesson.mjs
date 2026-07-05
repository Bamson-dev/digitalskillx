#!/usr/bin/env node
/**
 * Admin creates a lesson, deletes it via server action, verifies removal.
 * Usage: node scripts/test-delete-lesson.mjs [baseUrl] [courseId]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const courseIdArg = process.argv[3];

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
  console.error("Set TEST_ADMIN_PASSWORD in .env.test");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
}

function actionIdsFrom(html) {
  return [...new Set([...html.matchAll(/"\$ACTION_ID_([0-9a-f]+)"/gi)].map((m) => m[1]))];
}

const jar = join(mkdtempSync(join(tmpdir(), "del-lesson-")), "cookies.txt");
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

let courseId = courseIdArg;
if (!courseId) {
  const coursesPage = curl(["-b", jar, `${base}/admin/courses`]);
  courseId = coursesPage.match(/\/admin\/courses\/([0-9a-f-]{36})/i)?.[1];
}
if (!courseId) {
  console.error("FAIL: could not resolve course id");
  process.exit(1);
}

const pageUrl = `${base}/admin/courses/${courseId}`;
let html = curl(["-b", jar, pageUrl]);

function moduleIdFrom(html) {
  const match = [...html.matchAll(/name="module_id"[^>]*value="([0-9a-f-]{36})"/gi)][0];
  return match?.[1] ?? null;
}

let moduleId = moduleIdFrom(html);
if (!moduleId) {
  const createAction = actionIdsFrom(html)[0];
  if (!createAction) {
    console.error("FAIL: no server actions on course page");
    process.exit(1);
  }
  curl([
    "-b",
    jar,
    "-X",
    "POST",
    pageUrl,
    "-H",
    `Next-Action: ${createAction}`,
    "-F",
    `course_id=${courseId}`,
    "-F",
    "title=Lesson delete test module",
  ]);
  html = curl(["-b", jar, pageUrl]);
  moduleId = moduleIdFrom(html);
}

if (!moduleId) {
  console.error("FAIL: could not find or create module");
  process.exit(1);
}

const lessonTitle = `Delete test ${Date.now()}`;
const createAction = actionIdsFrom(html)[0];
curl([
  "-b",
  jar,
  "-X",
  "POST",
  pageUrl,
  "-H",
  `Next-Action: ${createAction}`,
  "-F",
  `module_id=${moduleId}`,
  "-F",
  `course_id=${courseId}`,
  "-F",
  `title=${lessonTitle}`,
  "-F",
  "lesson_type=video",
]);

html = curl(["-b", jar, pageUrl]);
if (!html.includes(lessonTitle)) {
  console.error("FAIL: test lesson not found after create");
  process.exit(1);
}
console.log("PASS: created test lesson", lessonTitle);

const lessonIdMatch = html.match(
  new RegExp(`${lessonTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]{0,400}?name="id"[^>]*value="([0-9a-f-]{36})"`, "i"),
);
const lessonId = lessonIdMatch?.[1];
if (!lessonId) {
  console.error("FAIL: could not resolve lesson id");
  process.exit(1);
}

const deleteAction = actionIdsFrom(html).at(-1) ?? actionIdsFrom(html)[0];
curl([
  "-b",
  jar,
  "-X",
  "DELETE",
  `${base}/api/admin/lessons`,
  "-H",
  "Content-Type: application/json",
  "-d",
  JSON.stringify({ courseId, lessonIds: [lessonId] }),
]);

const afterHtml = curl(["-b", jar, pageUrl]);
if (afterHtml.includes(lessonTitle)) {
  console.error("FAIL: lesson still visible after delete");
  process.exit(1);
}

console.log("PASS: lesson deleted");
console.log("=== ALL PASSED ===");
