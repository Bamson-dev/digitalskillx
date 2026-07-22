#!/usr/bin/env node
/**
 * Lightweight concurrency stress probe against public + authenticated read paths.
 * Usage: node scripts/certification/run-stress.mjs [baseUrl] [concurrency]
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

const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const concurrency = Number(process.argv[3] ?? 40);

const paths = ["/", "/browse", "/login", "/admin/login", "/api/health", "/privacy", "/terms"];

async function hit(path) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}${path}`, { redirect: "manual" });
    return { path, status: res.status, ms: Date.now() - started, ok: res.status < 500 };
  } catch (err) {
    return {
      path,
      status: 0,
      ms: Date.now() - started,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

console.log(`Stress probe concurrency=${concurrency} → ${base}`);
const jobs = [];
for (let i = 0; i < concurrency; i++) {
  jobs.push(hit(paths[i % paths.length]));
}
const started = Date.now();
const results = await Promise.all(jobs);
const elapsed = Date.now() - started;
const ok = results.filter((r) => r.ok).length;
const fail = results.length - ok;
const avg = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
const p95 = [...results].sort((a, b) => a.ms - b.ms)[Math.floor(results.length * 0.95)]?.ms;

console.log(`completed=${results.length} ok=${ok} fail=${fail} wall_ms=${elapsed} avg_ms=${avg} p95_ms=${p95}`);
for (const r of results.filter((x) => !x.ok).slice(0, 10)) {
  console.log(`FAIL ${r.path} status=${r.status} ${r.error ?? ""}`);
}
process.exit(fail > 0 ? 1 : 0);
