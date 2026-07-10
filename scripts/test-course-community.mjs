#!/usr/bin/env node
/**
 * Production test: save course community links and verify student course page shows Community section.
 * Usage: node scripts/test-course-community.mjs [baseUrl]
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
  const jar = join(mkdtempSync(join(tmpdir(), "community-test-")), "cookies.txt");
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

function findCourseId(jar) {
  const html = curl(["-b", jar, `${base}/admin/courses`]);
  const match = html.match(/\/admin\/courses\/([0-9a-f-]{36})/i);
  if (!match) {
    console.error("FAIL: no course id");
    process.exit(1);
  }
  return match[1];
}

function extractActionId(html) {
  const match = html.match(/"\$ACTION_ID_([0-9a-f]+)"/i);
  return match ? match[1] : null;
}

function saveCommunityLinks(jar, courseId) {
  const pageUrl = `${base}/admin/courses/${courseId}`;
  const html = curl(["-b", jar, pageUrl]);
  const actionId = extractActionId(html);
  if (!actionId) {
    console.error("FAIL: no server action id");
    process.exit(1);
  }

  if (!/community_telegram_url/i.test(html)) {
    console.error("FAIL: Community section not found on admin course settings (deploy pending?)");
    process.exit(1);
  }
  console.log("PASS: Community fields on admin course page");

  const titleMatch = html.match(/name="title"[^>]*value="([^"]*)"/);
  const title = titleMatch?.[1] ?? "Test course";
  const telegram = "https://t.me/digitalskillx_test_community";
  const whatsapp = "https://chat.whatsapp.com/TESTCOMMUNITYLINK";

  const body = new URLSearchParams({
    id: courseId,
    title,
    description: "",
    short_description: "",
    category_id: "",
    visibility: "published",
    enrollment_type: "open",
    price_ngn: "0",
    price_usd: "0",
    required_completion_pct: "100",
    learning_outcomes: "",
    certificate_template_override: "",
    thumbnail_url: "",
    community_telegram_url: telegram,
    community_whatsapp_url: whatsapp,
  }).toString();

  const response = curl([
    "-b",
    jar,
    "-X",
    "POST",
    pageUrl,
    "-H",
    "Content-Type: application/x-www-form-urlencoded",
    "-H",
    `Next-Action: ${actionId}`,
    "-d",
    body,
  ]);

  if (/community link columns are missing/i.test(response)) {
    console.error("FAIL: run supabase/migrations/0025_course_community_links.sql first");
    process.exit(1);
  }
  if (/Telegram link must be/i.test(response) || /WhatsApp link must be/i.test(response)) {
    console.error("FAIL: validation error", response.slice(0, 600));
    process.exit(1);
  }
  if (!/Course settings saved/i.test(response) && !/"message"/i.test(response)) {
    console.error("FAIL: save response", response.slice(0, 900));
    process.exit(1);
  }
  console.log("PASS: community links saved");
}

function verifyStudentCoursePage(jar, courseId) {
  const html = curl(["-b", jar, `${base}/courses/${courseId}`]);
  if (/Join your course community/i.test(html) && /Join on Telegram/i.test(html)) {
    console.log("PASS: Community section visible on student course page");
    return;
  }
  if (/community_telegram_url/i.test(html) || /column.*does not exist/i.test(html)) {
    console.error("FAIL: database column may be missing — run migration 0025");
    process.exit(1);
  }
  console.error("FAIL: Community section not rendered on /courses/" + courseId);
  console.error(html.slice(0, 1200));
  process.exit(1);
}

console.log("Testing course community on", base);
const jar = login();
const courseId = findCourseId(jar);
console.log("Course id:", courseId);
saveCommunityLinks(jar, courseId);
verifyStudentCoursePage(jar, courseId);
console.log("=== ALL PASSED ===");
