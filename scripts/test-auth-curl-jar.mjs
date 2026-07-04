#!/usr/bin/env node
/**
 * Cookie-jar login test using curl (handles Set-Cookie correctly).
 * TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD required.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "https://www.digitalskillx.com";
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

if (!email || !password) {
  console.error("Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD");
  process.exit(1);
}

const jar = join(mkdtempSync(join(tmpdir(), "auth-")), "cookies.txt");

function curl(args) {
  return execFileSync("curl", args, { encoding: "utf8" });
}

console.log(`Cookie-jar admin login test at ${base}`);
console.log("Cookie jar:", jar);

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
  `${base}/api/auth/admin-login`,
  "-d",
  `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
  "-o",
  "/dev/null",
]);

const loginLocation = loginOut.match(/^location: (.+)$/im)?.[1]?.trim();
const loginCookies = loginOut.match(/^set-cookie:/gim)?.length ?? 0;
console.log("\nLogin response:");
console.log("  location:", loginLocation);
console.log("  set-cookie headers:", loginCookies);

const dashOut = curl([
  "-s",
  "-D",
  "-",
  "-b",
  jar,
  "-o",
  "/dev/null",
  `${base}/admin/dashboard`,
]);

const dashStatus = dashOut.match(/^HTTP\/[^\s]+ (\d+)/)?.[1];
const dashLocation = dashOut.match(/^location: (.+)$/im)?.[1]?.trim();
console.log("\nDashboard response:");
console.log("  status:", dashStatus);
console.log("  location:", dashLocation ?? "(none)");

const ok =
  loginLocation?.includes("/admin/dashboard") &&
  dashStatus === "200";

console.log(ok ? "\nPASS — admin session persists" : "\nFAIL — session not accepted");
process.exit(ok ? 0 : 1);
