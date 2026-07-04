#!/usr/bin/env node
/**
 * Production E2E: admin login + create course via server action.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const email = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const password = process.env.TEST_ADMIN_PASSWORD;

if (!password) {
  console.error("Set TEST_ADMIN_PASSWORD");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", args, { encoding: "utf8" });
}

function login() {
  const jar = join(mkdtempSync(join(tmpdir(), "course-e2e-")), "cookies.txt");
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
    console.error("FAIL login:", location ?? out.slice(0, 300));
    process.exit(1);
  }
  console.log("PASS login →", location);
  return jar;
}

function loadCoursesPage(jar) {
  const bodyPath = join(tmpdir(), `courses-${Date.now()}.html`);
  const out = curl(["-s", "-D", "-", "-b", jar, `${base}/admin/courses`, "-o", bodyPath]);
  const status = out.match(/^HTTP\/[\d.]+ (\d+)/m)?.[1];
  const body = readFileSync(bodyPath, "utf8");
  if (status !== "200") {
    console.error("FAIL courses page status", status);
    process.exit(1);
  }
  if (body.includes("Something went wrong")) {
    console.error("FAIL courses page shows global error");
    process.exit(1);
  }
  console.log("PASS courses page loaded");
  return { body, bodyPath };
}

function extractNextAction(html) {
  const patterns = [
    /\\"id\\":\\"([a-f0-9]{40,})\\"/g,
    /"id":"([a-f0-9]{40,})"/g,
    /createCourse[\s\S]{0,200}?([a-f0-9]{40,})/,
  ];
  for (const pattern of patterns) {
    const matches = [...html.matchAll(pattern)].map((m) => m[1]);
    if (matches.length) return matches[matches.length - 1];
  }
  return null;
}

function createCourse(jar, html) {
  const actionId = extractNextAction(html);
  const title = `E2E test course ${Date.now()}`;
  const bodyPath = join(tmpdir(), `create-out-${Date.now()}.html`);

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
    "-H",
    "Accept: text/x-component",
  ];
  if (actionId) args.push("-H", `Next-Action: ${actionId}`);
  args.push(
    "-d",
    `$1=${encodeURIComponent(JSON.stringify([{ error: undefined }]))}&title=${encodeURIComponent(title)}`,
    "-o",
    bodyPath,
  );

  const out = curl(args);
  const status = out.match(/^HTTP\/[\d.]+ (\d+)/m)?.[1];
  const location = out.match(/^location: (.+)$/im)?.[1]?.trim();
  const body = readFileSync(bodyPath, "utf8");

  if (location?.includes("/admin/courses/")) {
    console.log("PASS create course redirect →", location);
    return true;
  }

  if (body.includes("Something went wrong")) {
    console.error("FAIL create course global error (status", status, ")");
    return false;
  }

  if (body.includes("new row violates row-level security") || body.includes("Failed to create")) {
    console.error("FAIL RLS or create error in response");
    console.error(body.slice(0, 600));
    return false;
  }

  console.error("FAIL unexpected response status", status, "location", location);
  console.error("actionId", actionId ?? "(not found)");
  console.error(body.slice(0, 800));
  return false;
}

console.log("=== Course create E2E ===", base);
const jar = login();
const { body } = loadCoursesPage(jar);
const ok = createCourse(jar, body);
process.exit(ok ? 0 : 1);
