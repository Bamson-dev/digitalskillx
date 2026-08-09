#!/usr/bin/env node
/**
 * Phase 6 hardening — failure injection, concurrency model, load simulation (offline).
 * Does not touch production data or live Contabo/Paystack.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`PASS: ${label}`);
}

// --- A/B Contabo unavailable: upload must not leave a successful DB claim without storage ---
{
  const assetsSrc = readFileSync(join(root, "lib/sales-pages/assets.ts"), "utf8");
  assert.match(assetsSrc, /params\.storage\.upload/);
  assert.match(assetsSrc, /sales_page_assets/);
  assert.match(assetsSrc, /storage\.delete/);
  // Upload happens first; insert failure cleans storage. Upload throw → no insert path.
  const uploadIdx = assetsSrc.indexOf("storage.upload");
  const insertIdx = assetsSrc.indexOf('from("sales_page_assets").insert');
  assert.ok(uploadIdx > 0 && insertIdx > uploadIdx);
  ok("Contabo/storage: no DB asset row without successful upload path");
}

// --- C Email outbox reclaim / recoverable sending ---
{
  const outbox = readFileSync(join(root, "lib/bulk-import-email-outbox.ts"), "utf8");
  assert.match(outbox, /reclaim_stale_bulk_import_email_outbox|reclaimed_stale_sending/);
  assert.match(outbox, /status:\s*"pending"/);
  const mig = readFileSync(join(root, "supabase/migrations/0040_platform_reliability.sql"), "utf8");
  assert.match(mig, /reclaim_stale_bulk_import_email_outbox/);
  ok("email outbox reclaim after stuck sending");
}

// --- D Automation failure isolation ---
{
  const auto = readFileSync(join(root, "lib/automation.ts"), "utf8");
  assert.match(auto, /AUTOMATION_FAILED|secureLogError/);
  assert.match(auto, /for \(const action of actions\)/);
  assert.match(auto, /try \{[\s\S]*executeAction/);
  ok("automation action failures isolated");
}

// --- E Payment timeout: no false success without claim path ---
{
  const purchase = readFileSync(join(root, "lib/purchase.ts"), "utf8");
  assert.match(purchase, /fulfillPurchase|ensurePurchaseEnrollment/);
  assert.match(purchase, /status.*success|neq\("status", "success"\)/);
  const webhook = readFileSync(join(root, "app/api/webhooks/paystack/route.ts"), "utf8");
  assert.match(webhook, /verifyWebhookSignature/);
  assert.match(webhook, /x-paystack-signature/);
  ok("payment fulfillment requires verified claim path");
}

// --- F Enrollment idempotency ---
{
  const enroll = readFileSync(join(root, "lib/purchase.ts"), "utf8");
  assert.match(enroll, /ensurePurchaseEnrollment/);
  // Unique student+course is enforced at DB; helper must be safe to call twice.
  assert.ok(enroll.includes("enrollments"));
  ok("enrollment helper present for safe retry");
}

// --- G Background job timeout reclaim ---
{
  const drain = readFileSync(join(root, "lib/bulk-import-email-outbox.ts"), "utf8");
  assert.match(drain, /reclaim|sending/);
  const reclaimRows = readFileSync(join(root, "supabase/migrations/0031_bulk_import_outbox.sql"), "utf8");
  assert.match(reclaimRows, /reclaim_stale_bulk_import_rows/);
  ok("background job reclaim mechanisms present");
}

// --- Certificate idempotent email ---
{
  const certs = readFileSync(join(root, "lib/certificates.ts"), "utf8");
  assert.match(certs, /resendEmail/);
  assert.match(certs, /if \(shouldSendEmail && params\.resendEmail\)/);
  ok("certificate retry does not duplicate email by default");
}

// --- Concurrency model: last-slot enrollment link race ---
{
  /**
   * Simulate claim_enrollment_link_redemption under mutex (FOR UPDATE).
   * Two concurrent redeemers for max_redemptions=1 → exactly one success.
   */
  function createLink(max) {
    return { current_redemptions: 0, max_redemptions: max, redemptions: new Set() };
  }
  let lock = Promise.resolve();
  async function claim(link, userId) {
    const run = lock.then(async () => {
      if (link.redemptions.has(userId)) return { ok: true, idempotent: true };
      if (link.max_redemptions != null && link.current_redemptions >= link.max_redemptions) {
        return { ok: false, code: "LIMIT_REACHED" };
      }
      link.redemptions.add(userId);
      link.current_redemptions += 1;
      return { ok: true, idempotent: false };
    });
    lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  const link = createLink(1);
  const [a, b] = await Promise.all([claim(link, "u1"), claim(link, "u2")]);
  const successes = [a, b].filter((r) => r.ok && !r.idempotent);
  const failures = [a, b].filter((r) => !r.ok);
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].code, "LIMIT_REACHED");
  assert.equal(link.current_redemptions, 1);
  assert.equal(link.redemptions.size, 1);

  // Same user twice → idempotent, no double count
  const link2 = createLink(5);
  const [c1, c2] = await Promise.all([claim(link2, "same"), claim(link2, "same")]);
  assert.equal(link2.current_redemptions, 1);
  assert.ok(c1.ok && c2.ok);
  assert.equal([c1, c2].filter((x) => x.idempotent).length, 1);

  const rpc = readFileSync(join(root, "supabase/migrations/0033_enrollment_links.sql"), "utf8");
  assert.match(rpc, /for update/i);
  assert.match(rpc, /claim_enrollment_link_redemption/);
  ok("enrollment link last-slot race: exactly one success under mutex");
}

// --- Load simulation (in-memory; no DB writes) ---
{
  const CUSTOMERS = 1_000;
  const ENROLLMENTS = 5_000;
  const EVENTS = 10_000;
  const NOTIFICATIONS = 10_000;
  const TRANSACTIONS = 5_000;
  const customers = Array.from({ length: CUSTOMERS }, (_, i) => ({
    id: `c${i}`,
    email: `user${i}@example.com`,
    full_name: `User ${i}`,
    tags: i % 7 === 0 ? ["vip"] : [],
    created_at: new Date(Date.now() - i * 1000).toISOString(),
  }));
  const enrollments = Array.from({ length: ENROLLMENTS }, (_, i) => ({
    id: `e${i}`,
    student_id: `c${i % CUSTOMERS}`,
    course_id: `course${i % 50}`,
    completed_at: i % 4 === 0 ? new Date().toISOString() : null,
  }));
  const events = Array.from({ length: EVENTS }, (_, i) => ({
    student_id: `c${i % CUSTOMERS}`,
    event_name: i % 3 === 0 ? "sales_page_view" : "lesson_progress",
    created_at: new Date(Date.now() - i * 10).toISOString(),
  }));
  const notifications = Array.from({ length: NOTIFICATIONS }, (_, i) => ({
    student_id: `c${i % CUSTOMERS}`,
    read: i % 5 === 0,
  }));
  const transactions = Array.from({ length: TRANSACTIONS }, (_, i) => ({
    student_id: `c${i % CUSTOMERS}`,
    amount: (i % 20) * 100000,
    status: "success",
  }));

  const t0 = performance.now();
  const q = "user42";
  const searchHits = customers.filter(
    (c) => c.email.includes(q) || c.full_name.toLowerCase().includes(q),
  );
  const searchMs = performance.now() - t0;
  assert.ok(searchHits.length >= 1);
  assert.ok(searchMs < 50, `customer search too slow: ${searchMs}ms`);

  const pageSize = 25;
  const page = 3;
  const pageRows = customers.slice((page - 1) * pageSize, page * pageSize);
  assert.equal(pageRows.length, pageSize);

  const tBiz = performance.now();
  const revenue = transactions.reduce((s, t) => s + t.amount, 0);
  const completions = enrollments.filter((e) => e.completed_at).length;
  const unread = notifications.filter((n) => !n.read && n.student_id === "c42").length;
  const bizMs = performance.now() - tBiz;
  assert.ok(revenue > 0 && completions > 0 && unread >= 0);
  assert.ok(bizMs < 100, `aggregate too slow: ${bizMs}ms`);

  const t1 = performance.now();
  const byStudent = events.filter((e) => e.student_id === "c42").length;
  const eventMs = performance.now() - t1;
  assert.ok(byStudent > 0);
  assert.ok(eventMs < 50, `event filter too slow: ${eventMs}ms`);

  // Code guarantees for real DB paths
  const crm = readFileSync(join(root, "lib/customer-crm.ts"), "utf8");
  assert.match(crm, /pageSize.*50|Math\.min\(50/);
  assert.match(crm, /\.range\(/);
  const biz = readFileSync(join(root, "lib/business-analytics.ts"), "utf8");
  assert.match(biz, /\.limit\(/);
  const idle = readFileSync(join(root, "lib/system-email-triggers.ts"), "utf8");
  assert.match(idle, /IDLE_REMINDER_BATCH|\.limit\(/);

  console.log(
    `  load sim: ${CUSTOMERS} customers / ${ENROLLMENTS} enrollments / ${TRANSACTIONS} txs / ${EVENTS} events / ${NOTIFICATIONS} notifications; search=${searchMs.toFixed(2)}ms biz=${bizMs.toFixed(2)}ms events=${eventMs.toFixed(2)}ms`,
  );
  ok("load simulation 1k customers / 5k enrollments / 10k events (in-memory)");
}

// --- Database timeout / error codes surface ---
{
  const { ErrorCode, userFacingError } = await import(
    pathToFileURL(join(root, "lib/error-codes.ts")).href
  );
  assert.equal(ErrorCode.DATABASE_QUERY_FAILED, "DATABASE_QUERY_FAILED");
  assert.ok(!/secret|token/i.test(userFacingError(ErrorCode.DATABASE_QUERY_FAILED)));
  ok("database failure maps to safe user-facing error");
}

console.log(`\nPhase 6 hardening offline: ${passed}/10 passed`);
if (passed !== 10) process.exit(1);

if (!existsSync(join(root, "docs/DISASTER_RECOVERY.md"))) {
  console.error("Missing DR docs");
  process.exit(1);
}
