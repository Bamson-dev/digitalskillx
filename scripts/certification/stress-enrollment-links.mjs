#!/usr/bin/env node
/**
 * Concurrent Enrollment Link redemption stress test (production-safe).
 * Usage: node scripts/certification/stress-enrollment-links.mjs [baseUrl] [sizes]
 * Default sizes: 10,50,100 (500 optional via arg)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const sizes = (process.argv[3] ?? "10,50,100")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

function loadEnvFile(name) {
  const path = join(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
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
  return execFileSync("curl", ["-sL", "--max-time", "120", ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function adminLogin() {
  const jar = join(mkdtempSync(join(tmpdir(), "stress-admin-")), "c.txt");
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

function sleep(ms) {
  try {
    execFileSync("sleep", [String(Math.max(0.05, ms / 1000))]);
  } catch {
    /* ignore */
  }
}

function registerAndLogin(prefix, stamp, i) {
  const email = `${prefix}+${stamp}-${i}@digitalskillx.com`;
  const password = `Stress-${crypto.randomBytes(4).toString("hex")}!9A`;
  let lastErr = "unknown";
  for (let attempt = 0; attempt < 6; attempt++) {
    const regRaw = curl([
      "-X",
      "POST",
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify({ full_name: `Stress ${i}`, email, password }),
      `${base}/api/auth/register`,
    ]);
    let reg;
    try {
      reg = JSON.parse(regRaw);
    } catch {
      reg = { error: regRaw.slice(0, 120) };
    }
    if (!reg.error || /already exists/i.test(String(reg.error))) {
      lastErr = null;
      break;
    }
    lastErr = String(reg.error);
    if (/too many requests|rate/i.test(lastErr)) {
      sleep(1500 * (attempt + 1));
      continue;
    }
    throw new Error(`register ${email}: ${lastErr}`);
  }
  if (lastErr) throw new Error(`register ${email}: ${lastErr}`);

  const jar = join(mkdtempSync(join(tmpdir(), `stress-u-${i}-`)), "c.txt");
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
  const me = JSON.parse(curl(["-b", jar, `${base}/api/auth/me`]));
  if (!me.authenticated || !me.userId) {
    throw new Error(`login failed ${email}`);
  }
  // Gentle pacing to avoid auth rate limits when preparing large pools
  sleep(400);
  return { jar, email, userId: me.userId };
}

function createLink(adminJar, courseId, name, maxRedemptions) {
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
        courseIds: [courseId],
        status: "active",
        accessType: "public",
        maxRedemptions,
      }),
      `${base}/api/admin/enrollment-links`,
    ]),
  );
}

async function redeemAsync(jar, token) {
  const cookie = cookiesFromJar(jar);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${base}/api/enroll/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: "{}",
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { error: text.slice(0, 120), status: res.status };
      }
      return { status: res.status, ...json };
    } catch (err) {
      if (attempt === 2) {
        return {
          ok: false,
          code: "NETWORK",
          error: err instanceof Error ? err.message : String(err),
        };
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return { ok: false, code: "NETWORK", error: "exhausted" };
}

function cookiesFromJar(jarPath) {
  return readFileSync(jarPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const p = l.split("\t");
      return p.length >= 7 ? `${p[5]}=${p[6]}` : null;
    })
    .filter(Boolean)
    .join("; ");
}

console.log(`Enrollment-link stress → ${base}`);
console.log(`Sizes: ${sizes.join(", ")}\n`);

const adminJar = adminLogin();
const coursesHtml = curl(["-b", adminJar, `${base}/admin/courses`]);
const courseIds = [...coursesHtml.matchAll(/\/admin\/courses\/([0-9a-f-]{36})/gi)].map((m) => m[1]);
const unique = [...new Set(courseIds)];
let courseId = unique[0];
for (const id of unique) {
  const editor = curl(["-b", adminJar, `${base}/admin/courses/${id}`]);
  if (/Manage quiz|Add lesson|lesson_type/i.test(editor) && !/RC Course \d+/i.test(editor)) {
    courseId = id;
    break;
  }
}
if (!courseId) {
  console.error("FAIL: no course");
  process.exit(1);
}

let failed = 0;
const stamp = Date.now();
/** Shared user pool across sizes to avoid registration rate limits. */
const pool = [];
const POOL_TARGET = 40;

async function ensurePool(needed) {
  const target = Math.min(needed, POOL_TARGET);
  const prepStart = Date.now();
  while (pool.length < target) {
    const i = pool.length;
    try {
      pool.push(registerAndLogin("stress-el", stamp, `pool-${i}`));
    } catch (err) {
      console.log(`WARN | register pool ${i}: ${err instanceof Error ? err.message : err}`);
      sleep(2000);
      if (pool.length >= Math.min(8, target)) break;
    }
  }
  console.log(`pool ready ${pool.length}/${target} in ${Date.now() - prepStart}ms`);
}

for (const n of sizes) {
  console.log(`\n=== concurrency ${n} ===`);
  const uniqueNeeded = Math.min(n, POOL_TARGET);
  await ensurePool(uniqueNeeded);

  // Cap max redemptions below unique concurrency to verify LIMIT_REACHED under race.
  const maxRedemptions = Math.max(1, Math.floor(Math.min(n, pool.length) / 2));
  const create = createLink(adminJar, courseId, `Stress ${n} ${stamp}`, maxRedemptions);
  const token = create.plaintextToken;
  if (!token) {
    console.log(`FAIL | create link n=${n} — ${create.error ?? "no token"}`);
    failed++;
    continue;
  }

  if (pool.length < 5) {
    console.log(`FAIL | insufficient users for n=${n}`);
    failed++;
    continue;
  }

  // Idempotency probe: same user redeems twice concurrently
  const sameUser = pool[0];
  const idempStart = Date.now();
  const idemp = await Promise.all([
    redeemAsync(sameUser.jar, token),
    redeemAsync(sameUser.jar, token),
  ]);
  const idempOk =
    idemp.filter((r) => r.ok === true).length >= 1 &&
    idemp.every((r) => r.ok === true || r.code === "LIMIT_REACHED" || r.code === "UNAUTHORIZED" || r.code === "NETWORK");
  console.log(
    `${idempOk ? "PASS" : "FAIL"} | same-user concurrent idempotency — ${JSON.stringify(idemp.map((r) => ({ ok: r.ok, idempotent: r.idempotent, code: r.code }))).slice(0, 220)} (${Date.now() - idempStart}ms)`,
  );
  if (!idempOk) failed++;

  // Fresh link for multi-user race — fire n concurrent requests (cycling pool if needed)
  const create2 = createLink(adminJar, courseId, `Stress race ${n} ${stamp}`, maxRedemptions);
  const token2 = create2.plaintextToken;
  if (!token2) {
    console.log(`FAIL | create race link n=${n}`);
    failed++;
    continue;
  }

  const raceUsers = Array.from({ length: n }, (_, i) => pool[i % pool.length]);
  const raceStart = Date.now();
  const results = await Promise.all(raceUsers.map((u) => redeemAsync(u.jar, token2)));
  const wall = Date.now() - raceStart;
  const ok = results.filter((r) => r.ok === true && !r.idempotent);
  const idem = results.filter((r) => r.ok === true && r.idempotent);
  const limited = results.filter((r) => r.code === "LIMIT_REACHED");
  const errors = results.filter((r) => !r.ok && r.code !== "LIMIT_REACHED");

  const successCount = ok.length + idem.length;
  // Unique successful claimers cannot exceed maxRedemptions (row lock + limit)
  const uniqueSuccessUsers = new Set();
  for (let i = 0; i < results.length; i++) {
    if (results[i].ok === true) uniqueSuccessUsers.add(raceUsers[i].userId);
  }
  const uniqueOk = uniqueSuccessUsers.size <= maxRedemptions;
  const limitOk = uniqueOk && (successCount > 0 || limited.length > 0);
  const filledOk = uniqueSuccessUsers.size >= Math.min(maxRedemptions, pool.length) || limited.length > 0;
  const noHardErrors = errors.filter((e) => e.code !== "NETWORK").length === 0;

  const pass = limitOk && filledOk && noHardErrors && uniqueSuccessUsers.size > 0;
  console.log(
    `${pass ? "PASS" : "FAIL"} | race n=${n} max=${maxRedemptions} unique_ok=${uniqueSuccessUsers.size} success_resp=${successCount} limited=${limited.length} errors=${errors.length} wall_ms=${wall}`,
  );
  if (errors[0]) {
    console.log(`  first error: ${JSON.stringify(errors[0]).slice(0, 200)}`);
  }
  if (!pass) failed++;

  for (const linkId of [create.link?.id, create2.link?.id].filter(Boolean)) {
    try {
      curl([
        "-b",
        adminJar,
        "-X",
        "PATCH",
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify({ status: "disabled" }),
        `${base}/api/admin/enrollment-links/${linkId}`,
      ]);
    } catch {
      /* ignore */
    }
  }
}

console.log(`\n=== summary failed=${failed} ===`);
process.exit(failed ? 1 : 0);
