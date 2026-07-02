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
];

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function secretStatus(name) {
  return readEnv(name) ? "ok" : "missing";
}

function writeRuntimeEnvFile() {
  const payload = {};
  for (const key of RUNTIME_KEYS) {
    const value = readEnv(key);
    if (value) payload[key] = value;
  }

  const targets = [
    join(root, "runtime-env.json"),
    join(root, ".next", "runtime-env.json"),
    "/tmp/digitalskillx-runtime-env.json",
  ];

  for (const target of targets) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(payload, null, 2));
    console.log(`[digitalskillx] Wrote runtime secrets → ${target} (${Object.keys(payload).length} keys)`);
  }

  process.env.DIGITALSKILLX_RUNTIME_ENV_FILE = join(root, "runtime-env.json");
}

const rawNodeEnv = process.env.NODE_ENV ?? "";
if (!allowedNodeEnv.has(rawNodeEnv)) {
  console.warn(
    `[digitalskillx] Non-standard NODE_ENV="${rawNodeEnv || "(empty)"}" — forcing production for Next.js`,
  );
  process.env.NODE_ENV = "production";
}

writeRuntimeEnvFile();

const status = secretStatus("YOUTUBE_API_KEY");
console.log("[digitalskillx] Startup env check:");
console.log(`  cwd=${process.cwd()}`);
console.log(`  appRoot=${root}`);
console.log(`  NODE_ENV=${process.env.NODE_ENV}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY=${secretStatus("SUPABASE_SERVICE_ROLE_KEY")}`);
console.log(`  YOUTUBE_API_KEY=${status}`);
if (status === "ok") {
  const key = readEnv("YOUTUBE_API_KEY");
  console.log(`  YOUTUBE_API_KEY prefix=${key.slice(0, 8)}…`);
}
console.log(`  DEEPSEEK_API_KEY=${secretStatus("DEEPSEEK_API_KEY")}`);
console.log(`  PAYSTACK_SECRET_KEY=${secretStatus("PAYSTACK_SECRET_KEY")}`);

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
