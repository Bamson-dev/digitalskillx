#!/usr/bin/env node
/**
 * Full production auth verification.
 * Admin: TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD
 * Student: TEST_STUDENT_EMAIL + TEST_STUDENT_PASSWORD (optional)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "https://www.digitalskillx.com";

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

function curl(args) {
  return execFileSync("curl", args, { encoding: "utf8" });
}

async function smoke() {
  console.log("=== SMOKE ===");
  const loginHtml = await fetch(`${base}/login`).then((r) => r.text());
  const adminHtml = await fetch(`${base}/admin/login`).then((r) => r.text());
  const studentForm =
    loginHtml.includes('action="/api/auth/login"') &&
    loginHtml.includes('method="POST"');
  const adminForm =
    adminHtml.includes('action="/api/auth/admin-login"') &&
    adminHtml.includes('method="POST"');
  console.log("  student form POST /api/auth/login:", studentForm ? "PASS" : "FAIL");
  console.log("  admin form POST /api/auth/admin-login:", adminForm ? "PASS" : "FAIL");
  return studentForm && adminForm;
}

function loginFlow(label, path, body, dashboardPath) {
  console.log(`\n=== ${label} ===`);
  const jar = join(mkdtempSync(join(tmpdir(), "auth-")), "cookies.txt");

  const loginOut = curl([
    "-s",
    "-D",
    "-",
    "-c",
    jar,
    "-b",
    jar,
    "-X",
    "POST",
    `${base}${path}`,
    "-d",
    new URLSearchParams(body).toString(),
    "-o",
    "/dev/null",
  ]);

  const loginLocation = loginOut.match(/^location: (.+)$/im)?.[1]?.trim();
  const loginCookies = loginOut.match(/^set-cookie:/gim)?.length ?? 0;
  console.log("  login redirect:", loginLocation ?? "(none)");
  console.log("  set-cookie count:", loginCookies);

  if (!loginLocation?.includes(dashboardPath)) {
    console.log("  FAIL: login did not redirect to dashboard");
    return false;
  }
  if (loginCookies === 0) {
    console.log("  FAIL: no session cookie set");
    return false;
  }

  const me = curl(["-s", "-b", jar, `${base}/api/auth/me`]);
  let meJson;
  try {
    meJson = JSON.parse(me);
  } catch {
    meJson = null;
  }
  console.log("  /api/auth/me authenticated:", meJson?.authenticated ?? meJson);

  const dashOut = curl([
    "-s",
    "-D",
    "-",
    "-b",
    jar,
    "-o",
    "/dev/null",
    `${base}${dashboardPath}`,
  ]);
  const dashStatus = dashOut.match(/^HTTP\/[^\s]+ (\d+)/)?.[1];
  const dashLocation = dashOut.match(/^location: (.+)$/im)?.[1]?.trim();
  console.log("  dashboard status:", dashStatus);
  console.log("  dashboard location:", dashLocation ?? "(none)");

  const ok = dashStatus === "200" || dashStatus === "308";
  console.log(ok ? "  PASS" : "  FAIL");
  return ok;
}

async function main() {
  console.log(`Production auth test: ${base}\n`);
  let allOk = true;

  allOk = (await smoke()) && allOk;

  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const ok = loginFlow(
      "ADMIN LOGIN",
      "/api/auth/admin-login",
      { email: adminEmail, password: adminPassword },
      "/admin/dashboard",
    );
    allOk = ok && allOk;
  } else {
    console.log("\n=== ADMIN LOGIN === SKIP (set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD)");
    allOk = false;
  }

  const studentEmail = process.env.TEST_STUDENT_EMAIL;
  const studentPassword = process.env.TEST_STUDENT_PASSWORD;
  if (studentEmail && studentPassword) {
    const ok = loginFlow(
      "STUDENT LOGIN",
      "/api/auth/login",
      { email: studentEmail, password: studentPassword, next: "/dashboard" },
      "/dashboard",
    );
    allOk = ok && allOk;
  } else {
    console.log("\n=== STUDENT LOGIN === SKIP (set TEST_STUDENT_EMAIL + TEST_STUDENT_PASSWORD)");
  }

  console.log(allOk ? "\n✅ ALL TESTS PASSED" : "\n❌ SOME TESTS FAILED");
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
