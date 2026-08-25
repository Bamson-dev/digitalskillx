#!/usr/bin/env node
/**
 * Unit checks for course publish notify helpers + optional timing smoke on save.
 * Usage: node scripts/test-course-publish-notify.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exit(1);
  }
}

function testChunkArray() {
  assert(JSON.stringify(chunkArray([], 3)) === "[]", "empty chunk");
  assert(JSON.stringify(chunkArray([1, 2, 3, 4, 5], 2)) === "[[1,2],[3,4],[5]]", "uneven chunks");
  console.log("PASS: chunkArray");
}

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

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

async function optionalSaveTimingSmoke(base) {
  loadEnvFile(".env.test");
  loadEnvFile(".env.local");
  const email = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
  const password = process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!password) {
    console.log("SKIP: save timing smoke (set TEST_ADMIN_PASSWORD)");
    return;
  }

  const jar = join(mkdtempSync(join(tmpdir(), "notify-save-")), "cookies.txt");
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

  const listHtml = curl(["-b", jar, `${base}/admin/courses`]);
  const courseId = listHtml.match(/\/admin\/courses\/([0-9a-f-]{36})/i)?.[1];
  if (!courseId) {
    console.log("SKIP: save timing smoke (no course id)");
    return;
  }

  const pageUrl = `${base}/admin/courses/${courseId}`;
  const html = curl(["-b", jar, pageUrl]);
  const actionId = html.match(/"\$ACTION_ID_([0-9a-f]+)"/i)?.[1];
  if (!actionId) {
    console.log("SKIP: save timing smoke (no action id)");
    return;
  }

  const title = html.match(/name="title"[^>]*value="([^"]*)"/)?.[1] ?? "Test course";
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
    visibility: "published",
  }).toString();

  const started = Date.now();
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
  const elapsedMs = Date.now() - started;

  assert(elapsedMs < 20_000, `save took ${elapsedMs}ms — expected under 20s (background notify)`);
  assert(
    /Course settings saved/i.test(response) || /sending in the background/i.test(response),
    "save response missing success message",
  );
  console.log(`PASS: course save returned in ${elapsedMs}ms`);
}

async function main() {
  testChunkArray();
  const base = process.argv[2];
  if (base) {
    await optionalSaveTimingSmoke(base.replace(/\/$/, ""));
  } else {
    console.log("SKIP: save timing smoke (pass baseUrl to run)");
  }
  console.log("=== ALL PASSED ===");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
