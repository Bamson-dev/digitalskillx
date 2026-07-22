#!/usr/bin/env node
/**
 * Production test: mark a lesson coming soon and verify student lesson page.
 * Usage: node scripts/test-lesson-coming-soon.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
loadEnvFile(".env.local");

const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const email = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const password = process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;

if (!password) {
  console.error("Set TEST_ADMIN_PASSWORD");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

function login() {
  const jar = join(mkdtempSync(join(tmpdir(), "lesson-soon-")), "cookies.txt");
  const headers = curl([
    "-D",
    "-",
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
  const location = headers.match(/^location: (.+)$/im)?.[1]?.trim();
  if (!location?.includes("/admin")) {
    console.error("FAIL: admin login");
    process.exit(1);
  }
  console.log("PASS: admin login");
  return jar;
}

function findCourseWithLesson(jar) {
  const html = curl(["-b", jar, `${base}/admin/courses`]);
  const courseMatch = html.match(/\/admin\/courses\/([0-9a-f-]{36})/i);
  if (!courseMatch) {
    console.error("FAIL: no course");
    process.exit(1);
  }
  const courseId = courseMatch[1];
  const courseHtml = curl(["-b", jar, `${base}/admin/courses/${courseId}`]);
  if (!/is_coming_soon/i.test(courseHtml) || !/coming_soon_available_at/i.test(courseHtml)) {
    console.error("FAIL: coming soon lesson UI not deployed yet");
    process.exit(1);
  }
  console.log("PASS: lesson coming soon fields on admin course editor");

  const actionMatch = courseHtml.match(/"\$ACTION_ID_([0-9a-f]+)"/i);
  if (!actionMatch) {
    console.error("FAIL: no action id");
    process.exit(1);
  }

  // Prefer real lesson ids from the student curriculum (admin preview), not module/course hidden ids.
  const studentCourseHtml = curl(["-b", jar, `${base}/courses/${courseId}`]);
  const lessonIds = [
    ...new Set(
      [...studentCourseHtml.matchAll(/href="\/lessons\/([0-9a-f-]{36})"/gi)].map((m) => m[1]),
    ),
  ];
  const lessonId = lessonIds[0];
  if (!lessonId) {
    console.error("FAIL: no lesson id on course curriculum");
    process.exit(1);
  }

  return { courseId, lessonId, actionId: actionMatch[1], courseHtml };
}

function saveLessonComingSoon(jar, { courseId, lessonId, actionId, courseHtml }) {
  const titleMatch = courseHtml.match(
    new RegExp(`name="id" value="${lessonId}"[\\s\\S]*?name="title"[^>]*defaultValue="([^"]*)"`, "i"),
  );
  const lessonTitle = titleMatch?.[1] ?? "Test lesson";
  const availableAt = "2026-09-01T10:00";

  const body = new URLSearchParams({
    id: lessonId,
    course_id: courseId,
    title: lessonTitle,
    lesson_type: "video",
    required_watch_pct: "0",
    is_coming_soon: "on",
    coming_soon_available_at: availableAt,
  }).toString();

  const response = curl([
    "-b",
    jar,
    "-X",
    "POST",
    `${base}/admin/courses/${courseId}`,
    "-H",
    "Content-Type: application/x-www-form-urlencoded",
    "-H",
    `Next-Action: ${actionId}`,
    "-d",
    body,
  ]);

  if (/0026_lesson_coming_soon/i.test(response)) {
    console.error("FAIL: run migration 0026 in Supabase first");
    process.exit(1);
  }
  if (/Lesson coming soon columns are missing/i.test(response)) {
    console.error("FAIL: run migration 0026 in Supabase first");
    process.exit(1);
  }
  if (/error/i.test(response) && !/Course settings saved/i.test(response)) {
    console.error("FAIL: save lesson", response.slice(0, 800));
    process.exit(1);
  }
  console.log("PASS: lesson marked coming soon");
  return lessonId;
}

function verifyAdminLessonBadge(jar, courseId, lessonId) {
  const html = curl(["-b", jar, `${base}/admin/courses/${courseId}`]);
  if (!/Coming soon/i.test(html)) {
    console.error("FAIL: Coming soon badge not visible on admin lesson list");
    process.exit(1);
  }
  console.log("PASS: Coming soon badge on admin lesson list");
}

function verifyLessonPageLoads(jar, lessonId) {
  const html = curl(["-b", jar, `${base}/lessons/${lessonId}`]);
  if (/This lesson is being prepared/i.test(html)) {
    console.log("PASS: coming soon lesson page renders");
    return;
  }
  if (html.includes("__next_error__")) {
    console.error("FAIL: lesson page server error");
    console.error(html.slice(0, 600));
    process.exit(1);
  }
  if (/Log in to continue/i.test(html)) {
    console.error("FAIL: lesson page redirected to login");
    process.exit(1);
  }
  console.log("PASS: lesson page loads");
}

console.log("Testing lesson coming soon on", base);
const jar = login();
const ctx = findCourseWithLesson(jar);
const lessonId = saveLessonComingSoon(jar, ctx);
verifyAdminLessonBadge(jar, ctx.courseId, lessonId);
verifyLessonPageLoads(jar, lessonId);
console.log("=== ALL PASSED ===");
