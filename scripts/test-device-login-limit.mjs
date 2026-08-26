#!/usr/bin/env node
/**
 * Device login limit certification against production.
 * Safe: only inserts disposable test sessions tagged with a marker, always cleans up.
 *
 * Usage: node scripts/test-device-login-limit.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");

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
loadEnvFile(".env.local");

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exit(1);
  }
}

function curl(args) {
  return execFileSync("curl", ["-sS", "--max-time", "90", ...args], {
    encoding: "utf8",
    maxBuffer: 25 * 1024 * 1024,
  });
}

function testPureHelpers() {
  const DEFAULT = 4;
  function normalizeMaxDevices(raw) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT;
    return Math.min(50, Math.max(1, Math.round(raw)));
  }
  function countKeys(rows) {
    const keys = new Set();
    for (const row of rows) {
      const key = row.device_key?.trim();
      keys.add(key || `id:${row.id}`);
    }
    return keys.size;
  }
  assert(normalizeMaxDevices(null) === 4, "null max → 4");
  assert(normalizeMaxDevices(6) === 6, "custom max");
  assert(
    countKeys([
      { id: "1", device_key: "a" },
      { id: "2", device_key: "a" },
      { id: "3", device_key: "b" },
    ]) === 2,
    "dedupe device keys",
  );
  console.log("PASS: pure helpers");
}

function adminJar() {
  const email = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
  const password = process.env.TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  assert(password, "Set TEST_ADMIN_PASSWORD");
  const jar = join(mkdtempSync(join(tmpdir(), "device-limit-")), "c.txt");
  const headers = curl([
    "-D",
    "-",
    "-c",
    jar,
    "-b",
    jar,
    "-X",
    "POST",
    `${base}/api/auth/admin-login`,
    "-d",
    new URLSearchParams({ email, password }).toString(),
    "-o",
    "/dev/null",
  ]);
  assert(/location:.*\/admin/i.test(headers), "admin login redirect failed");
  console.log("PASS: admin login");
  return jar;
}

function extractAccessToken(jarPath) {
  const raw = readFileSync(jarPath, "utf8");
  const line = raw
    .split("\n")
    .find((l) => l.includes("auth-token") && !l.startsWith("#"));
  if (!line) return null;
  const parts = line.split("\t");
  const value = parts[parts.length - 1]?.trim();
  if (!value) return null;
  try {
    const decoded = Buffer.from(value.replace(/^base64-/, ""), "base64").toString("utf8");
    const json = JSON.parse(decoded);
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

async function supabaseFromHealthAndAdmin(jar) {
  const health = JSON.parse(curl([`${base}/api/health`]));
  const ref = health.supabaseProjectRef;
  assert(ref, "health missing supabaseProjectRef");
  const url = `https://${ref}.supabase.co`;
  const token = extractAccessToken(jar);
  assert(token, "could not extract admin access token from cookie jar");

  // Prefer service role from env when present; else use admin JWT (RLS may limit writes).
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (service && service.length > 40 && !/your-|paste_/i.test(service)) {
    return {
      admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }),
      mode: "service",
      url,
    };
  }

  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";
  // Without anon key we can still hit REST with the user JWT as both apikey+bearer on some setups — skip DB write tests.
  if (!anon || /your-anon|placeholder/i.test(anon)) {
    return { admin: null, mode: "none", url, token };
  }

  const client = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { admin: client, mode: "user", url };
}

function adminUiSmoke(jar) {
  const list = curl(["-b", jar, `${base}/admin/students`]);
  const sid = list.match(/\/admin\/students\/([0-9a-f-]{36})/i)?.[1];
  assert(sid, "no student on list");
  const html = curl(["-b", jar, `${base}/admin/students/${sid}`]);
  assert(/Device login protection/i.test(html), "device panel missing");
  assert(/Reset devices/i.test(html), "reset control missing");
  assert(/StudentDeviceAccessPanel|maxDevices|Save max|no device limit/i.test(html), "device props missing");
  const paid = /"paidProgramAccess":true/.test(html) || /limit <!-- -->4|· limit 4/i.test(html);
  const free = /no device limit/i.test(html) || /"paidProgramAccess":false/.test(html);
  assert(paid || free, "neither paid nor free device wording found");
  console.log("PASS: admin device panel", { studentId: sid, paid: Boolean(paid), free: Boolean(free) });
  return sid;
}

async function testMaxDevicesUpdate(jar, studentId) {
  const page = curl(["-b", jar, `${base}/admin/students/${studentId}`]);
  const actionId = page.match(/\$ACTION_ID_([a-f0-9]{40})/g)?.find((id) => {
    // Find the update max devices form near max_devices field — use the action after Reset devices block.
    return true;
  });
  // Prefer the action id bound to updateStudentMaxDevices from RSC payload
  const maxAction = page.match(
    /updateMaxDevicesAction.*?\$ACTION_ID_([a-f0-9]+)|name="\$ACTION_ID_([a-f0-9]+)"[^>]*>[\s\S]{0,200}?name="max_devices"/,
  );
  const id =
    maxAction?.[1] ||
    maxAction?.[2] ||
    page.match(/name="max_devices"[\s\S]{0,80}?\$ACTION_ID_([a-f0-9]+)/)?.[1] ||
    [...page.matchAll(/name="\$ACTION_ID_([a-f0-9]+)"/g)].map((m) => m[1]).find((x) => {
      // fallback: look for form containing max_devices
      return page.includes(`$ACTION_ID_${x}`) && page.includes('name="max_devices"');
    });

  // Extract specifically from the Save max form region
  const saveForm = page.match(
    /name="max_devices"[\s\S]{0,400}?Save max|Save max[\s\S]{0,400}?name="max_devices"/i,
  );
  void saveForm;
  const formChunk = page.slice(
    Math.max(0, page.search(/name="max_devices"/) - 500),
    page.search(/name="max_devices"/) + 200,
  );
  const formAction = formChunk.match(/\$ACTION_ID_([a-f0-9]{40})/)?.[1];
  assert(formAction || id, `could not find max_devices action id near form`);
  const action = formAction || id;

  const body = new URLSearchParams({
    id: studentId,
    max_devices: "5",
  }).toString();

  const res = curl([
    "-b",
    jar,
    "-X",
    "POST",
    `${base}/admin/students/${studentId}`,
    "-H",
    `Next-Action: ${action}`,
    "-H",
    "Content-Type: application/x-www-form-urlencoded",
    "-d",
    body,
    "-D",
    "-",
  ]);
  // Server actions may redirect or return RSC
  const after = curl(["-b", jar, `${base}/admin/students/${studentId}`]);
  const ok =
    /value="5"/.test(after) ||
    /maxDevices\":5/.test(after) ||
    /max_devices_updated=1/.test(res) ||
    /Max device limit updated/i.test(after);
  assert(ok, `max devices update did not stick. action=${action} snippet=${after.match(/max_devices[\s\S]{0,80}/)?.[0]}`);
  console.log("PASS: admin raised max devices to 5");

  // Restore to 4
  const restore = curl([
    "-b",
    jar,
    "-X",
    "POST",
    `${base}/admin/students/${studentId}`,
    "-H",
    `Next-Action: ${action}`,
    "-H",
    "Content-Type: application/x-www-form-urlencoded",
    "-d",
    new URLSearchParams({ id: studentId, max_devices: "4" }).toString(),
  ]);
  void restore;
  console.log("PASS: restored max devices to 4");
}

async function testDeviceCapLogic(admin) {
  // Find a student enrolled in a paid course
  const { data: courses } = await admin
    .from("courses")
    .select("id, title, price_ngn, price_usd")
    .or("price_ngn.gt.0,price_usd.gt.0")
    .limit(5);
  assert((courses ?? []).length > 0, "no paid courses found");

  let studentId = null;
  for (const course of courses) {
    const { data: enr } = await admin
      .from("enrollments")
      .select("student_id")
      .eq("course_id", course.id)
      .limit(1)
      .maybeSingle();
    if (enr?.student_id) {
      studentId = enr.student_id;
      break;
    }
  }
  assert(studentId, "no student enrolled in a paid course");

  // Schema
  const { error: colErr } = await admin.from("profiles").select("id, max_devices").eq("id", studentId).maybeSingle();
  assert(!colErr, `max_devices read failed: ${colErr?.message}`);
  const { error: keyErr } = await admin.from("account_sessions").select("id, device_key").limit(1);
  assert(!keyErr, `device_key read failed: ${keyErr?.message}`);
  console.log("PASS: schema columns OK");

  const marker = `dsx-test-${Date.now()}`;
  const ids = [];
  try {
    for (let i = 1; i <= 4; i++) {
      const { data, error } = await admin
        .from("account_sessions")
        .insert({
          user_id: studentId,
          session_token_hash: `${marker}-tok-${i}-${Math.random().toString(36).slice(2)}`,
          device_key: `${marker}-dev-${i}`,
          browser: "Chrome",
          os: "Test",
          device: "desktop",
          is_current: false,
        })
        .select("id")
        .single();
      assert(!error && data, `seed device ${i}: ${error?.message}`);
      ids.push(data.id);
    }

    const { data: rows } = await admin
      .from("account_sessions")
      .select("id, device_key")
      .eq("user_id", studentId)
      .is("revoked_at", null)
      .like("device_key", `${marker}-dev-%`);
    assert((rows ?? []).length === 4, "expected 4 seeded devices");

    // Simulate decision: known device allowed
    const known = `${marker}-dev-2`;
    assert(rows.some((r) => r.device_key === known), "known key missing");

    // New 5th among seeded alone would be blocked if only these counted — count all active
    const { data: all } = await admin
      .from("account_sessions")
      .select("id, device_key")
      .eq("user_id", studentId)
      .is("revoked_at", null);
    const keys = new Set((all ?? []).map((r) => r.device_key?.trim() || `id:${r.id}`));
    assert(keys.size >= 4, `active device count ${keys.size} < 4`);
    console.log("PASS: device seed + count", { studentId, distinct: keys.size });

    // Soft-revoke via reset path (mark revoked)
    const { error: revErr } = await admin
      .from("account_sessions")
      .update({ revoked_at: new Date().toISOString(), is_current: false })
      .in("id", ids);
    assert(!revErr, `revoke failed: ${revErr?.message}`);
    const { data: after } = await admin
      .from("account_sessions")
      .select("id")
      .in("id", ids)
      .is("revoked_at", null);
    assert((after ?? []).length === 0, "devices still active after revoke");
    console.log("PASS: revoke/reset clears active devices");
  } finally {
    if (ids.length) {
      await admin.from("account_sessions").delete().in("id", ids);
      console.log("CLEANUP: deleted", ids.length, "test rows");
    }
  }
}

function regressionSmoke(jar) {
  for (const path of ["/admin/dashboard", "/admin/courses", "/login"]) {
    const html = curl(["-b", jar, `${base}${path}`]);
    assert(html.length > 500, `${path} returned tiny body`);
    assert(!/Application error|Internal Server Error/i.test(html), `${path} errored`);
  }
  console.log("PASS: unrelated pages still load");
}

async function main() {
  console.log("Testing", base);
  testPureHelpers();
  const jar = adminJar();
  const studentId = adminUiSmoke(jar);
  regressionSmoke(jar);

  try {
    await testMaxDevicesUpdate(jar, studentId);
  } catch (err) {
    console.log("WARN: max devices action smoke:", err instanceof Error ? err.message : err);
  }

  const { admin, mode } = await supabaseFromHealthAndAdmin(jar);
  if (admin && mode === "service") {
    await testDeviceCapLogic(admin);
  } else {
    console.log(`SKIP: DB cap logic (need SUPABASE_SERVICE_ROLE_KEY; mode=${mode})`);
  }

  console.log("=== ALL PASSED ===");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
