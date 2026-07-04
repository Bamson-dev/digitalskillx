#!/usr/bin/env node
/**
 * Admin login + create course smoke test.
 *
 * Usage:
 *   node scripts/test-admin-create-course.mjs [baseUrl]
 *
 * Reads TEST_ADMIN_PASSWORD or ADMIN_PASSWORD from .env.local when unset in env.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnvLocal() {
  const path = join(root, ".env.local");
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

loadDotEnvLocal();

const base = (process.argv[2] ?? process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const email = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const password = process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;

if (!password) {
  console.error("Set TEST_ADMIN_PASSWORD or ADMIN_PASSWORD");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", args, { encoding: "utf8" });
}

function login() {
  const jar = join(mkdtempSync(join(tmpdir(), "course-test-")), "cookies.txt");
  const out = curl([
    "-s",
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
  const location = out.match(/^location: (.+)$/im)?.[1]?.trim();
  if (!location?.includes("/admin/dashboard")) {
    console.error("FAIL: admin login redirect:", location ?? "(none)");
    process.exit(1);
  }
  console.log("PASS: admin login →", location);
  return jar;
}

function fetchCoursesPage(jar) {
  const out = curl([
    "-s",
    "-D",
    "-",
    "-b",
    jar,
    `${base}/admin/courses`,
    "-o",
    "/tmp/admin-courses-body.html",
  ]);
  const status = out.match(/^HTTP\/[\d.]+ (\d+)/m)?.[1];
  const body = readFileSync("/tmp/admin-courses-body.html", "utf8");
  if (status !== "200") {
    console.error("FAIL: GET /admin/courses status", status);
    console.error(body.slice(0, 500));
    process.exit(1);
  }
  if (body.includes("Something went wrong")) {
    console.error("FAIL: courses page shows global error");
    process.exit(1);
  }
  if (!body.includes("Create course")) {
    console.error("FAIL: courses page missing create form");
    process.exit(1);
  }
  console.log("PASS: GET /admin/courses loads create form");
  return body;
}

function extractActionId(html) {
  const match =
    html.match(/formAction\)\s*,\s*"([^"]+)"/) ??
    html.match(/createCourse[^"]*"OnServer[^"]*"([^"]+)"/) ??
    html.match(/"id":"([a-f0-9]{40,})"/);
  return match?.[1] ?? null;
}

function createCourse(jar, html) {
  const actionId = extractActionId(html);
  const title = `Test course ${Date.now()}`;

  const args = [
    "-s",
    "-D",
    "-",
    "-b",
    jar,
    "-c",
    jar,
    "-X",
    "POST",
    `${base}/admin/courses`,
    "-H",
    "Content-Type: application/x-www-form-urlencoded",
    "-d",
    new URLSearchParams({ title, "1_title": title }).toString(),
    "-o",
    "/tmp/admin-create-course-out.html",
  ];

  if (actionId) {
    args.splice(args.length - 4, 0, "-H", `Next-Action: ${actionId}`);
  }

  const out = curl(args);
  const status = out.match(/^HTTP\/[\d.]+ (\d+)/m)?.[1];
  const location = out.match(/^location: (.+)$/im)?.[1]?.trim();
  const body = readFileSync("/tmp/admin-create-course-out.html", "utf8");

  if (location?.includes("/admin/courses/")) {
    console.log("PASS: create course redirect →", location);
    return location;
  }

  if (body.includes("Something went wrong")) {
    console.error("FAIL: create course triggered global error");
    process.exit(1);
  }

  if (body.includes("Failed to create") || body.includes("Could not create")) {
    console.error("FAIL: create course error in page:", body.match(/text-red-600[^>]*>([^<]+)/)?.[1]);
    process.exit(1);
  }

  console.error("FAIL: unexpected create response status", status, "location", location);
  console.error(body.slice(0, 800));
  process.exit(1);
}

console.log("=== Admin create course test ===");
console.log("base:", base);
const jar = login();
const html = fetchCoursesPage(jar);
createCourse(jar, html);
console.log("=== ALL PASSED ===");
