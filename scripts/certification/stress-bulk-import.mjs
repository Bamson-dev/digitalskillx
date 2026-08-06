#!/usr/bin/env node
/**
 * Stress the durable bulk CSV import path (production overhaul).
 *
 * Browser-equivalent flow (matches components/admin/student-create.tsx):
 *  1) POST multipart FormData → jobId (chunked for >10 rows)
 *  2) Poll action:"status" only — never drive process chunks
 *  3) Kick /api/cron/bulk-import with CRON_SECRET so Hobby/daily cron is not required
 *
 * Usage:
 *   node scripts/certification/stress-bulk-import.mjs [baseUrl] [sizes]
 *   sizes default: 10,50,100,250,500,1000
 *   Example: node scripts/certification/stress-bulk-import.mjs https://www.digitalskillx.com 10,50,100,500,1000,5000,10000
 *
 * Writes evidence JSON to .tmp-bulk-stress-evidence.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const base = (process.argv[2] ?? "https://www.digitalskillx.com").replace(/\/$/, "");
const sizes = (process.argv[3] ?? "10,50,100,250,500,1000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);

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
  console.error("Set CRON_SECRET in .env.local (needed to kick cron workers)");
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

function buildCsv(n, stamp) {
  const lines = ["full_name,email,course"];
  for (let i = 0; i < n; i++) {
    lines.push(`Stress User ${i},stress+${stamp}-${i}@digitalskillx.com,`);
  }
  return lines.join("\n");
}

async function fetchCron(path, { attempts = 3 } = {}) {
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

function statusPoll(jar, jobId) {
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

async function waitForJob(jar, jobId, { maxMs } = {}) {
  const started = Date.now();
  let last = null;
  let ticks = 0;
  let hit429 = false;
  while (Date.now() - started < maxMs) {
    ticks += 1;
    if (ticks % 2 === 1) {
      await fetchCron("/api/cron/bulk-import");
    }
    last = statusPoll(jar, jobId);
    if (last.status === 429) {
      hit429 = true;
      return { last, elapsedMs: Date.now() - started, ticks, hit429, timedOut: false };
    }
    const st = last.json;
    const rowsFinished =
      st &&
      (st.done === true || st.phase === "completed" || st.phase === "failed") &&
      (st.processedRows ?? 0) >= (st.totalRows ?? 1);
    if (rowsFinished) {
      return { last, elapsedMs: Date.now() - started, ticks, hit429, timedOut: false };
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { last, elapsedMs: Date.now() - started, ticks, hit429, timedOut: true };
}

console.log(`Durable bulk stress → ${base}`);
console.log(`Sizes: ${sizes.join(", ")} (status poll + cron kick; no browser process loop)`);

const jar = join(mkdtempSync(join(tmpdir(), "bulk-stress-")), "admin.txt");
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
  console.error("FAIL: admin login");
  console.error(login.text.slice(0, 400));
  process.exit(1);
}
console.log("PASS: admin login");

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
  console.error("FAIL: no default course id");
  process.exit(1);
}
console.log("PASS: default course", courseId);

const evidence = {
  base,
  architecture: "upload_job_status_poll_cron",
  startedAt: new Date().toISOString(),
  courseId,
  runs: [],
  concurrent: null,
};

for (const size of sizes) {
  const stamp = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
  const csv = buildCsv(size, stamp);
  const csvPath = join(mkdtempSync(join(tmpdir(), "bulk-csv-")), `stress-${size}.csv`);
  writeFileSync(csvPath, csv, "utf8");

  const run = {
    size,
    stamp,
    steps: [],
    ok: false,
    rootCauseHint: null,
  };
  console.log(`\n=== SIZE ${size} (upload + status poll + cron) ===`);

  const uploadStarted = Date.now();
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
  run.steps.push({
    stage: "multipart_upload",
    status: upload.status,
    ms: upload.ms,
    bodyPreview: upload.text.slice(0, 400),
  });
  console.log(`  upload HTTP ${upload.status} in ${upload.ms}ms`);

  const json = parseJson(upload.text);
  if (!json) {
    run.rootCauseHint = "upload_non_json";
    run.error = upload.text.slice(0, 500);
    evidence.runs.push(run);
    console.log("  FAIL: non-JSON upload response");
    continue;
  }

  if (upload.status === 429) {
    run.rootCauseHint = "rate_limit_on_upload";
    run.error = json.error;
    evidence.runs.push(run);
    console.log("  FAIL: 429 on upload —", json.error);
    continue;
  }

  if (json.error) {
    run.rootCauseHint = "upload_error";
    run.error = json.error;
    evidence.runs.push(run);
    console.log("  FAIL:", json.error);
    continue;
  }

  // Sync path (≤10 rows)
  if (!json.chunked) {
    run.mode = "sync";
    run.summary = json.bulkSummary;
    run.ok =
      /Bulk upload finished/i.test(json.message ?? "") &&
      (json.bulkSummary?.failed?.length ?? 1) === 0;
    run.totalMs = Date.now() - uploadStarted;
    evidence.runs.push(run);
    console.log(run.ok ? "  PASS sync" : "  FAIL sync", json.message);
    continue;
  }

  run.mode = "chunked_status_cron";
  run.jobId = json.jobId;
  const maxMs = Math.max(10 * 60_000, size * 2500);

  const wait = await waitForJob(jar, json.jobId, { maxMs });
  const st = wait.last?.json ?? {};
  run.summary = {
    processedRows: st.processedRows,
    totalRows: st.totalRows,
    created: st.created,
    enrolled: st.enrolled,
    skipped: st.skipped,
    failed: st.failed,
    emailsQueued: st.emailsQueued,
    emailsSent: st.emailsSent,
    emailsFailed: st.emailsFailed,
    phase: st.phase,
    failureSample: (st.failures ?? []).slice(0, 5),
    pollTicks: wait.ticks,
    hit429: wait.hit429,
    timedOut: wait.timedOut,
  };
  run.totalMs = Date.now() - uploadStarted;

  if (wait.hit429) {
    run.rootCauseHint = "rate_limit_on_status";
    run.error = wait.last?.text?.slice(0, 400);
  } else if (wait.timedOut) {
    run.rootCauseHint = "timeout_waiting_status";
    run.error = `Timed out after ${wait.elapsedMs}ms phase=${st.phase}`;
  } else if ((st.failed ?? 1) > 0) {
    run.rootCauseHint = "row_failures";
    run.error = JSON.stringify((st.failures ?? []).slice(0, 3)).slice(0, 300);
  }

  run.ok =
    !wait.timedOut &&
    !wait.hit429 &&
    (st.done === true || st.phase === "completed") &&
    (st.failed ?? 1) === 0 &&
    (st.processedRows ?? 0) >= (st.totalRows ?? size);

  if (run.ok) {
    console.log(
      `  PASS size=${size} in ${run.totalMs}ms processed=${st.processedRows}/${st.totalRows} emailsQueued=${st.emailsQueued ?? "?"}`,
    );
  } else {
    console.log(`  FAIL size=${size} cause=${run.rootCauseHint} phase=${st.phase}`);
  }

  evidence.runs.push(run);
  await new Promise((r) => setTimeout(r, 800));
}

// Concurrent two jobs (plan requirement)
{
  console.log("\n=== CONCURRENT two 30-row jobs ===");
  const stamp = `${Date.now()}-conc`;
  const uploads = [30, 30].map((n, i) => {
    const csvPath = join(mkdtempSync(join(tmpdir(), "bulk-conc-")), `c-${i}.csv`);
    writeFileSync(csvPath, buildCsv(n, `${stamp}-${i}`), "utf8");
    return curl([
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
  });
  const ids = uploads.map((u) => parseJson(u.text)?.jobId).filter(Boolean);
  const results = [];
  for (const id of ids) {
    results.push(await waitForJob(jar, id, { maxMs: 12 * 60_000 }));
  }
  const ok =
    ids.length === 2 &&
    results.every(
      (r) =>
        !r.timedOut &&
        !r.hit429 &&
        (r.last?.json?.done === true || r.last?.json?.phase === "completed") &&
        (r.last?.json?.failed ?? 1) === 0,
    );
  evidence.concurrent = {
    ok,
    jobIds: ids,
    summaries: results.map((r) => ({
      processedRows: r.last?.json?.processedRows,
      failed: r.last?.json?.failed,
      phase: r.last?.json?.phase,
      elapsedMs: r.elapsedMs,
    })),
  };
  console.log(ok ? "PASS: concurrent jobs" : "FAIL: concurrent jobs", JSON.stringify(evidence.concurrent).slice(0, 300));
}

// Final email outbox drain
{
  const drain = await fetchCron("/api/cron/email-outbox");
  evidence.emailOutboxDrain = {
    ok: drain.status === 200 && !drain.error,
    status: drain.status,
    body: drain.json ?? drain.text?.slice(0, 200),
  };
  console.log(
    evidence.emailOutboxDrain.ok ? "PASS: email_outbox_drain" : "FAIL: email_outbox_drain",
    JSON.stringify(evidence.emailOutboxDrain.body).slice(0, 200),
  );
}

evidence.finishedAt = new Date().toISOString();
evidence.passed = evidence.runs.filter((r) => r.ok).length;
evidence.failed = evidence.runs.filter((r) => !r.ok).length;
evidence.concurrentOk = evidence.concurrent?.ok === true;
evidence.maxSuccessfulSize = Math.max(
  0,
  ...evidence.runs.filter((r) => r.ok).map((r) => r.size),
);

const outPath = join(root, ".tmp-bulk-stress-evidence.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));
console.log(`\nEvidence written: ${outPath}`);
console.log(
  `\n=== RESULT: ${evidence.passed}/${evidence.runs.length} sizes passed; concurrent=${evidence.concurrentOk}; maxOk=${evidence.maxSuccessfulSize} ===`,
);
for (const r of evidence.runs.filter((x) => !x.ok)) {
  console.log(`  FAIL size=${r.size} cause=${r.rootCauseHint} err=${String(r.error ?? "").slice(0, 120)}`);
}

const exitFail =
  evidence.failed > 0 || evidence.concurrentOk === false || evidence.emailOutboxDrain?.ok === false;
process.exit(exitFail ? 1 : 0);
