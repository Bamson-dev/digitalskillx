#!/usr/bin/env node
/** Test module delete via server action on production. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const courseId = process.argv[3] ?? "5125b8f8-953f-413e-8e62-68207210b69b";

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

const jar = join(mkdtempSync(join(tmpdir(), "del-mod-")), "cookies.txt");
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

const pageUrl = `${base}/admin/courses/${courseId}`;

function countModules(html) {
  const ids = [...html.matchAll(/name="id"[^>]*value="([0-9a-f-]{36})"/gi)].map((m) => m[1]);
  return ids.length;
}

function findDeleteModuleActionId(html) {
  const actions = [...html.matchAll(/"\$ACTION_ID_([0-9a-f]+)"/gi)].map((m) => m[1]);
  return actions[actions.length - 1] ?? actions[0];
}

function findModuleToDelete(html) {
  const blocks = html.split('aria-label="Delete module"');
  if (blocks.length < 2) return null;
  const beforeDelete = blocks[blocks.length - 2];
  const idMatch = [...beforeDelete.matchAll(/name="id"[^>]*value="([0-9a-f-]{36})"/gi)];
  return idMatch[idMatch.length - 1]?.[1] ?? null;
}

let html = curl(["-b", jar, pageUrl]);
const before = countModules(html);
const moduleId = findModuleToDelete(html);

if (!moduleId) {
  console.log("No module found to delete; creating test module first...");
  const createAction = html.match(/"\$ACTION_ID_([0-9a-f]+)"/i)?.[1];
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
    "title=Delete test module",
  ]);
  html = curl(["-b", jar, pageUrl]);
}

const moduleId2 = findModuleToDelete(html) ?? moduleId;
if (!moduleId2) {
  console.error("FAIL: could not find module id");
  process.exit(1);
}

console.log("Deleting module", moduleId2, "from course", courseId);
console.log("Modules before:", countModules(html));

const actionId = findDeleteModuleActionId(html);
const deleteRes = curl([
  "-b",
  jar,
  "-X",
  "POST",
  pageUrl,
  "-H",
  `Next-Action: ${actionId}`,
  "-F",
  `id=${moduleId2}`,
  "-F",
  `course_id=${courseId}`,
]);

console.log("Delete response snippet:", deleteRes.slice(0, 300));

const afterHtml = curl(["-b", jar, pageUrl]);
const after = countModules(afterHtml);
console.log("Modules after:", after);

if (afterHtml.includes(moduleId2)) {
  console.error("FAIL: module id still on page after delete");
  process.exit(1);
}

if (after >= countModules(html)) {
  console.error("FAIL: module count did not decrease");
  process.exit(1);
}

console.log("PASS: module deleted");
console.log("=== ALL PASSED ===");
