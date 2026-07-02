#!/usr/bin/env node
/**
 * Production start wrapper for Coolify/Docker.
 * Logs whether runtime env vars are visible before Next.js boots.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowedNodeEnv = new Set(["production", "development", "test"]);

function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function youtubeStatus() {
  const key = readEnv("YOUTUBE_API_KEY");
  if (!key) return "missing";
  if (key === "your-youtube-data-api-key") return "placeholder";
  return "ok";
}

const rawNodeEnv = process.env.NODE_ENV ?? "";
if (!allowedNodeEnv.has(rawNodeEnv)) {
  console.warn(
    `[digitalskillx] Non-standard NODE_ENV="${rawNodeEnv || "(empty)"}" — forcing production for Next.js`,
  );
  process.env.NODE_ENV = "production";
}

const status = youtubeStatus();
console.log("[digitalskillx] Startup env check:");
console.log(`  NODE_ENV=${process.env.NODE_ENV}`);
console.log(`  YOUTUBE_API_KEY=${status}`);
if (status === "ok") {
  const key = readEnv("YOUTUBE_API_KEY");
  console.log(`  YOUTUBE_API_KEY prefix=${key.slice(0, 8)}…`);
}

const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const fallbackBin = join(root, "node_modules", ".bin", "next");
const command = existsSync(nextBin) ? nextBin : fallbackBin;

const child = spawn(process.execPath, [command, "start"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
