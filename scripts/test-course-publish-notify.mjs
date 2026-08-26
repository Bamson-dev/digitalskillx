#!/usr/bin/env node
/**
 * Live test: admin login + force course publish notify via API (awaits Resend).
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
  return execFileSync("curl", ["-sL", "--max-time", "120", ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function liveNotifySmoke(base) {
  loadEnvFile(".env.test");
  loadEnvFile(".env.local");
  const email = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
  const password = process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  const cron = process.env.CRON_SECRET?.trim();
  if (!password) {
    console.log("SKIP: notify smoke (set TEST_ADMIN_PASSWORD)");
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
  assert(courseId, "no course id on /admin/courses");

  const started = Date.now();
  const sessionBody = curl([
    "-b",
    jar,
    "-X",
    "POST",
    `${base}/api/admin/courses/${courseId}/notify-publish?force=1`,
  ]);
  console.log("SESSION notify:", sessionBody.slice(0, 800), `(${Date.now() - started}ms)`);

  let payload;
  try {
    payload = JSON.parse(sessionBody);
  } catch {
    assert(false, `notify response not JSON: ${sessionBody.slice(0, 400)}`);
  }

  assert(payload.ok === true, `notify not ok: ${sessionBody.slice(0, 400)}`);
  assert(typeof payload.emailsSent === "number", "emailsSent missing — deploy may be stale");
  assert(
    payload.emailsSent > 0 || payload.notified > 0 || Boolean(payload.reason),
    `no send evidence: ${sessionBody.slice(0, 400)}`,
  );
  console.log(
    `PASS: notify course ${courseId} notified=${payload.notified} emailsSent=${payload.emailsSent}`,
  );

  if (cron) {
    const cronBody = curl([
      "-X",
      "POST",
      "-H",
      `Authorization: Bearer ${cron}`,
      `${base}/api/admin/courses/${courseId}/notify-publish?force=1`,
    ]);
    console.log("CRON notify:", cronBody.slice(0, 500));
    const cronPayload = JSON.parse(cronBody);
    assert(cronPayload.ok === true || cronPayload.error, "cron notify unexpected");
    if (cronPayload.ok) console.log("PASS: cron auth notify works");
  }
}

async function main() {
  testChunkArray();
  const base = process.argv[2];
  if (base) {
    liveNotifySmoke(base.replace(/\/$/, ""));
  } else {
    console.log("SKIP: live notify smoke (pass baseUrl to run)");
  }
  console.log("=== ALL PASSED ===");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
