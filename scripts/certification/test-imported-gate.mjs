#!/usr/bin/env node
/**
 * Production gate test for IMPORTED_STUDENTS enrollment links.
 * Usage: node scripts/certification/test-imported-gate.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";

const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");

function loadEnvFile(name) {
  if (!existsSync(name)) return;
  for (const line of readFileSync(name, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvFile(".env.test");

const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
if (!adminPassword) {
  console.error("Set TEST_ADMIN_PASSWORD in .env.test");
  process.exit(1);
}

function curl(args) {
  return execFileSync("curl", ["-sL", "--max-time", "90", ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function adminLogin() {
  const jar = join(mkdtempSync(join(tmpdir(), "gate-admin-")), "c.txt");
  curl([
    "-c",
    jar,
    "-b",
    jar,
    "-X",
    "POST",
    `${base}/api/auth/admin-login`,
    "-d",
    new URLSearchParams({ email: adminEmail, password: adminPassword }).toString(),
    "-o",
    "/dev/null",
  ]);
  return jar;
}

function registerAndLogin(prefix) {
  const stamp = Date.now();
  const email = `${prefix}+${stamp}@digitalskillx.com`;
  const password = `Gate-${crypto.randomBytes(4).toString("hex")}!9A`;
  const reg = JSON.parse(
    curl([
      "-X",
      "POST",
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify({ full_name: `Gate ${prefix}`, email, password }),
      `${base}/api/auth/register`,
    ]),
  );
  if (reg.error && !/already exists/i.test(String(reg.error))) {
    throw new Error(`register failed: ${reg.error}`);
  }
  const jar = join(mkdtempSync(join(tmpdir(), `gate-${prefix}-`)), "c.txt");
  curl([
    "-c",
    jar,
    "-b",
    jar,
    "-X",
    "POST",
    `${base}/api/auth/login`,
    "-d",
    new URLSearchParams({ email, password, next: "/dashboard" }).toString(),
    "-o",
    "/dev/null",
  ]);
  return { jar, email, password };
}

function createImportedLink(adminJar, courseId, name) {
  return JSON.parse(
    curl([
      "-b",
      adminJar,
      "-X",
      "POST",
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify({
        name,
        courseIds: courseId ? [courseId] : [],
        status: "active",
        accessType: "imported_students",
      }),
      `${base}/api/admin/enrollment-links`,
    ]),
  );
}

function redeem(jar, token) {
  return JSON.parse(
    curl([
      "-b",
      jar,
      "-X",
      "POST",
      "-H",
      "Content-Type: application/json",
      "-d",
      "{}",
      `${base}/api/enroll/${encodeURIComponent(token)}`,
    ]),
  );
}

console.log(`IMPORTED_STUDENTS gate test → ${base}\n`);

const adminJar = adminLogin();
const coursesHtml = curl(["-b", adminJar, `${base}/admin/courses`]);
const courseId = coursesHtml.match(/\/admin\/courses\/([0-9a-f-]{36})/i)?.[1];
if (!courseId) {
  console.error("FAIL: no course id");
  process.exit(1);
}

const stamp = Date.now();
let passed = 0;
let failed = 0;

function record(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failed++;
}

// 1) Normal registered user → IMPORTED_ONLY
{
  const create = createImportedLink(adminJar, courseId, `Gate normal ${stamp}`);
  const token = create.plaintextToken;
  if (!token) {
    record("Normal user blocked (IMPORTED_ONLY)", false, create.error ?? "no token");
  } else {
    const { jar } = registerAndLogin("gate-normal");
    const r = redeem(jar, token);
    const blocked =
      r.ok !== true &&
      (/IMPORTED|invited|only/i.test(String(r.error ?? r.code ?? "")) ||
        r.code === "IMPORTED_ONLY");
    record(
      "Normal user blocked (IMPORTED_ONLY)",
      blocked,
      JSON.stringify(r).slice(0, 180),
    );
  }
}

// 2) Bulk-imported user → PASS (create row via small CSV import)
{
  const importEmail = `gate-imported+${stamp}@digitalskillx.com`;
  const csvPath = join(mkdtempSync(join(tmpdir(), "gate-csv-")), "students.csv");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(csvPath, `full_name,email\nGate Imported,${importEmail}\n`);
  const csvRes = JSON.parse(
    curl([
      "-b",
      adminJar,
      "-X",
      "POST",
      `${base}/api/admin/bulk-students`,
      "-F",
      `csv_file=@${csvPath}`,
      "-F",
      `default_course_id=${courseId}`,
      "-F",
      "force_sync=1",
    ]),
  );
  const bulkOk = Boolean(csvRes.bulkSummary || csvRes.jobId || csvRes.message) && !csvRes.error;
  record("Bulk import row for gate test", bulkOk, csvRes.message ?? csvRes.error ?? "");

  const create = createImportedLink(adminJar, courseId, `Gate imported ${stamp}`);
  const token = create.plaintextToken;
  if (!token) {
    record("Imported student redeem PASS", false, create.error ?? "no token");
  } else {
    const email = importEmail;
    const password = `Gate-${crypto.randomBytes(4).toString("hex")}!9A`;
    JSON.parse(
      curl([
        "-X",
        "POST",
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify({ full_name: "Gate Imported", email, password }),
        `${base}/api/auth/register`,
      ]),
    );
    const jar = join(mkdtempSync(join(tmpdir(), "gate-imp-")), "c.txt");
    curl([
      "-c",
      jar,
      "-b",
      jar,
      "-X",
      "POST",
      `${base}/api/auth/login`,
      "-d",
      new URLSearchParams({ email, password, next: "/dashboard" }).toString(),
      "-o",
      "/dev/null",
    ]);
    const r = redeem(jar, token);
    record("Imported student redeem PASS", r.ok === true, JSON.stringify(r).slice(0, 180));
  }
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed) process.exit(1);
