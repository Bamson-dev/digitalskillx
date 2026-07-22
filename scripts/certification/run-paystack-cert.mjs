#!/usr/bin/env node
/**
 * Invoke production Paystack sandbox certification + DB integrity audit.
 *
 * Requires:
 *   CRON_SECRET in env (same as Vercel)
 *   ALLOW_PAYMENT_CERT=true on the server
 *   Server Paystack key must be sk_test_...
 *
 * Usage:
 *   CRON_SECRET=... node scripts/certification/run-paystack-cert.mjs [baseUrl] [courseId]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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
loadEnvFile(".env.local");

const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const courseId = process.argv[3] ?? "";
const secret = process.env.CRON_SECRET?.trim();
if (!secret) {
  console.error("Set CRON_SECRET to call protected certification endpoints.");
  process.exit(1);
}

async function call(path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

console.log(`Paystack + integrity certification → ${base}\n`);

const integrity = await call("/api/cron/integrity?repair=1", { method: "GET" });
console.log("Integrity:", integrity.status, JSON.stringify(integrity.json, null, 2).slice(0, 1500));

const paystack = await call("/api/cron/paystack-cert", {
  method: "POST",
  body: JSON.stringify(courseId ? { courseId } : {}),
});
console.log("\nPaystack cert:", paystack.status);
if (paystack.json?.results) {
  for (const r of paystack.json.results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}: ${r.name} — ${r.detail}`);
  }
} else {
  console.log(JSON.stringify(paystack.json, null, 2).slice(0, 2000));
}

const ok =
  integrity.status === 200 &&
  integrity.json?.ok !== false &&
  paystack.status === 200 &&
  paystack.json?.ok === true;
process.exit(ok ? 0 : 1);
