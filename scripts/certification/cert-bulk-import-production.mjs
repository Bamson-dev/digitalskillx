#!/usr/bin/env node
/**
 * Production certification for durable bulk CSV import.
 * Evidence only — does not declare ready; prints PASS/FAIL gates.
 *
 * Usage:
 *   node scripts/certification/cert-bulk-import-production.mjs [baseUrl]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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

const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
const cronSecret = process.env.CRON_SECRET?.trim();
if (!adminPassword) {
  console.error("Set TEST_ADMIN_PASSWORD in .env.test");
  process.exit(1);
}
if (!cronSecret) {
  console.error("Set CRON_SECRET in .env.local");
  process.exit(1);
}

function curl(args, opts = {}) {
  const started = Date.now();
  try {
    const body = execFileSync("curl", ["-sL", "-w", "\n__HTTP__:%{http_code}", ...args], {
      encoding: "utf8",
      maxBuffer: 40 * 1024 * 1024,
      ...opts,
    });
    const marker = body.lastIndexOf("\n__HTTP__:");
    const text = marker >= 0 ? body.slice(0, marker) : body;
    const status = marker >= 0 ? Number(body.slice(marker + 10).trim()) : 0;
    return { status, text, ms: Date.now() - started };
  } catch (err) {
    return {
      status: 0,
      text: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
      error: true,
    };
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildCsv(n, stamp, courseTitle = "") {
  const lines = ["full_name,email,course"];
  for (let i = 0; i < n; i++) {
    lines.push(`Cert User ${i},cert+${stamp}-${i}@digitalskillx.com,${courseTitle}`);
  }
  return lines.join("\n");
}

async function fetchCron(path, { attempts = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const started = Date.now();
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
        signal: AbortSignal.timeout(280_000),
      });
      const text = await res.text();
      return { status: res.status, json: parseJson(text), text, ms: Date.now() - started };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  return {
    status: 0,
    json: null,
    text: lastErr instanceof Error ? lastErr.message : String(lastErr),
    ms: 0,
    error: true,
  };
}

const evidence = {
  base,
  startedAt: new Date().toISOString(),
  gates: {},
  tests: [],
};

function record(name, ok, detail) {
  evidence.tests.push({ name, ok, detail, at: new Date().toISOString() });
  console.log(ok ? `PASS: ${name}` : `FAIL: ${name}`, detail ? JSON.stringify(detail).slice(0, 400) : "");
}

const scaleOnly = process.env.BULK_CERT_SCALE_ONLY === "1";
console.log(`Bulk import production cert → ${base}${scaleOnly ? " (scale-only)" : ""}`);

// --- Admin login (always needed for uploads) ---
const jar = join(mkdtempSync(join(tmpdir(), "bulk-cert-")), "admin.txt");
const login = curl([
  "-c",
  jar,
  "-b",
  jar,
  "-D",
  "-",
  "-X",
  "POST",
  `${base}/api/auth/admin-login`,
  "-d",
  new URLSearchParams({ email: adminEmail, password: adminPassword }).toString(),
  "-o",
  "/dev/null",
]);
if (!/location:.*\/admin/i.test(login.text)) {
  record("admin_login", false, { preview: login.text.slice(0, 300) });
  writeFileSync(join(root, ".tmp-bulk-prod-cert-evidence.json"), JSON.stringify(evidence, null, 2));
  process.exit(1);
}
record("admin_login", true, { ms: login.ms });

const studentsPage = curl(["-b", jar, `${base}/admin/students`]);
const courseMatch = [
  ...studentsPage.text.matchAll(/name="default_course_id"[\s\S]*?<option value="([0-9a-f-]{36})">/gi),
][0];
let courseId = courseMatch?.[1];
if (!courseId) {
  const coursesPage = curl(["-b", jar, `${base}/admin/courses`]);
  courseId = coursesPage.text.match(/\/admin\/courses\/([0-9a-f-]{36})/i)?.[1];
}
if (!courseId) {
  record("resolve_course", false, null);
  writeFileSync(join(root, ".tmp-bulk-prod-cert-evidence.json"), JSON.stringify(evidence, null, 2));
  process.exit(1);
}
record("resolve_course", true, { courseId });

function uploadCsv(rows, stamp) {
  const csvPath = join(mkdtempSync(join(tmpdir(), "bulk-cert-csv-")), `c-${rows}.csv`);
  writeFileSync(csvPath, buildCsv(rows, stamp), "utf8");
  const upload = curl([
    "-b",
    jar,
    "-X",
    "POST",
    `${base}/api/admin/bulk-students`,
    "-F",
    `default_course_id=${courseId}`,
    "-F",
    `csv_file=@${csvPath};type=text/csv`,
  ]);
  return { upload, json: parseJson(upload.text), csvPath };
}

function statusPoll(jobId) {
  const res = curl([
    "-b",
    jar,
    "-X",
    "POST",
    `${base}/api/admin/bulk-students`,
    "-H",
    "Content-Type: application/json",
    "-d",
    JSON.stringify({ action: "status", jobId }),
  ]);
  return { ...res, json: parseJson(res.text) };
}

async function waitForJob(jobId, { maxMs = 15 * 60_000, useCron = true, pollOnly = true } = {}) {
  const started = Date.now();
  let last = null;
  let ticks = 0;
  while (Date.now() - started < maxMs) {
    ticks += 1;
    if (useCron && ticks % 2 === 1) {
      await fetchCron("/api/cron/bulk-import");
    }
    if (!pollOnly) {
      curl([
        "-b",
        jar,
        "-X",
        "POST",
        `${base}/api/admin/bulk-students`,
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify({ action: "process", jobId }),
      ]);
    }
    last = statusPoll(jobId);
    if (last.json?.done || last.json?.phase === "completed" || last.json?.phase === "failed") {
      return { last, elapsedMs: Date.now() - started, ticks };
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { last, elapsedMs: Date.now() - started, ticks, timedOut: true };
}

if (!scaleOnly) {
  // --- Gate: cron routes ---
  {
    const noAuth = curl([`${base}/api/cron/bulk-import`]);
    const bad = curl(["-H", "Authorization: Bearer wrong-secret", `${base}/api/cron/bulk-import`]);
    const ok = await fetchCron("/api/cron/bulk-import");
    const emailNo = curl([`${base}/api/cron/email-outbox`]);
    const emailOk = await fetchCron("/api/cron/email-outbox");
    const inac = curl([`${base}/api/cron/inactivity`]);
    evidence.gates.cronRoutes = {
      bulkNoAuth: noAuth.status,
      bulkBad: bad.status,
      bulkOk: ok.status,
      emailNoAuth: emailNo.status,
      emailOk: emailOk.status,
      inactivityNoAuth: inac.status,
    };
    record(
      "cron_routes_registered_and_auth",
      noAuth.status === 401 &&
        bad.status === 401 &&
        ok.status === 200 &&
        emailNo.status === 401 &&
        emailOk.status === 200 &&
        inac.status === 401,
      evidence.gates.cronRoutes,
    );
  }

  // --- Architecture: upload returns jobId; no sync finish message ---
  {
    const stamp = `${Date.now()}-arch`;
    const { upload, json } = uploadCsv(25, stamp);
    const asyncOk =
      upload.status === 200 &&
      Boolean(json?.chunked) &&
      Boolean(json?.jobId) &&
      !/Bulk upload finished/i.test(json?.message ?? "");
    record("upload_creates_job_not_sync", asyncOk, {
      status: upload.status,
      ms: upload.ms,
      chunked: json?.chunked,
      jobId: json?.jobId,
      message: json?.message,
      error: json?.error,
    });

    if (json?.jobId) {
      const wait = await waitForJob(json.jobId, { pollOnly: true, useCron: true, maxMs: 10 * 60_000 });
      const done =
        !wait.timedOut &&
        (wait.last?.json?.done === true || wait.last?.json?.phase === "completed");
      record("background_completes_without_browser_process_loop", done, {
        elapsedMs: wait.elapsedMs,
        ticks: wait.ticks,
        phase: wait.last?.json?.phase,
        processedRows: wait.last?.json?.processedRows,
        totalRows: wait.last?.json?.totalRows,
        created: wait.last?.json?.created,
        failed: wait.last?.json?.failed,
        emailsQueued: wait.last?.json?.emailsQueued,
        emailsSent: wait.last?.json?.emailsSent,
      });
    }
  }

  // --- Recovery: upload then primarily cron ---
  {
    const stamp = `${Date.now()}-rec`;
    const { json } = uploadCsv(40, stamp);
    if (json?.jobId) {
      const start = Date.now();
      let lastCron = null;
      let recovered = false;
      while (Date.now() - start < 8 * 60_000) {
        lastCron = await fetchCron("/api/cron/bulk-import");
        const st = statusPoll(json.jobId);
        if (st.json?.done) {
          recovered = true;
          record("recovery_cron_only_completes", true, {
            elapsedMs: Date.now() - start,
            processedRows: st.json.processedRows,
            totalRows: st.json.totalRows,
            failed: st.json.failed,
          });
          break;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!recovered) {
        const st = statusPoll(json.jobId);
        record("recovery_cron_only_completes", false, {
          phase: st.json?.phase,
          processedRows: st.json?.processedRows,
          totalRows: st.json?.totalRows,
          lastCron: lastCron?.json,
        });
      }
    } else {
      record("recovery_cron_only_completes", false, { upload: json });
    }
  }

  // --- Concurrent imports ---
  {
    const stamp = `${Date.now()}-conc`;
    const a = uploadCsv(30, `${stamp}-a`);
    const b = uploadCsv(30, `${stamp}-b`);
    const ids = [a.json?.jobId, b.json?.jobId].filter(Boolean);
    if (ids.length !== 2) {
      record("concurrent_two_jobs", false, { a: a.json, b: b.json });
    } else {
      const results = [];
      for (const id of ids) {
        results.push(await waitForJob(id, { pollOnly: true, useCron: true, maxMs: 12 * 60_000 }));
      }
      const ok = results.every(
        (r) =>
          !r.timedOut &&
          (r.last?.json?.done === true || r.last?.json?.phase === "completed") &&
          (r.last?.json?.failed ?? 1) === 0,
      );
      record("concurrent_two_jobs", ok, {
        jobs: results.map((r, i) => ({
          jobId: ids[i],
          elapsedMs: r.elapsedMs,
          processedRows: r.last?.json?.processedRows,
          failed: r.last?.json?.failed,
          phase: r.last?.json?.phase,
        })),
      });
    }
  }
}

// --- Scale ladder ---
const scaleSizes = (process.env.BULK_CERT_SIZES ?? (scaleOnly ? "500,1000" : "100"))
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);

for (const size of scaleSizes) {
  const stamp = `${Date.now()}-s${size}`;
  const { upload, json } = uploadCsv(size, stamp);
  if (!json?.jobId) {
    record(`scale_${size}`, false, { status: upload.status, body: upload.text.slice(0, 300) });
    continue;
  }
  const wait = await waitForJob(json.jobId, {
    pollOnly: true,
    useCron: true,
    maxMs: Math.max(20 * 60_000, size * 3000),
  });
  const ok =
    !wait.timedOut &&
    (wait.last?.json?.done === true || wait.last?.json?.phase === "completed") &&
    (wait.last?.json?.failed ?? 1) === 0;
  record(`scale_${size}`, ok, {
    jobId: json.jobId,
    uploadMs: upload.ms,
    elapsedMs: wait.elapsedMs,
    processedRows: wait.last?.json?.processedRows,
    totalRows: wait.last?.json?.totalRows,
    created: wait.last?.json?.created,
    enrolled: wait.last?.json?.enrolled,
    failed: wait.last?.json?.failed,
    emailsSent: wait.last?.json?.emailsSent,
    emailsFailed: wait.last?.json?.emailsFailed,
    phase: wait.last?.json?.phase,
  });
}

// --- Final drain email outbox ---
{
  const drain = await fetchCron("/api/cron/email-outbox");
  record("email_outbox_drain", drain.status === 200 && !drain.error, drain.json ?? { text: drain.text });
}

evidence.finishedAt = new Date().toISOString();
evidence.passed = evidence.tests.filter((t) => t.ok).length;
evidence.failed = evidence.tests.filter((t) => !t.ok).length;
evidence.scaleOnly = scaleOnly;
evidence.readyForCertification = scaleOnly
  ? evidence.failed === 0 && evidence.tests.some((t) => t.name.startsWith("scale_") && t.ok)
  : evidence.failed === 0 &&
    evidence.tests.some((t) => t.name === "upload_creates_job_not_sync" && t.ok) &&
    evidence.tests.some((t) => t.name === "background_completes_without_browser_process_loop" && t.ok) &&
    evidence.tests.some((t) => t.name === "cron_routes_registered_and_auth" && t.ok);

const out = join(root, scaleOnly ? ".tmp-bulk-prod-scale-evidence.json" : ".tmp-bulk-prod-cert-evidence.json");
writeFileSync(out, JSON.stringify(evidence, null, 2));
console.log(`\nEvidence → ${out}`);
console.log(`Passed ${evidence.passed}/${evidence.tests.length}`);
console.log(
  evidence.readyForCertification
    ? "CERT_GATE: OPEN (all measured gates passed)"
    : "CERT_GATE: CLOSED (see failures above)",
);
process.exit(evidence.failed === 0 ? 0 : 1);
