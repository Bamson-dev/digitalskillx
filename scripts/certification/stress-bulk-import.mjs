#!/usr/bin/env node
/**
 * Reproduce the REAL admin browser bulk-upload flow (not internal helpers).
 *
 * Exact client behavior from components/admin/student-create.tsx:
 *  1) POST multipart FormData to /api/admin/bulk-students
 *  2) If chunked: loop POST JSON { action:"process", jobId } until done
 *     with the same maxChunks / stall guards as the UI
 *
 * Usage:
 *   node scripts/certification/stress-bulk-import.mjs [baseUrl] [sizes]
 *   sizes default: 10,50,100,250,500
 *   Example: node scripts/certification/stress-bulk-import.mjs https://www.digitalskillx.com 10,50,100,250
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
const sizes = (process.argv[3] ?? "10,50,100,250,500")
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

const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin@digitalskillx.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
if (!adminPassword) {
  console.error("Set TEST_ADMIN_PASSWORD in .env.test");
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

function buildCsv(n, stamp) {
  const lines = ["full_name,email,course"];
  for (let i = 0; i < n; i++) {
    lines.push(
      `Stress User ${i},stress+${stamp}-${i}@digitalskillx.com,`,
    );
  }
  return lines.join("\n");
}

console.log(`Browser-flow stress → ${base}`);
console.log(`Sizes: ${sizes.join(", ")}`);

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
console.log("PASS: admin login (browser cookie jar)");

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
  startedAt: new Date().toISOString(),
  courseId,
  runs: [],
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
  console.log(`\n=== SIZE ${size} (browser multipart + process loop) ===`);

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

  let json;
  try {
    json = JSON.parse(upload.text);
  } catch {
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

  // Sync path (small files)
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

  // Exact UI loop
  run.mode = "chunked_browser_loop";
  run.jobId = json.jobId;
  const totalRows = json.totalRows ?? size;
  const maxChunks = Math.max(20, Math.ceil((totalRows || 1) / 25) + 10);
  let summary = {
    processedRows: 0,
    totalRows,
    created: 0,
    enrolled: 0,
    skipped: 0,
    failed: 0,
    done: false,
    failures: [],
  };
  let chunkGuard = 0;
  let stalledRounds = 0;
  let hit429 = false;

  while (!summary.done) {
    if (chunkGuard >= maxChunks) {
      run.rootCauseHint = "client_maxChunks_guard";
      run.error = `Stopped after ${maxChunks} chunk attempts (UI guard)`;
      break;
    }
    chunkGuard += 1;
    const previousProcessed = summary.processedRows;
    const chunk = curl([
      "-b",
      jar,
      "-X",
      "POST",
      `${base}/api/admin/bulk-students`,
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify({ action: "process", jobId: json.jobId }),
    ]);
    run.steps.push({
      stage: `process_chunk_${chunkGuard}`,
      status: chunk.status,
      ms: chunk.ms,
      bodyPreview: chunk.text.slice(0, 240),
    });

    if (chunk.status === 429) {
      hit429 = true;
      run.rootCauseHint = "rate_limit_on_process_chunk";
      run.error = chunk.text.slice(0, 400);
      console.log(`  FAIL: 429 on process chunk #${chunkGuard} after ${chunkGuard - 1} ok chunks`);
      break;
    }

    let chunkJson;
    try {
      chunkJson = JSON.parse(chunk.text);
    } catch {
      run.rootCauseHint = "process_non_json";
      run.error = chunk.text.slice(0, 400);
      break;
    }
    if (chunk.status >= 400 || chunkJson.error) {
      run.rootCauseHint = "process_http_error";
      run.error = chunkJson.error ?? `HTTP ${chunk.status}`;
      console.log("  FAIL process:", run.error);
      break;
    }

    summary = {
      processedRows: chunkJson.processedRows,
      totalRows: chunkJson.totalRows,
      created: chunkJson.created,
      enrolled: chunkJson.enrolled,
      skipped: chunkJson.skipped,
      failed: chunkJson.failed,
      failures: chunkJson.failures ?? [],
      done: chunkJson.done,
    };

    if (
      !summary.done &&
      summary.processedRows <= previousProcessed &&
      summary.totalRows > 0
    ) {
      stalledRounds += 1;
      if (stalledRounds >= 3) {
        run.rootCauseHint = "client_stall_guard";
        run.error = "Import progress stalled (UI 3-round guard)";
        console.log("  FAIL: stalled");
        break;
      }
    } else {
      stalledRounds = 0;
    }

    if (chunkGuard % 5 === 0 || summary.done) {
      console.log(
        `  chunk ${chunkGuard}: processed ${summary.processedRows}/${summary.totalRows} failed=${summary.failed} (${chunk.ms}ms)`,
      );
    }
  }

  run.summary = {
    processedRows: summary.processedRows,
    totalRows: summary.totalRows,
    created: summary.created,
    enrolled: summary.enrolled,
    skipped: summary.skipped,
    failed: summary.failed,
    failureSample: (summary.failures ?? []).slice(0, 5),
    chunks: chunkGuard,
    hit429,
  };
  run.totalMs = Date.now() - uploadStarted;
  run.ok =
    summary.done &&
    summary.failed === 0 &&
    !hit429 &&
    !run.rootCauseHint &&
    summary.processedRows >= summary.totalRows;

  if (run.ok) console.log(`  PASS size=${size} in ${run.totalMs}ms chunks=${chunkGuard}`);
  else console.log(`  FAIL size=${size} cause=${run.rootCauseHint}`);

  evidence.runs.push(run);

  // Brief pause between sizes (still back-to-back enough to trip rate limit)
  await new Promise((r) => setTimeout(r, 500));
}

evidence.finishedAt = new Date().toISOString();
const outPath = join(root, ".tmp-bulk-stress-evidence.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));
console.log(`\nEvidence written: ${outPath}`);

const failed = evidence.runs.filter((r) => !r.ok);
console.log(`\n=== RESULT: ${evidence.runs.length - failed.length}/${evidence.runs.length} sizes passed ===`);
for (const r of failed) {
  console.log(`  FAIL size=${r.size} cause=${r.rootCauseHint} err=${String(r.error ?? "").slice(0, 120)}`);
}
process.exit(failed.length ? 1 : 0);
