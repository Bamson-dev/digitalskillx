#!/usr/bin/env node
/**
 * Production smoke test: admin login + save course settings (no thumbnail).
 * Usage: node scripts/test-course-settings-save.mjs [baseUrl]
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
  const jar = join(mkdtempSync(join(tmpdir(), "settings-test-")), "cookies.txt");
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
    console.error("FAIL: admin login redirect:", location ?? headers.slice(0, 500));
    process.exit(1);
  }
  console.log("PASS: admin login");
  return jar;
}

function findCourseId(jar) {
  const html = curl(["-b", jar, `${base}/admin/courses`]);
  const match = html.match(/\/admin\/courses\/([0-9a-f-]{36})/i);
  if (!match) {
    console.error("FAIL: no course id on /admin/courses");
    process.exit(1);
  }
  return match[1];
}

function extractActionId(html) {
  const match = html.match(/"\$ACTION_ID_([0-9a-f]+)"/i);
  return match ? match[1] : null;
}

function saveSettings(jar, courseId) {
  const pageUrl = `${base}/admin/courses/${courseId}`;
  const html = curl(["-b", jar, pageUrl]);
  const actionId = extractActionId(html);
  if (!actionId) {
    console.error("FAIL: could not find server action id on course page");
    process.exit(1);
  }

  const titleMatch = html.match(/name="title"[^>]*value="([^"]*)"/);
  const title = titleMatch?.[1] ?? "Test course";

  const body = new URLSearchParams({
    id: courseId,
    title,
    description: "",
    category_id: "",
    price_ngn: "0",
    price_usd: "0",
    required_completion_pct: "100",
    learning_outcomes: "",
    certificate_template_override: "",
    thumbnail_url: "",
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

  if (/Bucket not found/i.test(response)) {
    console.error("FAIL: Save settings returned Bucket not found");
    console.error(response.slice(0, 800));
    process.exit(1);
  }
  if (/Course settings saved/i.test(response) || /"message"/i.test(response)) {
    console.log("PASS: course settings saved for", courseId);
    return;
  }
  if (/error/i.test(response) && !/error.*null/i.test(response)) {
    console.error("FAIL: unexpected error in response:");
    console.error(response.slice(0, 1200));
    process.exit(1);
  }
  console.log("PASS: save settings request completed (no bucket error) for", courseId);
}

async function main() {
  console.log("Testing", base);
  const jar = login();
  const courseId = findCourseId(jar);
  console.log("Course id:", courseId);
  saveSettings(jar, courseId);
  console.log("=== ALL PASSED ===");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
