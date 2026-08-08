#!/usr/bin/env node
/**
 * Production smoke for enrollment-link bulk delete.
 * Usage: node scripts/certification/test-bulk-delete-enrollment-links.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");

function loadEnv(name) {
  if (!existsSync(name)) return;
  for (const line of readFileSync(name, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(".env.test");

const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
if (!adminPassword) {
  console.error("Set TEST_ADMIN_PASSWORD in .env.test");
  process.exit(1);
}

function curlRaw(args) {
  return execFileSync("curl", ["-sL", "--max-time", "90", "-w", "\n__CODE__%{http_code}", ...args], {
    encoding: "utf8",
    maxBuffer: 20 << 20,
  });
}

function request(args) {
  const raw = curlRaw(args);
  const idx = raw.lastIndexOf("\n__CODE__");
  const body = idx >= 0 ? raw.slice(0, idx) : raw;
  const code = idx >= 0 ? raw.slice(idx + 9).trim() : "";
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  return { body, code, json };
}

function adminLogin() {
  const jar = join(mkdtempSync(join(tmpdir(), "bulk-del-")), "c.txt");
  request([
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

console.log(`Bulk delete smoke → ${base}\n`);

let passed = false;
for (let attempt = 1; attempt <= 24; attempt++) {
  const jar = adminLogin();
  const courses = request(["-b", jar, `${base}/admin/courses`]);
  const courseId = courses.body.match(/\/admin\/courses\/([0-9a-f-]{36})/i)?.[1];
  if (!courseId) {
    console.log(`attempt ${attempt}: no course id (http ${courses.code})`);
    await new Promise((r) => setTimeout(r, 10000));
    continue;
  }

  const stamp = Date.now();
  const createPayload = (name) =>
    request([
      "-b",
      jar,
      "-X",
      "POST",
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify({
        name,
        courseIds: [courseId],
        status: "active",
        accessType: "public",
      }),
      `${base}/api/admin/enrollment-links`,
    ]);

  const a = createPayload(`BulkTest A ${stamp}`);
  const b = createPayload(`BulkTest B ${stamp}`);
  if (!a.json?.link?.id || !b.json?.link?.id) {
    console.log(
      `attempt ${attempt}: create failed`,
      a.code,
      a.json?.error ?? a.body.slice(0, 120),
      b.json?.error ?? b.body.slice(0, 120),
    );
    await new Promise((r) => setTimeout(r, 10000));
    continue;
  }

  const del = request([
    "-b",
    jar,
    "-X",
    "DELETE",
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify({ ids: [a.json.link.id, b.json.link.id] }),
    `${base}/api/admin/enrollment-links`,
  ]);
  console.log(
    `attempt ${attempt}: delete http=${del.code} body=${JSON.stringify(del.json ?? del.body.slice(0, 160))}`,
  );

  if (del.json?.ok === true && del.json.deleted === 2) {
    const list = request([
      "-b",
      jar,
      `${base}/api/admin/enrollment-links?search=${encodeURIComponent(`BulkTest A ${stamp}`)}`,
    ]);
    const leftover = (list.json?.links ?? []).filter(
      (l) => l.id === a.json.link.id || l.id === b.json.link.id,
    );
    if (leftover.length !== 0) {
      console.log("FAIL | deleted links still listed");
      process.exit(1);
    }
    console.log("PASS | bulk delete removed 2 links");

    const empty = request([
      "-b",
      jar,
      "-X",
      "DELETE",
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify({ ids: [] }),
      `${base}/api/admin/enrollment-links`,
    ]);
    if (empty.code !== "400" || !/at least one/i.test(String(empty.json?.error ?? ""))) {
      console.log("FAIL | empty selection not rejected", empty.code, empty.json);
      process.exit(1);
    }
    console.log("PASS | empty selection rejected");
    passed = true;
    break;
  }

  await new Promise((r) => setTimeout(r, 12000));
}

if (!passed) {
  console.log("FAIL | bulk delete API not available on production yet");
  process.exit(1);
}

console.log("\n=== production bulk delete certified ===");
