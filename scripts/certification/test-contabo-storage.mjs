#!/usr/bin/env node
/**
 * Contabo Object Storage live connection test via existing StorageService.
 * Never prints Access Key / Secret Key values.
 *
 * Usage:
 *   STORAGE_PROVIDER=contabo-s3 ... node --import ./scripts/certification/register-ts-ext.mjs \
 *     scripts/certification/test-contabo-storage.mjs
 *
 * Or load a gitignored env file first (never commit it).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const REQUIRED = [
  "STORAGE_PROVIDER",
  "CONTABO_S3_ENDPOINT",
  "CONTABO_S3_BUCKET",
  "CONTABO_S3_ACCESS_KEY",
  "CONTABO_S3_SECRET_KEY",
];

const OPTIONAL = ["CONTABO_S3_REGION", "CONTABO_S3_PUBLIC_BASE_URL"];

function classify(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "missing";
  const s = String(value).trim();
  if (/^\[SENSITIVE\]$/i.test(s)) return "sensitive_placeholder_not_decrypted";
  if (/YOUR-|change-me|xxxx|placeholder|<configured/i.test(s)) return "invalid_format";
  return "present";
}

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    // Never hydrate Vercel Sensitive pull placeholders into process.env
    if (/^\[SENSITIVE\]$/i.test(v)) continue;
    out[k] = v;
  }
  return out;
}

/** Merge env from optional local files WITHOUT logging values. */
function hydrateEnvFromFiles() {
  const candidates = [
    join(root, ".env.contabo.local"),
    join(root, ".env.vercel.production.local"),
    join(root, ".vercel/.env.production.local"),
  ];
  for (const file of candidates) {
    const parsed = loadDotEnvFile(file);
    let loaded = 0;
    for (const [k, v] of Object.entries(parsed)) {
      if (!process.env[k] && v) {
        process.env[k] = v;
        loaded += 1;
      }
    }
    if (loaded > 0) {
      console.log(`Hydrated ${loaded} env key(s) from ${file.replace(root + "/", "")} (values not shown)`);
    }
  }
}

hydrateEnvFromFiles();

console.log("\nContabo Object Storage connection test\n");

const presence = {};
for (const k of [...REQUIRED, ...OPTIONAL]) {
  presence[k] = classify(process.env[k]);
}
console.log("Env presence (values redacted):");
for (const [k, status] of Object.entries(presence)) {
  console.log(`  ${k}: ${status}`);
}

const missingRequired = REQUIRED.filter((k) => presence[k] !== "present");
if (missingRequired.length) {
  console.error("\nFAIL: Required Contabo env vars missing or invalid:");
  for (const k of missingRequired) console.error(`  - ${k}: ${presence[k]}`);
  console.error(
    "\nProvide them via process env or a gitignored file (.env.contabo.local). Do not commit secrets.",
  );
  process.exit(2);
}

if (String(process.env.STORAGE_PROVIDER).trim().toLowerCase() !== "contabo-s3") {
  console.error(
    `\nFAIL: STORAGE_PROVIDER must be contabo-s3 for this test (got status=${presence.STORAGE_PROVIDER}, value redacted).`,
  );
  process.exit(2);
}

const endpoint = process.env.CONTABO_S3_ENDPOINT.trim();
if (!/^https:\/\/[a-z0-9.-]+\.contabostorage\.com\/?$/i.test(endpoint.replace(/\/$/, "") + "") &&
    !/^https:\/\/.+/i.test(endpoint)) {
  console.error("FAIL: CONTABO_S3_ENDPOINT does not look like an https endpoint.");
  process.exit(2);
}

const { createStorageAdapterFromEnv, wrapStorageAdapter, resetStorageServiceCache } =
  await import(pathToFileURL(join(root, "lib/storage/index.ts")).href);

resetStorageServiceCache();
const storage = wrapStorageAdapter(createStorageAdapterFromEnv());
assert.equal(storage.provider, "contabo-s3");

const stamp = Date.now();
const id = randomUUID().slice(0, 8);
const path = `temporary/contabo-connection-tests/${stamp}-${id}.txt`;
const payload = Buffer.from(`digitalskillx-contabo-probe-${stamp}-${id}`, "utf8");

let uploaded = false;
try {
  console.log(`\nUpload path namespace: temporary/contabo-connection-tests/… (full key not required)`);
  const up = await storage.upload({
    path,
    body: payload,
    contentType: "text/plain",
    isPublic: false,
  });
  uploaded = true;
  assert.equal(up.provider, "contabo-s3");
  assert.equal(up.size, payload.length);
  assert.equal(up.path, path);
  console.log("PASS: Contabo upload");

  assert.equal(await storage.exists(path), true);
  console.log("PASS: Contabo exists()");

  const meta = await storage.getMetadata(path);
  assert.ok(meta, "metadata missing");
  assert.equal(meta.size, payload.length);
  console.log("PASS: Contabo metadata");

  const down = await storage.download(path);
  assert.equal(Buffer.compare(down, payload), 0);
  console.log("PASS: Contabo download + content match");

  await storage.delete(path);
  uploaded = false;
  assert.equal(await storage.exists(path), false);
  console.log("PASS: Contabo delete + verified gone");

  // Path traversal must fail before network
  assert.throws(() => storage.validatePath("../etc/passwd"));
  assert.throws(() => storage.validatePath("/absolute/path"));
  console.log("PASS: path traversal rejected by StorageService");

  console.log("\nAll Contabo StorageService live checks passed.\n");
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  // Redact any accidental credential-looking substrings
  const safe = message
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED]")
    .replace(/[A-Za-z0-9/+]{32,}/g, (m) => (m.length > 40 ? "[REDACTED]" : m));
  console.error("\nFAIL: Contabo live test error:", safe);
  if (uploaded) {
    try {
      await storage.delete(path);
      console.error("Cleanup: attempted delete of temporary object.");
    } catch {
      console.error("Cleanup: FAILED to delete temporary object — manual cleanup may be required under temporary/contabo-connection-tests/");
    }
  }
  process.exit(1);
}
