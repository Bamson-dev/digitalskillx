#!/usr/bin/env node
/** Verify guest checkout: unauthenticated initialize returns Paystack URL (no login/email required). */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");

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

function curlJson(args) {
  const out = execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  try {
    return JSON.parse(out);
  } catch {
    return { _raw: out };
  }
}

function curl(args) {
  return execFileSync("curl", ["-sL", ...args], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
}

console.log("Testing guest checkout on", base);

const home = curl([base]);
const courseMatch = home.match(/\/course\/([0-9a-f-]{36})/i);
if (!courseMatch) {
  console.error("FAIL: no published course found on homepage");
  process.exit(1);
}

const courseId = courseMatch[1];
console.log("Course:", courseId);

const coursePage = curl([`${base}/course/${courseId}`]);
const hasEmailBlocker = /Add an email address to your profile before enrolling/i.test(coursePage);
console.log("Course page email blocker text:", hasEmailBlocker);
if (hasEmailBlocker) {
  console.error("FAIL: old email requirement still in page bundle/HTML");
  process.exit(1);
}

const init = curlJson([
  "-X",
  "POST",
  `${base}/api/payments/initialize`,
  "-H",
  "Content-Type: application/json",
  "-d",
  JSON.stringify({ courseId, currency: "NGN" }),
]);

console.log("Initialize response keys:", Object.keys(init).join(", "));

if (init.error?.includes("sign in")) {
  console.error("FAIL: initialize still requires sign in:", init.error);
  process.exit(1);
}

if (init.error?.includes("email address to your profile")) {
  console.error("FAIL: initialize still requires profile email:", init.error);
  process.exit(1);
}

if (init.enrolled) {
  console.log("OK: course is free — guest enrolled without auth");
  process.exit(0);
}

if (!init.authorizationUrl || !init.reference) {
  console.error("FAIL: expected Paystack authorizationUrl, got:", init);
  process.exit(1);
}

if (!init.authorizationUrl.includes("paystack.com")) {
  console.error("FAIL: authorizationUrl is not Paystack:", init.authorizationUrl);
  process.exit(1);
}

console.log("OK: guest checkout returns Paystack URL without login");
console.log("Reference:", init.reference);
