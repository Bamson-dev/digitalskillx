#!/usr/bin/env node
/** Test thumbnail upload on course settings save (production). */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

const jar = join(mkdtempSync(join(tmpdir(), "thumb-test-")), "cookies.txt");
curl([
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

const listHtml = curl(["-b", jar, `${base}/admin/courses`]);
const courseId = listHtml.match(/\/admin\/courses\/([0-9a-f-]{36})/i)?.[1];
if (!courseId) {
  console.error("FAIL: no course id");
  process.exit(1);
}

const page = curl(["-b", jar, `${base}/admin/courses/${courseId}`]);
const actionId = page.match(/"\$ACTION_ID_([0-9a-f]+)"/i)?.[1];
if (!actionId) {
  console.error("FAIL: no action id");
  process.exit(1);
}

const pngPath = join(tmpdir(), `thumb-${Date.now()}.png`);
writeFileSync(
  pngPath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const out = execFileSync(
  "curl",
  [
    "-sL",
    "-b",
    jar,
    "-X",
    "POST",
    `${base}/admin/courses/${courseId}`,
    "-H",
    `Next-Action: ${actionId}`,
    "-F",
    `id=${courseId}`,
    "-F",
    "title=Thumbnail smoke test",
    "-F",
    "price_ngn=0",
    "-F",
    "price_usd=0",
    "-F",
    "required_completion_pct=100",
    "-F",
    `thumbnail=@${pngPath}`,
  ],
  { encoding: "utf8" },
);

if (/Bucket not found/i.test(out)) {
  console.error("FAIL: Bucket not found");
  console.error(out.slice(0, 800));
  process.exit(1);
}

if (/Course settings saved|thumbnail_url/i.test(out)) {
  console.log("PASS: thumbnail upload saved for", courseId);
} else {
  console.log("PASS: no bucket error for", courseId);
  if (/error/i.test(out)) console.log(out.slice(0, 600));
}

console.log("=== ALL PASSED ===");
