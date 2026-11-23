#!/usr/bin/env node
/**
 * Payment integrity regressions for external Paystack products.
 * Covers: atomic idempotency under concurrent delivery, product evidence, price checks,
 * non-success states, Draft-course holding and reconcile, operator attribution.
 * Run: npm run test:payment-integrity
 */
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = (rel) => pathToFileURL(join(root, rel)).href;

const products = await import(ts("lib/paystack-external-products.ts"));
const { fulfillPaystackExternalCharge } = await import(ts("lib/paystack-external-fulfillment.ts"));
const { reconcileHeldExternalPayments } = await import(ts("lib/paystack-external-refulfill.ts"));

const MASTER = products.AI_ADS_AUTOMATION_MASTERCLASS_PRODUCT;
const SOFTWARE = products.BUILD_SOFTWARE_WITH_AI_PRODUCT;

// ---------------------------------------------------------------------------
// In-memory Supabase fake. Each operation yields first so concurrent callers interleave.
// transactions.reference is UNIQUE. Updates support eq / is / json-path filters and return rows.
// ---------------------------------------------------------------------------
function createFakeAdmin(seed) {
  const tables = {
    transactions: [],
    courses: [...(seed.courses ?? [])],
    enrollments: [],
    profiles: [],
  };
  let idCounter = 0;
  const stats = { insertConflicts: 0 };
  // Per-table fault injection: when set, every query on that table returns this error.
  const faults = {};

  const pick = (row, column) => {
    if (column.includes("->>")) {
      const [col, key] = column.split("->>");
      const value = row[col]?.[key];
      return value === undefined ? null : value;
    }
    return row[column];
  };

  function builder(table) {
    const state = { op: "select", filters: [], payload: null, wantRows: false, order: null, max: null };
    const matches = (row) =>
      state.filters.every((f) => {
        const v = pick(row, f.column);
        if (f.type === "eq") return v === f.value;
        if (f.type === "is") return v === f.value || (f.value === null && v === undefined);
        if (f.type === "in") return f.value.includes(v);
        if (f.type === "ilike") return String(v ?? "").toLowerCase() === String(f.value).toLowerCase();
        return true;
      });

    async function exec() {
      await new Promise((r) => setImmediate(r));
      if (faults[table]) return { data: null, error: faults[table] };
      const rows = tables[table];
      if (state.op === "insert") {
        const incoming = { ...state.payload };
        if (table === "transactions") {
          if (rows.some((r) => r.reference === incoming.reference)) {
            stats.insertConflicts += 1;
            return {
              data: null,
              error: { message: 'duplicate key value violates unique constraint "transactions_reference_key"', code: "23505" },
            };
          }
          incoming.id = `tx_${++idCounter}`;
          incoming.created_at = new Date().toISOString();
          incoming.updated_at = `2026-11-15T00:00:00.${String(++idCounter).padStart(6, "0")}+00:00`;
        }
        if (table === "enrollments") {
          if (rows.some((r) => r.student_id === incoming.student_id && r.course_id === incoming.course_id)) {
            return { data: null, error: { message: "duplicate key value", code: "23505" } };
          }
          incoming.id = `en_${++idCounter}`;
        }
        rows.push(incoming);
        return { data: state.wantRows ? [incoming] : null, error: null };
      }
      if (state.op === "update") {
        const hit = rows.filter(matches);
        for (const row of hit) {
          Object.assign(row, state.payload);
          if (table === "transactions" && !("updated_at" in state.payload)) {
            row.updated_at = `2026-11-15T00:00:00.${String(++idCounter).padStart(6, "0")}+00:00`;
          }
        }
        return { data: state.wantRows ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      let hit = rows.filter(matches).map((r) => ({ ...r }));
      if (state.order) hit.sort((a, b) => String(a[state.order]).localeCompare(String(b[state.order])));
      if (state.max != null) hit = hit.slice(0, state.max);
      return { data: hit, error: null };
    }

    const api = {
      insert(payload) { state.op = "insert"; state.payload = payload; return api; },
      update(payload) { state.op = "update"; state.payload = payload; return api; },
      select() { state.wantRows = true; return api; },
      eq(column, value) { state.filters.push({ type: "eq", column, value }); return api; },
      is(column, value) { state.filters.push({ type: "is", column, value }); return api; },
      in(column, value) { state.filters.push({ type: "in", column, value }); return api; },
      ilike(column, value) { state.filters.push({ type: "ilike", column, value }); return api; },
      order(column) { state.order = column; return api; },
      limit(n) { state.max = n; return api; },
      async maybeSingle() {
        const result = await exec();
        const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
        return { data, error: result.error };
      },
      then(resolve, reject) { return exec().then(resolve, reject); },
    };
    return api;
  }

  return {
    from: (table) => builder(table),
    auth: { admin: { updateUserById: async () => ({ error: null }) } },
    tables,
    stats,
    faults,
  };
}

// ---------------------------------------------------------------------------
function harness({ masterVisibility = "published", softwareVisibility = "published", failEnrollOnce = false, emailFails = false } = {}) {
  const admin = createFakeAdmin({
    courses: [
      { id: MASTER.defaultCourseId, title: MASTER.title, visibility: masterVisibility },
      { id: SOFTWARE.defaultCourseId, title: SOFTWARE.title, visibility: softwareVisibility },
    ],
  });
  const calls = { enroll: 0, email: 0, track: 0, createStudent: 0, verify: 0 };
  let enrollFailures = failEnrollOnce ? 1 : 0;
  let emailBroken = emailFails;
  const studentsByEmail = new Map();

  const deps = {
    verifyTransaction: async () => { calls.verify += 1; return null; },
    resolveStudent: async (_admin, { email }) => {
      await new Promise((r) => setTimeout(r, 5));
      calls.createStudent += 1;
      if (studentsByEmail.has(email)) {
        return { studentId: studentsByEmail.get(email), isNewAccount: false };
      }
      const id = `student_${studentsByEmail.size + 1}`;
      studentsByEmail.set(email, id);
      return { studentId: id, isNewAccount: true, password: "generated-for-test" };
    },
    enroll: async ({ studentId, courseId, reference }) => {
      calls.enroll += 1;
      if (enrollFailures > 0) { enrollFailures -= 1; throw new Error("enroll_boom"); }
      await admin.from("enrollments").insert({ student_id: studentId, course_id: courseId });
      await admin.from("transactions").update({ status: "success", student_id: studentId, course_id: courseId }).eq("reference", reference);
    },
    sendAccessEmail: async () => {
      calls.email += 1;
      await new Promise((r) => setTimeout(r, 5));
      return emailBroken ? { sent: false, error: "smtp_down" } : { sent: true };
    },
    trackPurchase: async () => { calls.track += 1; return { stape: "skipped", meta: "sent", errors: [] }; },
    audit: async () => undefined,
  };
  return { admin, deps, calls, fixEmail() { emailBroken = false; } };
}

const verifiedFor = (reference, overrides = {}) => ({
  status: "success",
  reference,
  amount: MASTER.expectedAmountKobo,
  currency: "NGN",
  metadata: { referrer: "https://paystack.shop/pay/ai-ads-masterclass" },
  customer: { email: "buyer@example.com", first_name: "Ada", last_name: "Obi" },
  page: null,
  plan: null,
  ...overrides,
});

const charge = (h, reference, overrides = {}) =>
  fulfillPaystackExternalCharge({
    reference,
    webhookEvent: "charge.success",
    verifiedOverride: verifiedFor(reference, overrides),
    admin: h.admin,
    deps: h.deps,
  });

const handoffCharge = (h, reference, overrides = {}) =>
  fulfillPaystackExternalCharge({
    reference,
    admin: h.admin,
    deps: h.deps,
    handoffPayment: {
      productKey: MASTER.key,
      amount: MASTER.expectedAmountKobo,
      currency: "NGN",
      status: "success",
      customerEmail: "buyer@example.com",
      ...overrides,
    },
  });

const noSideEffects = (h) => {
  assert.equal(h.calls.enroll, 0, "no enrolment");
  assert.equal(h.calls.email, 0, "no access email");
  assert.equal(h.calls.track, 0, "no Purchase event");
  assert.equal(h.admin.tables.enrollments.length, 0, "no enrollment rows");
};

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

// ---------------------------------------------------------------------------
await test("concurrent webhook deliveries create one enrolment, one email and one Purchase", async () => {
  const h = harness();
  const results = await Promise.all(Array.from({ length: 12 }, () => charge(h, "ref_concurrent_1")));
  assert.equal(h.calls.enroll, 1);
  assert.equal(h.calls.email, 1);
  assert.equal(h.calls.track, 1);
  assert.equal(h.admin.tables.enrollments.length, 1);
  assert.equal(h.admin.tables.transactions.length, 1);
  assert.equal(h.calls.createStudent, 1, "only the claim holder resolves the student");
  const winners = results.filter((r) => r.ok && !r.alreadyFulfilled);
  assert.equal(winners.length, 1, "exactly one delivery fulfils");
  for (const r of results.filter((r) => !r.ok)) {
    assert.equal(r.permanent, false, "losers are retryable, not permanent");
    assert.equal(r.status, 503);
  }
  const tx = h.admin.tables.transactions[0];
  assert.equal(tx.status, "success");
  assert.equal(tx.paystack_data.fulfillment_claim_id, null, "claim released");
  // Redelivery after completion does nothing.
  const again = await charge(h, "ref_concurrent_1");
  assert.equal(again.ok, true);
  assert.equal(again.alreadyFulfilled, true);
  assert.equal(h.calls.enroll, 1);
  assert.equal(h.calls.email, 1);
  assert.equal(h.calls.track, 1);
});

await test("concurrent signed handoff deliveries create one enrolment, one email and one Purchase", async () => {
  const h = harness();
  const results = await Promise.all(Array.from({ length: 8 }, () => handoffCharge(h, "ref_handoff_1")));
  assert.equal(h.calls.enroll, 1);
  assert.equal(h.calls.email, 1);
  assert.equal(h.calls.track, 1);
  assert.equal(h.admin.tables.enrollments.length, 1);
  assert.equal(results.filter((r) => r.ok && !r.alreadyFulfilled).length, 1);
});

await test("webhook delivery racing a reconcile run still fulfils once", async () => {
  const h = harness();
  const [a, b, c] = await Promise.all([
    charge(h, "ref_race_mix"),
    handoffCharge(h, "ref_race_mix"),
    fulfillPaystackExternalCharge({
      reference: "ref_race_mix",
      verifiedOverride: verifiedFor("ref_race_mix"),
      attributedProductKey: MASTER.key,
      skipPurchaseTracking: true,
      admin: h.admin,
      deps: h.deps,
    }),
  ]);
  assert.equal(h.calls.enroll, 1);
  assert.equal(h.calls.email, 1);
  assert.ok([a, b, c].filter((r) => r.ok && !r.alreadyFulfilled).length <= 1);
});

await test("distinct references do not block each other", async () => {
  const h = harness();
  const refs = ["ref_a", "ref_b", "ref_c"];
  const results = await Promise.all(
    refs.map((ref, i) => charge(h, ref, { customer: { email: `buyer${i}@example.com` } })),
  );
  assert.ok(results.every((r) => r.ok));
  assert.equal(h.calls.enroll, 3);
  assert.equal(h.calls.email, 3);
});

await test("a live claim blocks other deliveries without side effects", async () => {
  const h = harness();
  await h.admin.from("transactions").insert({
    student_id: null,
    course_id: MASTER.defaultCourseId,
    amount: MASTER.expectedAmountKobo,
    currency: "NGN",
    provider: "paystack",
    reference: "ref_live_claim",
    status: "pending",
    paystack_data: {
      source: "paystack_payment_page",
      product_key: MASTER.key,
      fulfillment_status: "payment_verified",
      fulfillment_claim_id: "someone-else",
      fulfillment_claim_expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  const result = await charge(h, "ref_live_claim");
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.permanent, false);
  noSideEffects(h);
});

await test("an expired claim is taken over by exactly one of many concurrent callers", async () => {
  const h = harness();
  await h.admin.from("transactions").insert({
    student_id: null,
    course_id: MASTER.defaultCourseId,
    amount: MASTER.expectedAmountKobo,
    currency: "NGN",
    provider: "paystack",
    reference: "ref_expired_claim",
    status: "pending",
    paystack_data: {
      source: "paystack_payment_page",
      product_key: MASTER.key,
      fulfillment_status: "payment_verified",
      fulfillment_claim_id: "crashed-worker",
      fulfillment_claim_expires_at: new Date(Date.now() - 1_000).toISOString(),
    },
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => charge(h, "ref_expired_claim")));
  assert.equal(h.calls.enroll, 1);
  assert.equal(h.calls.email, 1);
  assert.equal(h.calls.track, 1);
  assert.equal(results.filter((r) => r.ok && !r.alreadyFulfilled).length, 1);
});

await test("a failed enrolment releases the claim and a retry completes without duplicates", async () => {
  const h = harness({ failEnrollOnce: true });
  const first = await charge(h, "ref_retry");
  assert.equal(first.ok, false);
  assert.equal(first.permanent, false);
  assert.equal(h.calls.email, 0);
  assert.equal(h.calls.track, 0);
  assert.equal(h.admin.tables.transactions[0].paystack_data.fulfillment_claim_id, null);
  const second = await charge(h, "ref_retry");
  assert.equal(second.ok, true);
  assert.equal(h.admin.tables.enrollments.length, 1);
  assert.equal(h.calls.email, 1);
  assert.equal(h.calls.track, 1);
});

await test("a failed access email retries the email only, never a second enrolment or Purchase before success", async () => {
  const h = harness({ emailFails: true });
  const first = await charge(h, "ref_email_retry");
  assert.equal(first.ok, false);
  assert.equal(h.calls.track, 0, "no Purchase event before access is delivered");
  h.fixEmail();
  const second = await charge(h, "ref_email_retry");
  assert.equal(second.ok, true);
  assert.equal(h.admin.tables.enrollments.length, 1);
  assert.equal(h.calls.email, 2);
  assert.equal(h.calls.track, 1);
  const third = await charge(h, "ref_email_retry");
  assert.equal(third.alreadyFulfilled, true);
  assert.equal(h.calls.email, 2);
  assert.equal(h.calls.track, 1);
});

// ---------------------------------------------------------------------------
await test("failed, pending, abandoned and reversed charges never fulfil", async () => {
  for (const status of ["failed", "pending", "abandoned", "reversed", "ongoing", "queued"]) {
    const h = harness();
    const result = await charge(h, `ref_status_${status}`, { status });
    assert.equal(result.handled, true);
    assert.equal(result.ok, false, status);
    noSideEffects(h);
    assert.equal(h.admin.tables.transactions.length, 0, `${status} leaves no row`);
  }
});

await test("signed handoff with a non-success status never fulfils", async () => {
  for (const status of ["failed", "pending", "abandoned"]) {
    const h = harness();
    const result = await handoffCharge(h, `ref_handoff_${status}`, { status });
    assert.equal(result.ok, false);
    noSideEffects(h);
  }
});

await test("a transaction Paystack cannot verify never fulfils", async () => {
  const h = harness();
  const result = await fulfillPaystackExternalCharge({
    reference: "ref_unverified",
    admin: h.admin,
    deps: h.deps,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(h.calls.verify, 1);
  noSideEffects(h);
  assert.equal(h.admin.tables.transactions.length, 0);
});

await test("a verified record for a different reference is rejected", async () => {
  const h = harness();
  const result = await fulfillPaystackExternalCharge({
    reference: "ref_wanted",
    verifiedOverride: verifiedFor("ref_other"),
    admin: h.admin,
    deps: h.deps,
  });
  assert.equal(result.ok, false);
  noSideEffects(h);
});

await test("incorrect price or currency never fulfils, even with correct page evidence", async () => {
  const cases = [
    { amount: SOFTWARE.expectedAmountKobo },
    { amount: MASTER.expectedAmountKobo - 100 },
    { amount: MASTER.expectedAmountKobo + 100 },
    { amount: 100 },
    { currency: "USD" },
  ];
  for (const [i, overrides] of cases.entries()) {
    const h = harness();
    const result = await charge(h, `ref_price_${i}`, overrides);
    assert.notEqual(result.ok, true, JSON.stringify(overrides));
    noSideEffects(h);
  }
});

await test("incorrect price never fulfils through the signed handoff or an operator attribution", async () => {
  let h = harness();
  let result = await handoffCharge(h, "ref_handoff_price", { amount: 1_000_000 });
  assert.equal(result.ok, false);
  noSideEffects(h);
  h = harness();
  result = await handoffCharge(h, "ref_handoff_ccy", { currency: "USD" });
  assert.equal(result.ok, false);
  noSideEffects(h);
  h = harness();
  result = await fulfillPaystackExternalCharge({
    reference: "ref_attr_price",
    verifiedOverride: verifiedFor("ref_attr_price", { amount: 1_000_000, metadata: {} }),
    attributedProductKey: MASTER.key,
    admin: h.admin,
    deps: h.deps,
  });
  assert.equal(result.ok, false);
  noSideEffects(h);
});

// ---------------------------------------------------------------------------
await test("a payment with no product evidence is recorded for attribution and never fulfilled by amount", async () => {
  const h = harness();
  const result = await charge(h, "ref_no_evidence", { metadata: {}, page: null });
  assert.equal(result.handled, true);
  assert.equal(result.ok, false);
  assert.equal(result.permanent, true);
  noSideEffects(h);
  assert.equal(h.admin.tables.transactions.length, 1);
  const row = h.admin.tables.transactions[0];
  assert.equal(row.reference, "ref_no_evidence");
  assert.equal(row.status, "pending");
  assert.equal(row.student_id, null);
  assert.equal(row.paystack_data.fulfillment_status, "attribution_required");
  assert.deepEqual(row.paystack_data.candidate_product_keys, [MASTER.key]);
  assert.equal(row.paystack_data.checkout_email, undefined, "no abandoned-checkout email trigger");
  // Redelivery does not duplicate the record or fulfil.
  await charge(h, "ref_no_evidence", { metadata: {}, page: null });
  assert.equal(h.admin.tables.transactions.length, 1);
  noSideEffects(h);
  // The cron reconcile never fulfils unattributed payments.
  const reconciled = await reconcileHeldExternalPayments({
    admin: h.admin,
    reconcile: async () => { throw new Error("must not run"); },
  });
  assert.equal(reconciled.results.length, 0);
  assert.equal(reconciled.unattributed, 0, "attribution_required rows are not in the reconcile set");
});

await test("an operator attribution fulfils a recorded payment after Paystack verifies the price", async () => {
  const h = harness();
  await charge(h, "ref_attribute_me", { metadata: {}, page: null });
  noSideEffects(h);
  const result = await fulfillPaystackExternalCharge({
    reference: "ref_attribute_me",
    verifiedOverride: verifiedFor("ref_attribute_me", { metadata: {} }),
    attributedProductKey: MASTER.key,
    skipPurchaseTracking: true,
    admin: h.admin,
    deps: h.deps,
  });
  assert.equal(result.ok, true);
  assert.equal(h.admin.tables.transactions.length, 1);
  assert.equal(h.admin.tables.transactions[0].status, "success");
  assert.equal(h.calls.enroll, 1);
  assert.equal(h.calls.email, 1);
});

await test("a ₦14,999 payment from a different named page is not fulfilled and not recorded for the masterclass", async () => {
  const h = harness();
  const result = await charge(h, "ref_other_page", {
    metadata: { referrer: "https://paystack.shop/pay/ai-app" },
  });
  assert.notEqual(result.ok, true);
  noSideEffects(h);
  assert.equal(h.admin.tables.transactions.length, 0);
});

await test("conflicting evidence for two products fails closed", async () => {
  const h = harness();
  const result = await charge(h, "ref_conflict", {
    metadata: { referrer: "https://paystack.shop/pay/ai-ads-masterclass", page_slug: "aiapp" },
  });
  assert.notEqual(result.ok, true);
  noSideEffects(h);
});

// ---------------------------------------------------------------------------
await test("a payment received while the course is Draft is recorded, never discarded, never confirmed", async () => {
  const h = harness({ masterVisibility: "draft" });
  const result = await charge(h, "ref_draft_1");
  assert.equal(result.handled, true);
  assert.equal(result.ok, false, "enrolment is not confirmed");
  noSideEffects(h);
  assert.equal(h.admin.tables.transactions.length, 1);
  const row = h.admin.tables.transactions[0];
  assert.equal(row.reference, "ref_draft_1");
  assert.equal(row.status, "pending", "never marked success");
  assert.equal(row.student_id, null);
  assert.equal(row.amount, MASTER.expectedAmountKobo);
  assert.equal(row.paystack_data.fulfillment_status, "awaiting_course_publish");
  assert.equal(row.paystack_data.product_key, MASTER.key);
  assert.equal(row.paystack_data.checkout_email, undefined);
  // Repeated and concurrent deliveries keep one record.
  await Promise.all([charge(h, "ref_draft_1"), charge(h, "ref_draft_1"), handoffCharge(h, "ref_draft_1")]);
  assert.equal(h.admin.tables.transactions.length, 1);
  noSideEffects(h);
});

await test("a Draft-course handoff payment is recorded with the same guarantees", async () => {
  const h = harness({ masterVisibility: "draft" });
  const result = await handoffCharge(h, "ref_draft_handoff");
  assert.equal(result.ok, false);
  assert.equal(result.permanent, true);
  noSideEffects(h);
  assert.equal(h.admin.tables.transactions[0].paystack_data.fulfillment_status, "awaiting_course_publish");
});

await test("reconcile leaves Draft payments untouched, then fulfils them once after publish", async () => {
  const h = harness({ masterVisibility: "draft" });
  await charge(h, "ref_draft_recon");
  await handoffCharge(h, "ref_draft_recon_2", { customerEmail: "second@example.com" });

  const reconcile = async (reference, options) => {
    const r = await fulfillPaystackExternalCharge({
      reference,
      verifiedOverride: verifiedFor(reference, {
        metadata: {},
        customer: {
          email: reference.endsWith("_2") ? "second@example.com" : "buyer@example.com",
        },
      }),
      attributedProductKey: options.attributedProductKey,
      skipPurchaseTracking: true,
      admin: h.admin,
      deps: h.deps,
    });
    return r.ok
      ? { ok: true, reference, alreadyFulfilled: r.alreadyFulfilled === true }
      : { ok: false, error: r.error, status: r.status };
  };

  const stillDraft = await reconcileHeldExternalPayments({ admin: h.admin, reconcile });
  assert.equal(stillDraft.results.length, 0);
  assert.equal(stillDraft.stillDraft, 2);
  noSideEffects(h);

  h.admin.tables.courses.find((c) => c.id === MASTER.defaultCourseId).visibility = "published";
  const [r1, r2] = await Promise.all([
    reconcileHeldExternalPayments({ admin: h.admin, reconcile }),
    reconcileHeldExternalPayments({ admin: h.admin, reconcile }),
  ]);
  const fulfilledRefs = new Set(
    [...r1.results, ...r2.results].filter((r) => r.ok === true).map((r) => r.reference),
  );
  assert.equal(fulfilledRefs.size, 2, "both held payments reach fulfilled");
  const firstTimeFulfilments = [...r1.results, ...r2.results].filter(
    (r) => r.ok === true && r.alreadyFulfilled !== true,
  );
  assert.ok(firstTimeFulfilments.length <= 2, "no payment is first-fulfilled twice");
  assert.equal(h.calls.enroll, 2);
  assert.equal(h.calls.email, 2);
  assert.equal(h.admin.tables.enrollments.length, 2);
  assert.ok(h.admin.tables.transactions.every((t) => t.status === "success"));

  const third = await reconcileHeldExternalPayments({ admin: h.admin, reconcile });
  assert.equal(third.results.length, 0, "nothing left to reconcile");
  assert.equal(h.calls.enroll, 2);
  assert.equal(h.calls.email, 2);
});

await test("a held Draft payment that Paystack no longer verifies is not fulfilled", async () => {
  const h = harness({ masterVisibility: "draft" });
  await charge(h, "ref_draft_unverified");
  h.admin.tables.courses.find((c) => c.id === MASTER.defaultCourseId).visibility = "published";
  const result = await fulfillPaystackExternalCharge({
    reference: "ref_draft_unverified",
    attributedProductKey: MASTER.key,
    admin: h.admin,
    deps: h.deps, // verifyTransaction returns null
  });
  assert.equal(result.ok, false);
  noSideEffects(h);
  assert.equal(h.admin.tables.transactions[0].status, "pending");
});

await test("purchase status never reports paid for a held payment and exposes its state", async () => {
  const { computePurchaseStatus } = await import(ts("lib/purchase-status.ts"));
  for (const held of ["awaiting_course_publish", "attribution_required"]) {
    const result = computePurchaseStatus({
      transaction: {
        status: "pending",
        course_id: MASTER.defaultCourseId,
        paystack_data: {
          source: "paystack_payment_page",
          product_key: held === "attribution_required" ? MASTER.key : MASTER.key,
          fulfillment_status: held,
        },
      },
      enrolled: false,
      siteBaseUrl: "https://example.test",
    });
    assert.equal(result.status, "pending");
    assert.equal(result.enrolled, false);
    assert.equal(result.emailSent, false);
    assert.equal(result.fulfillment, held);
    assert.equal(result.product, undefined, "no course link before enrolment");
  }
});

await test("a failed course query is retryable and never reported as course not found", async () => {
  const h = harness();
  h.admin.faults.courses = { message: "This operation was aborted", code: "" };
  const failed = await charge(h, "ref_course_query_down");
  assert.equal(failed.ok, false);
  assert.equal(failed.permanent, false, "query failure must stay retryable");
  assert.equal(failed.status, 503);
  assert.ok(!/not found/i.test(failed.error), "must not claim the course is missing");
  noSideEffects(h);

  delete h.admin.faults.courses;
  const retried = await charge(h, "ref_course_query_down");
  assert.equal(retried.ok, true, "the retry fulfils once the query works");
  assert.equal(h.calls.enroll, 1);
  assert.equal(h.calls.email, 1);
  assert.equal(h.calls.track, 1);
  const again = await charge(h, "ref_course_query_down");
  assert.equal(again.ok, true);
  assert.equal(h.calls.enroll, 1, "no duplicate enrolment");
  assert.equal(h.calls.track, 1, "no duplicate Purchase");
});

await test("reconcile counts a failed course query as a lookup failure, not as Draft", async () => {
  const h = harness({ masterVisibility: "draft" });
  await handoffCharge(h, "ref_recon_lookup_1");
  h.admin.tables.courses.find((c) => c.id === MASTER.defaultCourseId).visibility = "published";
  h.admin.faults.courses = { message: "This operation was aborted" };
  let reconcileCalls = 0;
  const reconcile = async () => { reconcileCalls += 1; return { ok: true }; };
  const out = await reconcileHeldExternalPayments({ admin: h.admin, reconcile });
  assert.equal(out.stillDraft, 0, "a published course must not be reported as Draft");
  assert.equal(out.lookupFailed, 1);
  assert.equal(reconcileCalls, 0);
  noSideEffects(h);
});

await test("two courses with the product title are not silently treated as no course", async () => {
  const h = harness();
  h.admin.tables.courses = h.admin.tables.courses.filter((c) => c.id !== MASTER.defaultCourseId);
  h.admin.tables.courses.push(
    { id: "dup-a", title: MASTER.title, visibility: "published" },
    { id: "dup-b", title: MASTER.title, visibility: "published" },
  );
  const r = await charge(h, "ref_dup_title");
  assert.equal(r.ok, false);
  assert.equal(r.permanent, false);
  noSideEffects(h);
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} payment integrity tests passed`);
if (process.exitCode) process.exit(process.exitCode);
