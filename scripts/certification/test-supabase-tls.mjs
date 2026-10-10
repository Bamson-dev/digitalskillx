import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// 1. No source file may switch certificate checks off.
const offenders = [];
function check(full) {
  const text = fs.readFileSync(full, "utf8");
  if (/rejectUnauthorized\s*:\s*(false|[^,}\n]*\?[^,}\n]*:\s*false)/.test(text)) offenders.push(path.relative(root, full));
  if (/NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/.test(text)) offenders.push(path.relative(root, full));
}
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) check(full);
  }
}
scan(path.join(root, "lib"));
scan(path.join(root, "app"));
for (const file of ["scripts/start.mjs", "scripts/runtime-env-preload.cjs", "next.config.mjs"]) check(path.join(root, file));
assert.deepEqual([...new Set(offenders)], [], "source must not disable TLS verification");

// 2. The bridge config is always strict, even with the insecure env override set.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { supabaseBridgeConnectOptions, createServerSupabaseFetch } = await import("../../lib/supabase/fetch-bridge.ts");
const strict = supabaseBridgeConnectOptions({ NODE_TLS_REJECT_UNAUTHORIZED: "0", SUPABASE_URL: "https://supabase.example.test" });
assert.equal(strict.rejectUnauthorized, true, "rejectUnauthorized must be literally true");
assert.equal(strict.servername, "supabase.example.test", "SNI uses the Supabase host");
assert.equal(strict.bridgeHost, "coolify-proxy", "default Docker bridge host");
assert.equal(supabaseBridgeConnectOptions({}).publicHost, "supabase.digitalskillx.com", "production default host");

// 3. A real handshake against a self-signed server must fail.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dsx-tls-"));
const key = path.join(tmp, "key.pem");
const cert = path.join(tmp, "cert.pem");
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (_req, res) => res.end("insecure"));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
process.env.SUPABASE_URL = `https://localhost:${port}`;
process.env.SUPABASE_DOCKER_DNS = "127.0.0.1";
const fetchBridge = createServerSupabaseFetch({ retries: 0, timeoutMs: 5000 });
let error;
try {
  await fetchBridge(`https://localhost:${port}/rest/v1/`);
} catch (err) {
  error = err;
}
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
assert.ok(error, "self-signed certificate must be rejected even with NODE_TLS_REJECT_UNAUTHORIZED=0");
const code = String(error?.cause?.code ?? error?.code ?? error?.message);
assert.match(code, /SELF_SIGNED|CERT|certificate/i, "failure must be a certificate error, got " + code);

console.log("supabase TLS verification checks passed");
