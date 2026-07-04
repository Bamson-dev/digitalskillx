#!/usr/bin/env node
/** Test YouTube import uses real video/playlist titles for module + lessons. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const courseId = process.argv[3];
const videoUrl = process.argv[4] ?? "https://www.youtube.com/watch?v=jNQXAC9IVRw"; // "Me at the zoo"

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

const jar = join(mkdtempSync(join(tmpdir(), "yt-import-")), "cookies.txt");
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

let targetCourseId = courseId;
if (!targetCourseId) {
  const html = curl(["-b", jar, `${base}/admin/courses`]);
  targetCourseId = html.match(/\/admin\/courses\/([0-9a-f-]{36})/i)?.[1];
}
if (!targetCourseId) {
  console.error("FAIL: no course id");
  process.exit(1);
}

const importRes = curl([
  "-b",
  jar,
  "-X",
  "POST",
  `${base}/api/admin/lesson-import`,
  "-H",
  "Content-Type: application/json",
  "-d",
  JSON.stringify({
    courseId: targetCourseId,
    url: videoUrl,
    source: "youtube_video",
  }),
]);

const json = JSON.parse(importRes);
if (json.error) {
  console.error("FAIL import:", json.error);
  process.exit(1);
}
console.log("Import result:", json);

const page = curl(["-b", jar, `${base}/admin/courses/${targetCourseId}`]);
if (/Imported from YouTube/i.test(page)) {
  console.error('FAIL: page still shows "Imported from YouTube"');
  process.exit(1);
}

const moduleTitle = page.match(/name="title"[^>]*value="([^"]+)"/)?.[1];
console.log("First module title on page:", moduleTitle);

if (moduleTitle === "Imported from YouTube") {
  console.error("FAIL: module still named Imported from YouTube");
  process.exit(1);
}

if (moduleTitle && /Me at the zoo|Video /i.test(moduleTitle + page)) {
  console.log("PASS: real YouTube title used");
} else if (json.imported > 0 || json.skipped > 0) {
  console.log("PASS: import completed without generic YouTube module title");
} else {
  console.error("FAIL: unexpected state");
  process.exit(1);
}

console.log("=== ALL PASSED ===");
