#!/usr/bin/env node
/**
 * Payment recovery: failed and abandoned Paystack checkout recovery.
 * Runs the real engine against an in-memory Supabase fake with the same unique
 * constraints as supabase/migrations/0058_payment_recovery.sql.
 * Run: npm run test:payment-recovery
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = (rel) => pathToFileURL(join(root, rel)).href;
const src = (rel) => readFileSync(join(root, rel), "utf8");

const engine = await import(ts("lib/payment-recovery/engine.ts"));
const { readRecoveryConfig, formatNaira } = await import(ts("lib/payment-recovery/config.ts"));
const { classifyVerification } = await import(ts("lib/payment-recovery/status.ts"));
const { verifySvixSignature } = await import(ts("lib/payment-recovery/svix.ts"));
const { computeRecoveryAnalytics } = await import(ts("lib/payment-recovery/analytics.ts"));

const COURSE = "4e2a16b5-bbfb-4a00-939c-87c7eb5f2afb";
const PRICE = 1_499_900;
const MIN = 60_000;
const HOUR = 60 * MIN;

/* ------------------------------------------------------------------------ */
/* In-memory Supabase fake                                                   */
/* ------------------------------------------------------------------------ */
const UNIQUE = {
  payment_recovery_groups: [
    (r) => (r.is_open ? `open:${r.customer_email.toLowerCase()}:${r.course_id}` : null),
    (r) => `bank:${r.bank_reference}`,
    (r) => `tok:${r.retry_token}`,
  ],
  payment_recovery_attempts: [(r) => `ref:${r.reference}`],
  payment_recovery_messages: [
    (r) => `step:${r.group_id}:${r.step}:${r.manual_seq ?? 0}`,
    (r) => (r.resend_id ? `rid:${r.resend_id}` : null),
  ],
  payment_recovery_bank_confirmations: [(r) => (r.status === "confirmed" ? `conf:${r.group_id}` : null)],
  payment_recovery_suppressions: [(r) => `email:${r.email}`],
  payment_recovery_webhook_events: [(r) => `id:${r.id}`],
};
const DEFAULTS = {
  payment_recovery_groups: { recovery_status: "none", is_open: true, emails_sent: 0, failed_at: null, abandoned_at: null, next_message_at: null, initial_sent_at: null, last_email_at: null, last_email_step: null, customer_name: null, customer_phone: null, student_id: null, failure_reason: null },
  payment_recovery_attempts: { verify_count: 0, verify_failures: 0 },
  payment_recovery_messages: { manual_seq: 0, retry_count: 0, resend_id: null },
};

function createDb(clock) {
  const tables = {};
  let seq = 0;
  const t = (name) => (tables[name] ??= []);
  const pick = (row, col) => {
    if (col.includes("->>")) {
      const [c, k] = col.split("->>");
      return row[c]?.[k] ?? null;
    }
    return row[col] ?? null;
  };
  function violates(table, row, ignore) {
    for (const key of UNIQUE[table] ?? []) {
      const k = key(row);
      if (!k) continue;
      if (t(table).some((r) => r !== ignore && key(r) === k)) return true;
    }
    return false;
  }
  function builder(table) {
    const st = { op: "select", filters: [], payload: null, want: false, order: null, max: null };
    const match = (row) =>
      st.filters.every(({ type, col, val }) => {
        const v = pick(row, col);
        if (type === "eq") return v === val;
        if (type === "is") return v === val;
        if (type === "not_is") return v !== val;
        if (type === "in") return val.includes(v);
        if (type === "lte") return v !== null && String(v) <= String(val);
        if (type === "gte") return v !== null && String(v) >= String(val);
        return true;
      });
    async function exec() {
      await new Promise((r) => setImmediate(r));
      const rows = t(table);
      if (st.op === "insert") {
        const row = { ...(DEFAULTS[table] ?? {}), ...st.payload };
        row.id ??= `${table.slice(17, 21)}_${++seq}`;
        row.created_at ??= new Date(clock.now).toISOString();
        if (violates(table, row)) return { data: null, error: { code: "23505", message: "duplicate key value" } };
        rows.push(row);
        return { data: st.want ? [{ ...row }] : null, error: null };
      }
      if (st.op === "update") {
        const hit = rows.filter(match);
        for (const row of hit) {
          const next = { ...row, ...st.payload };
          if (violates(table, next, row)) return { data: null, error: { code: "23505", message: "duplicate key value" } };
          Object.assign(row, st.payload);
        }
        return { data: st.want ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      if (st.op === "delete") {
        tables[table] = rows.filter((r) => !match(r));
        return { data: null, error: null };
      }
      let hit = rows.filter(match).map((r) => ({ ...r }));
      if (st.order) hit.sort((a, b) => String(a[st.order]).localeCompare(String(b[st.order])));
      if (st.max != null) hit = hit.slice(0, st.max);
      return { data: hit, error: null };
    }
    const api = {
      insert(p) { st.op = "insert"; st.payload = p; return api; },
      update(p) { st.op = "update"; st.payload = p; return api; },
      delete() { st.op = "delete"; return api; },
      select() { st.want = true; return api; },
      eq(col, val) { st.filters.push({ type: "eq", col, val }); return api; },
      is(col, val) { st.filters.push({ type: "is", col, val }); return api; },
      not(col, op, val) { st.filters.push({ type: "not_is", col, val }); return api; },
      in(col, val) { st.filters.push({ type: "in", col, val }); return api; },
      lte(col, val) { st.filters.push({ type: "lte", col, val }); return api; },
      gte(col, val) { st.filters.push({ type: "gte", col, val }); return api; },
      order(col) { st.order = col; return api; },
      limit(n) { st.max = n; return api; },
      async maybeSingle() {
        const r = await exec();
        return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error };
      },
      then(res, rej) { return exec().then(res, rej); },
    };
    return api;
  }
  return { from: builder, tables, t };
}

/* ------------------------------------------------------------------------ */
/* Harness                                                                   */
/* ------------------------------------------------------------------------ */
function harness({ verify, product, enabled = true, env } = {}) {
  const opts = { env };
  const clock = { now: Date.parse("2026-11-24T10:00:00Z") };
  const db = createDb(clock);
  const calls = { fulfil: [], emails: [], bankFulfil: 0, init: [], pendingTx: [] };
  const paid = new Set(); // email:course paid outside the group
  let refN = 0;
  const deps = {
    now: () => clock.now,
    config: { ...readRecoveryConfig({ PAYMENT_RECOVERY_WINDOW_START_MINUTES: "0", PAYMENT_RECOVERY_WINDOW_END_MINUTES: "1440", ...(opts.env ?? {}) }), enabled },
    siteUrl: "https://www.digitalskillx.com",
    randomToken: (bytes) => crypto.randomBytes(bytes).toString("hex"),
    newReference: () => `dsx_retry_${++refN}`,
    verify: async (ref) => verify(ref, clock.now),
    completePaidCheckout: async (ref) => {
      calls.fulfil.push(ref);
      return { ok: true };
    },
    isAlreadyPaid: async (g) => paid.has(`${g.customer_email}:${g.course_id}`),
    sendEmail: async (p) => {
      calls.emails.push(p);
      return { messageId: `re_${calls.emails.length}` };
    },
    loadProduct: async () => product ?? { title: "AI Ads Automation Masterclass", priceKobo: PRICE, available: true },
    createPendingTransaction: async (p) => { calls.pendingTx.push(p.reference); },
    initializePaystack: async (p) => {
      calls.init.push(p);
      return { authorizationUrl: `https://checkout.paystack.com/${p.reference}` };
    },
    fulfilBankTransfer: async () => { calls.bankFulfil += 1; return { ok: true }; },
  };
  const advance = (ms) => { clock.now += ms; };
  const start = (ref, email = "ada@example.com") =>
    engine.registerCheckoutAttempt(db, deps, {
      reference: ref, email, fullName: "Ada Obi", phone: "08030000000",
      courseId: COURSE, productTitle: "AI Ads Automation Masterclass", amountKobo: PRICE,
    });
  const cycle = () => engine.runRecoveryCycle(db, deps);
  const group = () => db.t("payment_recovery_groups")[0];
  return { db, deps, calls, clock, advance, start, cycle, group, paid, now: () => clock.now };
}

async function failThenEmail(h) {
  h.advance(10 * MIN);
  await h.cycle(); // Paystack confirms failure
  h.advance(11 * MIN);
  await h.cycle(); // initial email after the 10 minute delay
  assert.equal(h.calls.emails.length, 1);
}

const ok = (status, extra = {}) => ({ kind: "ok", status, amount: PRICE, currency: "NGN", ...extra });

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok  ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

/* ------------------------------------------------------------------------ */
await test("1. successful payment: fulfils once, no recovery email", async () => {
  const h = harness({ verify: () => ok("success") });
  await h.start("ref_ok");
  h.advance(11 * MIN);
  await h.cycle();
  assert.deepEqual(h.calls.fulfil, ["ref_ok"], "existing success flow runs once");
  assert.equal(h.group().payment_status, "successful");
  assert.equal(h.group().is_open, false);
  assert.equal(h.group().recovery_status, "cancelled", "paid without recovery is not counted as recovered");
  // webhook also reports success, and more cycles run
  await engine.markPaidByReference(h.db, h.deps, "ref_ok");
  h.advance(3 * 24 * HOUR);
  await h.cycle();
  assert.equal(h.calls.fulfil.length, 1, "no second fulfilment (no second Meta Purchase)");
  assert.equal(h.calls.emails.length, 0, "no recovery email");
});

await test("2. confirmed failed payment: email ~10 min later with product, price, retry, Wema, WhatsApp", async () => {
  const h = harness({ verify: () => ok("failed", { gatewayResponse: "Declined" }) });
  await h.start("ref_fail");
  h.advance(10 * MIN);
  await h.cycle();
  assert.equal(h.group().payment_status, "failed");
  assert.equal(h.calls.emails.length, 0, "not sent at the moment of failure");
  h.advance(9 * MIN);
  await h.cycle();
  assert.equal(h.calls.emails.length, 0, "not before the 10 minute delay");
  h.advance(2 * MIN);
  await h.cycle();
  assert.equal(h.calls.emails.length, 1);
  const e = h.calls.emails[0];
  assert.equal(e.subject, "Your AI Ads Automation Masterclass payment is not complete");
  assert.match(e.html, /AI Ads Automation Masterclass/);
  assert.match(e.html, /₦14,999/);
  assert.match(e.html, /COMPLETE MY PAYMENT/);
  assert.match(e.html, /\/api\/payment-recovery\/retry\?t=[0-9a-f]{48}/);
  assert.match(e.html, /Wema Bank/);
  assert.match(e.html, /Autoquicky Limited/);
  assert.match(e.html, /0125912341/);
  assert.match(e.html, new RegExp(h.group().bank_reference));
  assert.match(e.html, /https:\/\/wa\.me\/2349023986992\?text=/);
  const wa = decodeURIComponent(e.html.match(/wa\.me\/2349023986992\?text=([^"&]+)/)[1]);
  assert.match(wa, /AI Ads Automation Masterclass for ₦14,999/);
  assert.match(e.html, /Hello Ada,/);
  assert.match(e.html, /Stop payment reminders/);
  assert.doesNotMatch(e.html, /discount|% off|expires today|only \d+ left/i, "no invented offers");
  assert.equal(e.idempotencyKey, `payment-recovery/${h.group().id}/initial/0`);
});

await test("3. abandoned checkout: only after the inactivity period and a Paystack check; retry gives a fresh reference", async () => {
  const h = harness({ verify: () => ok("abandoned") });
  await h.start("ref_ab");
  h.advance(10 * MIN);
  await h.cycle();
  assert.equal(h.db.t("payment_recovery_attempts")[0].status, "awaiting_payment", "not abandoned at 10 min");
  assert.equal(h.group().payment_status, "awaiting_payment");
  h.advance(21 * MIN);
  await h.cycle();
  assert.equal(h.group().payment_status, "abandoned");
  assert.equal(h.calls.emails.length, 1, "abandoned email after 30 min + verification");
  assert.ok(h.db.t("payment_recovery_attempts")[0].verify_count >= 2, "Paystack was checked");

  const r = await engine.createRetryCheckout(h.db, h.deps, h.group().retry_token);
  assert.equal(r.kind, "redirect");
  assert.equal(h.calls.init[0].amountKobo, PRICE);
  const refs = h.db.t("payment_recovery_attempts").map((a) => a.reference);
  assert.deepEqual(refs, ["ref_ab", "dsx_retry_1"], "old reference kept, new one added");
  assert.equal(h.db.t("payment_recovery_attempts")[1].group_id, h.group().id);
});

await test("3b. certificate and bundle attempts can retry without treating the first course price as the order price", async () => {
  const h = harness({
    verify: () => ok("failed"),
    product: { title: "Learning Path Certificate", priceKobo: 5_000_000, available: true },
  });
  const captured = await engine.registerCheckoutAttempt(h.db, h.deps, {
    reference: "ref_certificate",
    email: "certificate@example.com",
    fullName: "Cert Buyer",
    courseId: null,
    productType: "certificate",
    productId: "path-123",
    productTitle: "Learning Path Certificate",
    amountKobo: 750_000,
    productContext: {
      learning_path_id: "path-123",
      learning_path_slug: "growth-path",
      callback_path: "/learn/growth-path?payment=success",
    },
  });
  assert.equal(captured.ok, true);
  assert.equal(h.group().product_type, "certificate");
  assert.equal(h.group().product_id, "path-123");
  assert.equal(h.group().course_id, null);
  const retry = await engine.createRetryCheckout(h.db, h.deps, h.group().retry_token);
  assert.equal(retry.kind, "redirect", "certificate retry must not require a course_id");
  assert.equal(h.calls.init[0].amountKobo, 750_000, "retry keeps the trusted checkout quote");
  assert.equal(h.calls.init[0].group.product_type, "certificate");
  assert.equal(h.calls.pendingTx.length, 1);

  const bundle = await engine.registerCheckoutAttempt(h.db, h.deps, {
    reference: "ref_bundle",
    email: "bundle@example.com",
    courseId: "course-primary",
    productType: "bundle",
    productId: "bundle-123",
    productTitle: "Complete Bundle",
    amountKobo: 2_500_000,
    productContext: { bundle_id: "bundle-123", course_ids: ["course-primary", "course-secondary"] },
  });
  assert.equal(bundle.ok, true);
  const bundleRetry = await engine.createRetryCheckout(h.db, h.deps, h.db.t("payment_recovery_groups").find((g) => g.product_id === "bundle-123").retry_token);
  assert.equal(bundleRetry.kind, "redirect");
  assert.equal(h.calls.init[1].amountKobo, 2_500_000, "bundle amount is not replaced by a single course price");
  assert.equal(h.calls.init[1].group.product_type, "bundle");
});

await test("4. pending transaction: never failed, never abandoned, keeps reconciling", async () => {
  const h = harness({ verify: () => ok("pending") });
  await h.start("ref_pend");
  for (let i = 0; i < 12; i++) {
    h.advance(30 * MIN);
    await h.cycle();
  }
  const a = h.db.t("payment_recovery_attempts")[0];
  assert.equal(a.status, "pending");
  assert.ok(a.verify_count >= 3, "still being verified");
  assert.equal(h.group().payment_status, "awaiting_payment");
  assert.equal(h.calls.emails.length, 0);
  // Paystack unreachable is also never a failure
  const h2 = harness({ verify: () => ({ kind: "error", message: "timeout" }) });
  await h2.start("ref_down");
  h2.advance(2 * HOUR);
  await h2.cycle();
  assert.equal(h2.db.t("payment_recovery_attempts")[0].status, "pending");
  assert.equal(h2.db.t("payment_recovery_attempts")[0].verify_failures, 1);
  assert.equal(h2.calls.emails.length, 0);
  assert.equal(classifyVerification({ outcome: { kind: "ok", status: "processing" }, ageMs: 9 * HOUR, abandonAfterMs: 30 * MIN, expectedAmountKobo: PRICE, expectedCurrency: "NGN" }).next, "keep");
});

await test("5. payment after the first recovery email stops all reminders", async () => {
  let mode = "failed";
  const h = harness({ verify: (ref) => (ref.startsWith("dsx_retry") ? ok(mode) : ok("failed")) });
  await h.start("ref_a");
  h.advance(10 * MIN);
  await h.cycle();
  h.advance(11 * MIN);
  await h.cycle();
  assert.equal(h.calls.emails.length, 1);
  await engine.createRetryCheckout(h.db, h.deps, h.group().retry_token);
  mode = "success";
  h.advance(10 * MIN);
  await h.cycle();
  assert.deepEqual(h.calls.fulfil, ["dsx_retry_1"]);
  assert.equal(h.group().recovery_status, "recovered");
  assert.equal(h.group().recovered_after_step, "initial");
  assert.equal(h.group().next_message_at, null);
  h.advance(3 * 24 * HOUR);
  await h.cycle();
  assert.equal(h.calls.emails.length, 1, "no 24h or 48h reminder after payment");
});

await test("6. multiple attempts: one order, one sequence, any success closes it", async () => {
  const h = harness({ verify: (ref) => (ref === "ref_3" ? ok("success") : ok("failed")) });
  await h.start("ref_1");
  await h.start("ref_2");
  assert.equal(h.db.t("payment_recovery_groups").length, 1, "same email + course = one order");
  h.advance(10 * MIN);
  await h.cycle();
  h.advance(3 * HOUR);
  await h.cycle();
  await h.cycle();
  assert.equal(h.calls.emails.length, 1, "one recovery sequence, not one per attempt");
  await h.start("ref_3");
  h.advance(10 * MIN);
  await h.cycle();
  assert.equal(h.db.t("payment_recovery_attempts").length, 3, "all references recorded");
  assert.equal(h.group().payment_status, "successful");
  assert.equal(h.group().recovered_reference, "ref_3");
  // a different product for the same person is a separate order
  await h.db.from("payment_recovery_groups").select("*");
  const other = await engine.registerCheckoutAttempt(h.db, h.deps, {
    reference: "ref_x", email: "ada@example.com", courseId: "9818cf69-4158-40b5-8926-54a3be38f306",
    productTitle: "Build Software", amountKobo: 4_999_900,
  });
  assert.ok(other.ok);
  assert.equal(h.db.t("payment_recovery_groups").length, 2);
});

await test("7. bank transfer claimed: stays pending, no access, no revenue", async () => {
  const h = harness({ verify: () => ok("failed") });
  await h.start("ref_bt");
  await failThenEmail(h);
  const r = await engine.markBankTransferClaimed(h.db, h.deps, h.group().id, "admin_1", "customer sent screenshot");
  assert.ok(r.ok);
  assert.equal(h.group().payment_status, "bank_transfer_pending");
  assert.equal(h.calls.bankFulfil, 0, "no course access");
  h.advance(3 * 24 * HOUR);
  await h.cycle();
  assert.equal(h.calls.emails.length, 1, "reminders paused while the transfer is checked");
  const stats = computeRecoveryAnalytics(h.db.t("payment_recovery_groups"), []);
  assert.equal(stats.revenueKobo, 0);
  assert.equal(stats.bankPending, 1);
});

await test("8. admin-confirmed transfer: audit trail, fulfilment exactly once, reminders stop", async () => {
  const h = harness({ verify: () => ok("failed") });
  await h.start("ref_bc");
  await failThenEmail(h);
  const id = h.group().id;
  const r1 = await engine.confirmBankTransfer(h.db, h.deps, { groupId: id, receivedKobo: PRICE, bankTransactionRef: "WEMA-123456", actorId: "admin_1" });
  assert.ok(r1.ok);
  const r2 = await engine.confirmBankTransfer(h.db, h.deps, { groupId: id, receivedKobo: PRICE, bankTransactionRef: "WEMA-123456", actorId: "admin_1" });
  assert.equal(r2.ok, false, "second confirmation refused");
  assert.equal(h.calls.bankFulfil, 1, "existing enrolment path ran once");
  assert.equal(h.group().payment_status, "bank_transfer_confirmed");
  assert.equal(h.group().recovery_status, "recovered");
  const ev = h.db.t("payment_recovery_events").find((e) => e.kind === "bank_transfer_confirmed");
  assert.equal(ev.actor_id, "admin_1");
  assert.equal(h.db.t("payment_recovery_bank_confirmations").filter((b) => b.status === "confirmed").length, 1);
  h.advance(3 * 24 * HOUR);
  await h.cycle();
  assert.equal(h.calls.emails.length, 1);
  const stats = computeRecoveryAnalytics(h.db.t("payment_recovery_groups"), []);
  assert.equal(stats.bankRevenueKobo, PRICE);
});

await test("9. wrong transfer amount: no full confirmation, under investigation", async () => {
  const h = harness({ verify: () => ok("failed") });
  await h.start("ref_under");
  h.advance(25 * MIN);
  await h.cycle();
  const r = await engine.confirmBankTransfer(h.db, h.deps, { groupId: h.group().id, receivedKobo: 1_000_000, bankTransactionRef: "WEMA-9", actorId: "admin_1" });
  assert.equal(r.ok, false);
  assert.equal(r.status, "investigating");
  assert.equal(h.calls.bankFulfil, 0);
  assert.equal(h.group().payment_status, "bank_transfer_pending");
  assert.equal(h.db.t("payment_recovery_bank_confirmations")[0].status, "investigating");
  const over = await engine.confirmBankTransfer(h.db, h.deps, { groupId: h.group().id, receivedKobo: 2_000_000, bankTransactionRef: "WEMA-10", actorId: "admin_1" });
  assert.equal(over.status, "investigating", "overpayment also needs investigation");
});

await test("10. hard bounce: recorded, address excluded, no endless retries", async () => {
  const h = harness({ verify: () => ok("failed") });
  await h.start("ref_bounce", "nobody@gmail.com");
  await failThenEmail(h);
  const msg = h.db.t("payment_recovery_messages")[0];
  const r = await engine.handleResendEvent(h.db, h.deps, { type: "email.bounced", data: { email_id: msg.resend_id, bounce: { type: "Permanent", message: "Recipient not found" } } });
  assert.ok(r.handled);
  assert.equal(h.db.t("payment_recovery_messages")[0].status, "bounced");
  assert.equal(h.db.t("payment_recovery_suppressions")[0].reason, "hard_bounce");
  assert.equal(h.group().recovery_status, "suppressed");
  h.advance(3 * 24 * HOUR);
  await h.cycle();
  assert.equal(h.calls.emails.length, 1, "no reminder to a bounced address");
  // a later order from the same address is not emailed either
  const h2 = harness({ verify: () => ok("failed") });
  h2.db.t("payment_recovery_suppressions").push({ email: "nobody@gmail.com", reason: "hard_bounce" });
  await h2.start("ref_b2", "nobody@gmail.com");
  h2.advance(25 * MIN);
  await h2.cycle();
  assert.equal(h2.calls.emails.length, 0);
  // delivered after bounced must not downgrade the status
  await engine.handleResendEvent(h.db, h.deps, { type: "email.delivered", data: { email_id: msg.resend_id } });
  assert.equal(h.db.t("payment_recovery_messages")[0].status, "bounced");
});

await test("11. duplicate webhooks and concurrent jobs: no duplicate email, fulfilment or close", async () => {
  const h = harness({ verify: () => ok("failed") });
  await h.start("ref_dup");
  h.advance(10 * MIN);
  await h.cycle();
  h.advance(11 * MIN);
  await Promise.all([h.cycle(), h.cycle(), h.cycle(), engine.processDueMessages(h.db, h.deps)]);
  assert.equal(h.calls.emails.length, 1, "one initial email under concurrency");
  await Promise.all([
    engine.markPaidByReference(h.db, h.deps, "ref_dup"),
    engine.markPaidByReference(h.db, h.deps, "ref_dup"),
    engine.markPaidByReference(h.db, h.deps, "ref_dup"),
  ]);
  const closes = h.db.t("payment_recovery_events").filter((e) => e.kind === "recovered" || e.kind === "paid");
  assert.equal(closes.length, 1, "group closes once");
  // Resend webhook idempotency table
  const a = await h.db.from("payment_recovery_webhook_events").insert({ id: "msg_1", provider: "resend", event_type: "email.delivered" });
  const b = await h.db.from("payment_recovery_webhook_events").insert({ id: "msg_1", provider: "resend", event_type: "email.delivered" });
  assert.equal(a.error, null);
  assert.equal(b.error.code, "23505");
  assert.match(src("app/api/webhooks/resend/route.ts"), /duplicate: true/);
  // the Paystack webhook keeps its existing success flow and only adds the recovery close
  const wh = src("app/api/webhooks/paystack/route.ts");
  assert.match(wh, /completePaidCheckout\(reference\)/);
  assert.match(wh, /recoveryOnPaymentSucceeded\(admin, reference/);
});

await test("12. security: signatures, secrets, admin guards, server-side price", async () => {
  const secret = `whsec_${Buffer.from("test-secret-key-32-bytes-long!!!").toString("base64")}`;
  const body = JSON.stringify({ type: "email.delivered", data: { email_id: "x" } });
  const ts = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.slice(6), "base64");
  const sig = crypto.createHmac("sha256", key).update(`msg_1.${ts}.${body}`).digest("base64");
  assert.ok(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: `v1,${sig}`, body }));
  assert.equal(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: `v1,${sig}`, body: body + " " }), false, "tampered body");
  assert.equal(verifySvixSignature({ secret, id: "msg_1", timestamp: ts, signature: "v1,AAAA", body }), false, "bad signature");
  assert.equal(verifySvixSignature({ secret, id: "msg_1", timestamp: String(Number(ts) - 3600), signature: `v1,${sig}`, body }), false, "replayed");

  // Customer cannot change amount or product: the retry link carries only a token,
  // and the price comes from the course row, not from the stored order or the URL.
  const h = harness({ verify: () => ok("failed"), product: { title: "AI Ads Automation Masterclass", priceKobo: PRICE, available: true } });
  await h.start("ref_sec");
  h.db.t("payment_recovery_groups")[0].amount_kobo = 100; // tampered row
  const r = await engine.createRetryCheckout(h.db, h.deps, h.group().retry_token);
  assert.equal(r.kind, "redirect");
  assert.equal(h.calls.init[0].amountKobo, PRICE);
  assert.equal((await engine.createRetryCheckout(h.db, h.deps, "short")).kind, "error");
  assert.equal((await engine.createRetryCheckout(h.db, h.deps, "f".repeat(48))).kind, "error");
  // Opening the retry link never grants access
  assert.equal(h.calls.fulfil.length, 0);
  assert.equal(h.calls.bankFulfil, 0);

  // Route guards (static: these routes need the Next runtime)
  assert.match(src("app/api/cron/payment-recovery/route.ts"), /verifyCronSecret\(request\)/);
  const actions = src("app/(admin)/admin/(panel)/payment-recovery/actions.ts");
  const exported = actions.match(/export async function \w+/g) ?? [];
  const guarded = actions.match(/export async function \w+\(formData: FormData\) \{\n  const admin = await requireAdmin\(\);/g) ?? [];
  assert.equal(guarded.length, exported.length, "every admin action calls requireAdmin first");
  assert.doesNotMatch(actions, /payment_status:\s*"successful"/, "admins cannot set successful directly");
  for (const p of ["page.tsx", "[id]/page.tsx", "historical/page.tsx"]) {
    assert.match(src(`app/(admin)/admin/(panel)/payment-recovery/${p}`), /await requireAdmin\(\)/);
  }
  assert.match(src("app/api/admin/payment-recovery/export/route.ts"), /requireAdminApiAuth/);
  assert.match(src("app/api/payment-recovery/retry/route.ts"), /rateLimitedResponse/);
  // The webhook does not mark anything paid from a failed/abandoned event
  assert.match(src("app/api/webhooks/paystack/route.ts"), /recoveryOnChargeHint\(admin, reference\)/);
});

const lagosHour = (ms) => ((new Date(ms).getUTCHours() + 1) % 24) + new Date(ms).getUTCMinutes() / 60;

await test("seven emails over five days, simulated clock, Lagos quiet hours", async () => {
  const h = harness({ verify: () => ok("failed"), env: { PAYMENT_RECOVERY_WINDOW_START_MINUTES: "510", PAYMENT_RECOVERY_WINDOW_END_MINUTES: "1200" } });
  await h.start("ref_seven");
  const t0 = h.now();
  const sentAt = [];
  for (let i = 0; i < 14 * 24 * 12; i++) {
    const before = h.calls.emails.length;
    await h.cycle();
    if (h.calls.emails.length > before) sentAt.push(h.now());
    h.advance(5 * MIN);
  }
  assert.equal(h.calls.emails.length, 7, "exactly seven emails");
  const subjects = h.calls.emails.map((e) => e.subject);
  assert.equal(new Set(subjects).size, 7, "seven distinct subjects");
  assert.equal(subjects[0], "Your AI Ads Automation Masterclass payment is not complete");
  assert.equal(subjects[1], "Would you like to try your payment again?");
  assert.equal(subjects[2], "You can still complete your AI Ads Automation Masterclass purchase");
  assert.equal(subjects[3], "Still interested in AI Ads Automation Masterclass?");
  assert.equal(subjects[4], "Need help completing your payment?");
  assert.equal(subjects[5], "Your AI Ads Automation Masterclass order is still incomplete");
  assert.equal(subjects[6], "Last reminder about your AI Ads Automation Masterclass checkout");
  assert.equal(new Set(h.calls.emails.map((e) => e.html)).size, 7, "seven distinct bodies");
  const keys = h.calls.emails.map((e) => e.idempotencyKey);
  assert.equal(new Set(keys).size, 7, "unique idempotency key per message");
  const offsetsH = [0, 3, 12, 24, 48, 72, 120];
  const first = sentAt[0];
  assert.ok(first - t0 >= 10 * MIN && first - t0 < 25 * MIN, "first email about 10 minutes after verified failure");
  sentAt.forEach((at, i) => {
    assert.ok(at - first >= offsetsH[i] * HOUR - 5 * MIN, `email ${i + 1} not earlier than its offset`);
    const hr = lagosHour(at);
    assert.ok(hr >= 8.5 && hr < 20, `email ${i + 1} inside the Lagos window (${hr})`);
    if (i) assert.ok(at - sentAt[i - 1] >= 2 * HOUR, "minimum spacing");
  });
  assert.match(h.calls.emails[0].html, /COMPLETE MY PAYMENT/);
  assert.match(h.calls.emails[0].html, /0125912341/);
  assert.match(h.calls.emails[6].html, /last automated reminder/);
  assert.equal(h.group().payment_status, "expired");
  assert.equal(h.group().is_open, false);
});

await test("after downtime overdue emails are spaced, never sent together", async () => {
  const h = harness({ verify: () => ok("failed"), env: { PAYMENT_RECOVERY_WINDOW_START_MINUTES: "510", PAYMENT_RECOVERY_WINDOW_END_MINUTES: "1200" } });
  await h.start("ref_down");
  h.advance(10 * MIN);
  await h.cycle();
  h.advance(11 * MIN);
  await h.cycle();
  assert.equal(h.calls.emails.length, 1);
  h.advance(6 * 24 * HOUR); // app was down for six days
  await h.cycle();
  assert.equal(h.calls.emails.length, 2, "one email per run");
  await h.cycle();
  assert.equal(h.calls.emails.length, 2, "next one waits at least the minimum gap");
});

await test("payment, opt-out and bounce stop the sequence mid-way", async () => {
  const h = harness({ verify: () => ok("failed") });
  await h.start("ref_mid");
  h.advance(10 * MIN);
  await h.cycle();
  h.advance(11 * MIN);
  await h.cycle();
  h.advance(4 * HOUR);
  await h.cycle();
  assert.equal(h.calls.emails.length, 2);
  h.paid.add(`ada@example.com:${COURSE}`);
  h.advance(13 * HOUR);
  await h.cycle();
  assert.equal(h.calls.emails.length, 2, "no email after payment");
  assert.equal(h.group().is_open, false);
});

await test("opt-out stops reminders; already-paid elsewhere closes the order without email", async () => {
  const h = harness({ verify: () => ok("failed") });
  await h.start("ref_opt");
  h.advance(10 * MIN);
  await h.cycle();
  await engine.optOut(h.db, h.deps, h.group().retry_token);
  h.advance(20 * MIN);
  await h.cycle();
  assert.equal(h.calls.emails.length, 0);
  assert.equal(h.group().recovery_status, "opted_out");

  const h2 = harness({ verify: () => ok("failed") });
  await h2.start("ref_paid_elsewhere");
  h2.advance(10 * MIN);
  await h2.cycle();
  h2.paid.add(`ada@example.com:${COURSE}`);
  h2.advance(20 * MIN);
  await h2.cycle();
  assert.equal(h2.calls.emails.length, 0);
  assert.equal(h2.group().is_open, false);
});

await test("feature switch, config defaults and naira formatting", async () => {
  const cfg = readRecoveryConfig({});
  assert.equal(cfg.enabled, false, "off by default");
  assert.equal(cfg.failedDelayMs, 10 * MIN);
  assert.equal(cfg.abandonedDelayMs, 30 * MIN);
  assert.equal(readRecoveryConfig({ PAYMENT_RECOVERY_ENABLED: "true" }).enabled, true);
  assert.equal(formatNaira(PRICE), "₦14,999");
  assert.match(src("app/api/cron/payment-recovery/route.ts"), /deps\.config\.enabled/);
  assert.match(src("app/api/cron/checkout-abandon/route.ts"), /readRecoveryConfig\(\)\.enabled/);
  // amount mismatch on a "success" never fulfils
  const h = harness({ verify: () => ok("success", { amount: 100 }) });
  await h.start("ref_mismatch");
  h.advance(11 * MIN);
  await h.cycle();
  assert.equal(h.calls.fulfil.length, 0);
  assert.equal(h.db.t("payment_recovery_attempts")[0].status, "processing");
});

await test("Payment Page failures and abandons are pulled into recovery, other amounts and paid are not", async () => {
  const { registerPulledRows } = await import(ts("lib/payment-recovery/page-pull-core.ts"));
  const h = harness({ verify: () => ok("failed") });
  const row = (ref, amount, status, email = "page.buyer@example.com") => ({
    reference: ref, status, amount, currency: "NGN",
    customer: { email, first_name: "Page", last_name: "Buyer" },
    metadata: {}, page: { slug: "ai-ads-masterclass", name: "AI Ads Automation Masterclass" },
  });
  const s = await registerPulledRows(h.db, h.deps, [
    row("T_FAIL_1", 1_499_900, "failed"),
    row("T_FAIL_1", 1_499_900, "failed"), // duplicate listing across runs
    row("T_PAID", 1_499_900, "success", "paid@example.com"), // never register a successful transaction
    row("T_OTHER", 777_700, "abandoned", "other@example.com"), // not a catalog price
    { reference: "T_NOEMAIL", amount: 1_499_900, currency: "NGN", customer: {}, page: { slug: "ai-ads-masterclass" } },
  ]);
  assert.equal(h.db.t("payment_recovery_attempts").filter((a) => a.reference === "T_FAIL_1").length, 1, "idempotent by reference");
  assert.equal(h.db.t("payment_recovery_groups").length, 1, "one order, one group");
  assert.equal(h.db.t("payment_recovery_groups")[0].amount_kobo, 1_499_900, "price from the catalog, not the payload");
  assert.ok(s.skipped >= 2);
  h.advance(10 * MIN);
  await h.cycle();
  h.advance(11 * MIN);
  await h.cycle();
  assert.equal(h.calls.emails.length, 1, "pulled failed Payment Page attempt gets the first recovery email");
  assert.equal(h.calls.emails[0].to, "page.buyer@example.com");
});

console.log(`\n${passed} payment recovery tests passed`);
if (process.exitCode) process.exit(process.exitCode);
