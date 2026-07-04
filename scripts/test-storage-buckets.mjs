#!/usr/bin/env node
/**
 * Ensures Supabase storage buckets exist and tests a public-assets upload via service role.
 * Usage: node scripts/test-storage-buckets.mjs [baseUrl]
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(name) {
  const path = join(root, name);
  if (!existsSync(path)) return {};
  const env = {};
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
    env[key] = value;
  }
  return env;
}

const env = { ...loadEnvFile(".env.local"), ...loadEnvFile(".env.test"), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const REQUIRED = [
  { id: "public-assets", public: true },
  { id: "private-files", public: false },
];

async function main() {
  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw new Error(`listBuckets: ${listError.message}`);

  const existing = new Set((buckets ?? []).map((b) => b.id));
  console.log("Existing buckets:", [...existing].join(", ") || "(none)");

  for (const bucket of REQUIRED) {
    if (existing.has(bucket.id)) {
      console.log(`OK: ${bucket.id} already exists`);
      continue;
    }
    const { error } = await admin.storage.createBucket(bucket.id, { public: bucket.public });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`createBucket ${bucket.id}: ${error.message}`);
    }
    console.log(`CREATED: ${bucket.id}`);
  }

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const path = `test/smoke-${Date.now()}.png`;
  const { error: uploadError } = await admin.storage.from("public-assets").upload(path, png, {
    contentType: "image/png",
    upsert: true,
  });
  if (uploadError) throw new Error(`upload test: ${uploadError.message}`);

  const { data: pub } = admin.storage.from("public-assets").getPublicUrl(path);
  console.log("PASS: uploaded test file →", pub.publicUrl);

  await admin.storage.from("public-assets").remove([path]);
  console.log("PASS: cleaned up test file");
  console.log("=== ALL PASSED ===");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
