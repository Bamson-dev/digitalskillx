#!/usr/bin/env node
/** Test admin preview as student: GET /courses/:id */
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
  return execFileSync("curl", ["-sL", "-w", "\nHTTP:%{http_code}", ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

const jar = join(mkdtempSync(join(tmpdir(), "preview-")), "cookies.txt");
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

const out = curl(["-b", jar, `${base}/courses/${courseId}`]);
const status = out.match(/HTTP:(\d+)/)?.[1];
const body = out.replace(/\nHTTP:\d+$/, "");

console.log("URL:", `${base}/courses/${courseId}`);
console.log("Status:", status);

if (status === "404" || /This page could not be found/i.test(body)) {
  console.error("FAIL: 404 on student course preview");
  process.exit(1);
}

if (/Admin preview/i.test(body)) {
  console.log("PASS: admin preview banner visible");
} else if (/<h1[^>]*>/.test(body)) {
  console.log("PASS: course page rendered");
} else {
  console.error("FAIL: unexpected page content");
  console.log(body.slice(0, 800));
  process.exit(1);
}

console.log("=== ALL PASSED ===");
