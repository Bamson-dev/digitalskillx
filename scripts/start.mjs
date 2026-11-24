#!/usr/bin/env node
/**
 * Production start wrapper for Coolify/Docker.
 * Writes runtime secrets to disk and preloads them into Next.js via node -r.
 */
import { spawn } from "node:child_process";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowedNodeEnv = new Set(["production", "development", "test"]);

const RUNTIME_KEYS = [
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
  "EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_FROM_NAME",
];

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function secretStatus(name) {
  return readEnv(name) ? "ok" : "missing";
}

function runtimeTargets() {
  return ["/tmp/digitalskillx-runtime-env.json"];
}

function writeRuntimeEnvFile() {
  const payload = {};
  for (const key of RUNTIME_KEYS) {
    const value = readEnv(key);
    if (value) payload[key] = value;
  }

  const target = runtimeTargets()[0];
  writeFileSync(target, JSON.stringify(payload), { mode: 0o600 });
  chmodSync(target, 0o600);

  process.env.DIGITALSKILLX_RUNTIME_ENV_FILE = target;
}

/** Load missing integration keys from platform_secrets straight from PostgreSQL at boot. */
async function enrichSecretsFromDatabase() {
  const databaseUrl = readEnv("DATABASE_URL");
  if (!databaseUrl) {
    console.log("[digitalskillx] Skipping DB secret enrichment (DATABASE_URL is not set)");
    return;
  }
  let client;
  try {
    const pg = (await import("pg")).default;
    client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3_000 });
    await client.connect();
    const res = await client.query(
      "select youtube_api_key, deepseek_api_key, paystack_secret_key, zeptomail_smtp_password from public.platform_secrets where id = 'default' limit 1",
    );
    const row = res.rows[0];
    if (row) {
      const dbFallbacks = {
        YOUTUBE_API_KEY: row.youtube_api_key,
        DEEPSEEK_API_KEY: row.deepseek_api_key,
        PAYSTACK_SECRET_KEY: row.paystack_secret_key,
        ZEPTOMAIL_SMTP_PASSWORD: row.zeptomail_smtp_password,
      };
      for (const [envKey, dbValue] of Object.entries(dbFallbacks)) {
        if (!readEnv(envKey) && typeof dbValue === "string" && dbValue.trim()) {
          if (dbValue.includes("PASTE_") && dbValue.includes("_HERE")) continue;
          process.env[envKey] = dbValue.trim();
          console.log(`[digitalskillx] Loaded ${envKey} from platform_secrets`);
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[digitalskillx] Could not enrich secrets from database: ${message}`);
  } finally {
    await client?.end().catch(() => undefined);
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

  // Listen immediately from process env so Coolify health checks pass during boot.
  // DB secret enrichment is best-effort and must never block port 3000.
  writeRuntimeEnvFile();

  const youtubeStatus = secretStatus("YOUTUBE_API_KEY");
  console.log("[digitalskillx] Startup env check:");
  console.log(`  cwd=${process.cwd()}`);
  console.log(`  appRoot=${root}`);
  console.log(`  NODE_ENV=${process.env.NODE_ENV}`);
  console.log(`  DATABASE_URL=${secretStatus("DATABASE_URL")}`);
  console.log(`  YOUTUBE_API_KEY=${youtubeStatus}`);
  console.log(`  DEEPSEEK_API_KEY=${secretStatus("DEEPSEEK_API_KEY")}`);
  console.log(`  PAYSTACK_SECRET_KEY=${secretStatus("PAYSTACK_SECRET_KEY")}`);
  console.log(`  EMAIL_PROVIDER=${readEnv("EMAIL_PROVIDER") || "(resend)"}`);
  console.log(`  RESEND_API_KEY=${secretStatus("RESEND_API_KEY")}`);
  console.log(`  RESEND_FROM_EMAIL=${readEnv("RESEND_FROM_EMAIL") ? "set" : "missing"}`);
  console.log(`  RESEND_FROM_NAME=${readEnv("RESEND_FROM_NAME") ? "set" : "missing"}`);

  const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
  const fallbackBin = join(root, "node_modules", ".bin", "next");
  const command = existsSync(nextBin) ? nextBin : fallbackBin;
  const preload = join(root, "scripts/runtime-env-preload.cjs");

  const child = spawn(process.execPath, ["-r", preload, command, "start"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  // Background enrich with a hard timeout — never stall the web process.
  void Promise.race([
    enrichSecretsFromDatabase().then(() => writeRuntimeEnvFile()),
    new Promise((resolve) => setTimeout(resolve, 4_000)),
  ]).catch((err) => {
    console.warn(
      "[digitalskillx] Background secret enrichment failed:",
      err instanceof Error ? err.message : String(err),
    );
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => child.kill(signal));
  }
}

main().catch((err) => {
  console.error("[digitalskillx] Startup failed:", err);
  process.exit(1);
});
