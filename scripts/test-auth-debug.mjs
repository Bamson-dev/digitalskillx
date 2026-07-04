#!/usr/bin/env node
/** Inspect cookie jar after login without printing secrets. */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "https://www.digitalskillx.com";
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;
if (!email || !password) process.exit(1);

const jar = join(mkdtempSync(join(tmpdir(), "auth-")), "cookies.txt");

execFileSync(
  "curl",
  [
    "-s",
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
  ],
  { encoding: "utf8" },
);

const jarText = readFileSync(jar, "utf8");
const lines = jarText.split("\n").filter((l) => l && !l.startsWith("#"));
console.log("Cookie jar entries:", lines.length);
for (const line of lines) {
  const parts = line.split("\t");
  const name = parts[5] ?? "?";
  const value = parts[6] ?? "";
  console.log(`  ${name}: len=${value.length}, prefix=${value.slice(0, 12)}...`);
}

const me = execFileSync(
  "curl",
  ["-s", "-b", jar, `${base}/api/auth/me`],
  { encoding: "utf8" },
);
console.log("\n/api/auth/me:", me);

const dash = execFileSync(
  "curl",
  ["-s", "-D", "-", "-b", jar, "-o", "/dev/null", `${base}/admin/dashboard`],
  { encoding: "utf8" },
);
const status = dash.match(/^HTTP\/[^\s]+ (\d+)/)?.[1];
const loc = dash.match(/^location: (.+)$/im)?.[1]?.trim();
console.log("\n/admin/dashboard:", status, loc ?? "");
