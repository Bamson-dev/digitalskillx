#!/usr/bin/env node
/**
 * Final Phase 6 security scan — secrets, temp verify routes, unsafe patterns.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`PASS: ${label}`);
}

const FORBIDDEN_ROUTES = [
  "app/api/admin/contabo-verify",
  "app/api/admin/sales-page-pipeline-verify",
  "app/api/admin/sales-page-ui-cleanup",
];

for (const p of FORBIDDEN_ROUTES) {
  assert.equal(existsSync(join(root, p)), false, `temporary route still present: ${p}`);
}
ok("temporary verify/cleanup admin routes absent");

const SECRETISH =
  /(sk_live_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|CONTABO_S3_SECRET_KEY\s*=\s*["'][^"'\n]{8,}["']|SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']eyJ)/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === ".git" ||
      name === "playwright-report" ||
      name === "test-results"
    ) {
      continue;
    }
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|md|sql|json)$/.test(name) && !name.startsWith(".")) out.push(p);
  }
  return out;
}

const files = walk(root);
const hits = [];
for (const file of files) {
  const rel = relative(root, file);
  if (rel.startsWith(".env") || rel.includes("runtime-env")) continue;
  const text = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !/^\s*--/.test(line) && !/^\s*\/\//.test(line) && !line.includes("sk_live_xxxxxxxx"))
    .join("\n");
  if (SECRETISH.test(text)) hits.push(rel);
}
assert.equal(hits.length, 0, `possible hardcoded secrets in: ${hits.join(", ")}`);
ok("no hardcoded live secrets in tracked source");

const health = readFileSync(join(root, "app/api/health/route.ts"), "utf8");
assert.ok(!/CONTABO_S3_SECRET|SERVICE_ROLE_KEY|password\s*:/.test(health));
assert.match(health, /status:\s*200/);
assert.ok(!/status:\s*database === "connected" \? 200 : 503/.test(health));
ok("health endpoint source does not embed secrets");

const secureLog = readFileSync(join(root, "lib/secure-log.ts"), "utf8");
assert.match(secureLog, /redact|SENSITIVE/);
ok("secure logging redaction present");

console.log(`\nSecurity scan: ${passed}/4 passed`);
if (passed !== 4) process.exit(1);
