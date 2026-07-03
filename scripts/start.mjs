#!/usr/bin/env node
/**
 * Production start wrapper for Coolify/Docker.
 * Writes runtime secrets to disk and preloads them into Next.js via node -r.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowedNodeEnv = new Set(["production", "development", "test"]);

const RUNTIME_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "YOUTUBE_API_KEY",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_USD_ENABLED",
  "ZEPTOMAIL_SMTP_HOST",
  "ZEPTOMAIL_SMTP_PORT",
  "ZEPTOMAIL_SMTP_USER",
  "ZEPTOMAIL_SMTP_PASSWORD",
  "ZEPTOMAIL_FROM_EMAIL",
  "ZEPTOMAIL_FROM_NAME",
];

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function secretStatus(name) {
  return readEnv(name) ? "ok" : "missing";
}

function runtimeTargets() {
  return [
    join(root, "runtime-env.json"),
    join(root, ".next", "runtime-env.json"),
    "/tmp/digitalskillx-runtime-env.json",
  ];
}

function writeRuntimeEnvFile() {
  const payload = {};
  for (const key of RUNTIME_KEYS) {
    const value = readEnv(key);
    if (value) payload[key] = value;
  }

  for (const target of runtimeTargets()) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(payload, null, 2));
    console.log(
      `[digitalskillx] Wrote runtime secrets → ${target} (${Object.keys(payload).length} keys)`,
    );
  }

  process.env.DIGITALSKILLX_RUNTIME_ENV_FILE = join(root, "runtime-env.json");
}

/** Load missing integration keys from platform_secrets when service role is available at boot. */
async function enrichSecretsFromDatabase() {
  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    console.log("[digitalskillx] Skipping DB secret enrichment (need Supabase URL + service role at boot)");
    return;
  }

  try {
    const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/platform_secrets?id=eq.default&select=youtube_api_key,deepseek_api_key,paystack_secret_key,supabase_service_role_key,zeptomail_smtp_password`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    });

    if (!res.ok) {
      console.warn(`[digitalskillx] platform_secrets fetch failed: HTTP ${res.status}`);
      return;
    }

    const rows = await res.json();
    const row = rows?.[0];
    if (!row) {
      console.warn("[digitalskillx] platform_secrets row missing (id=default)");
      return;
    }

    const dbFallbacks = {
      YOUTUBE_API_KEY: row.youtube_api_key,
      DEEPSEEK_API_KEY: row.deepseek_api_key,
      PAYSTACK_SECRET_KEY: row.paystack_secret_key,
      SUPABASE_SERVICE_ROLE_KEY: row.supabase_service_role_key,
      ZEPTOMAIL_SMTP_PASSWORD: row.zeptomail_smtp_password,
    };

    for (const [envKey, dbValue] of Object.entries(dbFallbacks)) {
      if (!readEnv(envKey) && typeof dbValue === "string" && dbValue.trim()) {
        process.env[envKey] = dbValue.trim();
        console.log(`[digitalskillx] Loaded ${envKey} from platform_secrets`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[digitalskillx] Could not enrich secrets from database: ${message}`);
  }
}

async function main() {
  const rawNodeEnv = process.env.NODE_ENV ?? "";
  if (!allowedNodeEnv.has(rawNodeEnv)) {
    console.warn(
      `[digitalskillx] Non-standard NODE_ENV="${rawNodeEnv || "(empty)"}" — forcing production for Next.js`,
    );
    process.env.NODE_ENV = "production";
  }

  await enrichSecretsFromDatabase();
  writeRuntimeEnvFile();

  const youtubeStatus = secretStatus("YOUTUBE_API_KEY");
  console.log("[digitalskillx] Startup env check:");
  console.log(`  cwd=${process.cwd()}`);
  console.log(`  appRoot=${root}`);
  console.log(`  NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY=${secretStatus("SUPABASE_SERVICE_ROLE_KEY")}`);
  console.log(`  YOUTUBE_API_KEY=${youtubeStatus}`);
  if (youtubeStatus === "ok") {
    const key = readEnv("YOUTUBE_API_KEY");
    console.log(`  YOUTUBE_API_KEY prefix=${key.slice(0, 8)}…`);
  }
  console.log(`  DEEPSEEK_API_KEY=${secretStatus("DEEPSEEK_API_KEY")}`);
  console.log(`  PAYSTACK_SECRET_KEY=${secretStatus("PAYSTACK_SECRET_KEY")}`);
  console.log(`  ZEPTOMAIL_SMTP_PASSWORD=${secretStatus("ZEPTOMAIL_SMTP_PASSWORD")}`);

  const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
  const fallbackBin = join(root, "node_modules", ".bin", "next");
  const command = existsSync(nextBin) ? nextBin : fallbackBin;
  const preload = join(root, "scripts/runtime-env-preload.cjs");

  const child = spawn(process.execPath, ["-r", preload, command, "start"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error("[digitalskillx] Startup failed:", err);
  process.exit(1);
});
