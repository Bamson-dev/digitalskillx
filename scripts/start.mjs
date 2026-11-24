#!/usr/bin/env node
/**
 * Production start wrapper for Coolify/Docker.
 * Applies tracked migrations, prepares payment recovery integrations, then
 * launches Next.js and its database-coordinated recovery scheduler.
 */
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureResendRecoveryWebhook } from "./payment-recovery-bootstrap.mjs";

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
  "RESEND_WEBHOOK_SECRET",
  "PAYMENT_RECOVERY_ENABLED",
  "CRON_SECRET",
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
          console.log(\`[digitalskillx] Loaded \${envKey} from platform_secrets\`);
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(\`[digitalskillx] Could not enrich secrets from database: \${message}\`);
  } finally {
    await client?.end().catch(() => undefined);
  }
}

/** Run the repository's checksum-tracked, advisory-locked migration runner. */
function runDatabaseMigrations() {
  if (!readEnv("DATABASE_URL")) {
    console.warn("[digitalskillx] Database migrations skipped: DATABASE_URL is missing");
    return false;
  }

  console.log("[digitalskillx] Applying pending database migrations before application startup");
  const result = spawnSync(process.execPath, [join(root, "scripts/db-migrate.mjs")], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    timeout: 240_000,
  });
  if (result.error) {
    console.error("[digitalskillx] Database migration runner could not start:", result.error.message);
    return false;
  }
  if (result.status !== 0) {
    console.error(\`[digitalskillx] Database migration runner failed (exit \${result.status ?? "unknown"}); payment recovery remains disabled\`);
    return false;
  }
  console.log("[digitalskillx] Database migrations are up to date");
  return true;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

/** Enable recovery only after migrations and all payment/email integrations are ready. */
async function configurePaymentRecovery(migrationsReady) {
  process.env.PAYMENT_RECOVERY_ENABLED = "false";

  if (isTruthy(readEnv("PAYMENT_RECOVERY_FORCE_DISABLED"))) {
    console.log("[digitalskillx] Payment recovery is paused by PAYMENT_RECOVERY_FORCE_DISABLED");
    return false;
  }
  if (!migrationsReady) {
    console.warn("[digitalskillx] Payment recovery is disabled because database migrations did not complete");
    return false;
  }

  const required = ["DATABASE_URL", "CRON_SECRET", "PAYSTACK_SECRET_KEY", "RESEND_API_KEY"];
  const missing = required.filter((key) => {
    const value = readEnv(key);
    return !value || (key === "CRON_SECRET" && value === "generate-a-long-random-string");
  });
  if (missing.length) {
    console.warn(\`[digitalskillx] Payment recovery is disabled; missing runtime values: \${missing.join(", ")}\`);
    return false;
  }

  if (!readEnv("RESEND_FROM_EMAIL")) {
    process.env.RESEND_FROM_EMAIL = readEnv("ZEPTOMAIL_FROM_EMAIL") || "courses@digitalskillx.com";
  }

  try {
    const webhook = await ensureResendRecoveryWebhook({
      apiKey: readEnv("RESEND_API_KEY"),
      endpoint: "https://www.digitalskillx.com/api/webhooks/resend",
    });
    process.env.RESEND_WEBHOOK_SECRET = webhook.signingSecret;
    process.env.PAYMENT_RECOVERY_ENABLED = "true";
    console.log(\`[digitalskillx] Resend recovery webhook ready (\${webhook.created ? "created" : "existing and reconciled"}); payment recovery enabled\`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown setup error";
    console.warn(\`[digitalskillx] Payment recovery remains disabled; Resend webhook setup failed: \${message}\`);
    return false;
  }
}

async function main() {
  const rawNodeEnv = process.env.NODE_ENV ?? "";
  if (!allowedNodeEnv.has(rawNodeEnv)) {
    console.warn(
      \`[digitalskillx] Non-standard NODE_ENV="\${rawNodeEnv || "(empty)"}" — forcing production for Next.js\`,
    );
    process.env.NODE_ENV = "production";
  }

  // Complete setup before Next.js starts so both processes receive the same
  // runtime secret set. Any setup failure leaves the website available but
  // keeps payment recovery off.
  const migrationsReady = process.env.NODE_ENV === "production" ? runDatabaseMigrations() : false;
  await enrichSecretsFromDatabase();
  const recoveryEnabled =
    process.env.NODE_ENV === "production" && (await configurePaymentRecovery(migrationsReady));

  writeRuntimeEnvFile();

  console.log("[digitalskillx] Startup env check:");
  console.log(\`  cwd=\${process.cwd()}\`);
  console.log(\`  appRoot=\${root}\`);
  console.log(\`  NODE_ENV=\${process.env.NODE_ENV}\`);
  console.log(\`  DATABASE_URL=\${secretStatus("DATABASE_URL")}\`);
  console.log(\`  YOUTUBE_API_KEY=\${secretStatus("YOUTUBE_API_KEY")}\`);
  console.log(\`  DEEPSEEK_API_KEY=\${secretStatus("DEEPSEEK_API_KEY")}\`);
  console.log(\`  PAYSTACK_SECRET_KEY=\${secretStatus("PAYSTACK_SECRET_KEY")}\`);
  console.log(\`  EMAIL_PROVIDER=\${readEnv("EMAIL_PROVIDER") || "(resend)"}\`);
  console.log(\`  RESEND_API_KEY=\${secretStatus("RESEND_API_KEY")}\`);
  console.log(\`  RESEND_FROM_EMAIL=\${readEnv("RESEND_FROM_EMAIL") ? "set" : "missing"}\`);
  console.log(\`  PAYMENT_RECOVERY_ENABLED=\${readEnv("PAYMENT_RECOVERY_ENABLED")}\`);

  const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
  const fallbackBin = join(root, "node_modules", ".bin", "next");
  const command = existsSync(nextBin) ? nextBin : fallbackBin;
  const preload = join(root, "scripts/runtime-env-preload.cjs");

  const app = spawn(process.execPath, ["-r", preload, command, "start"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  let scheduler = null;
  if (recoveryEnabled) {
    scheduler = spawn(process.execPath, [join(root, "scripts/payment-recovery-scheduler.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
  }

  const stopChild = (child, signal = "SIGTERM") => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill(signal);
  };

  app.on("exit", (code, signal) => {
    stopChild(scheduler);
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });

  if (scheduler) {
    scheduler.on("exit", (code) => {
      if (!app.killed && app.exitCode === null && app.signalCode === null && code !== 0) {
        console.error("[digitalskillx] Payment recovery scheduler exited; recovery will pause until the container restarts");
      }
    });
  }

  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      stopChild(scheduler, signal);
      stopChild(app, signal);
    });
  }
}

main().catch((err) => {
  console.error("[digitalskillx] Startup failed:", err);
  process.exit(1);
});
