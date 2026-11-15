#!/usr/bin/env node
/**
 * Cross-repo journey: LeadPilot router output is fed to the real DigitalSkillX handoff checks.
 * Mocked Paystack only. No network, no payments, no database.
 * Needs LEADRUSH_BACKEND_DIR with a runnable LeadPilot source (logger and paystack client stubs
 * or dependencies). It skips with a notice when that source cannot be imported.
 * Run: LEADRUSH_BACKEND_DIR=/path/to/LeadPilot/backend npm run test:ai-ads-journey
 */
import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = (rel) => pathToFileURL(join(root, rel)).href;
const SECRET = "journey_forward_secret_0123456789abcdef0123";
process.env.DIGITALSKILLX_FORWARD_SECRET = SECRET;

const backend = process.env.LEADRUSH_BACKEND_DIR;
let lp;
try {
  if (!backend) throw new Error("LEADRUSH_BACKEND_DIR not set");
  lp = await import(pathToFileURL(join(backend, "src/services/paystack-digitalskillx-forward.ts")).href);
} catch (err) {
  console.log(`SKIP: LeadPilot source not importable (${err instanceof Error ? err.message : err})`);
  process.exit(0);
}

const products = await import(ts("lib/paystack-external-products.ts"));
const handoff = await import(ts("lib/leadthur-handoff.ts"));
const tracking = await import(ts("lib/purchase-tracking-payload.ts"));
const status = await import(ts("lib/purchase-status.ts"));
const MC = products.AI_ADS_AUTOMATION_MASTERCLASS_PRODUCT;
const APP = products.BUILD_SOFTWARE_WITH_AI_PRODUCT;

let passed = 0;
async function check(label, fn) { await fn(); passed += 1; console.log(`PASS: ${label}`); }

const reply = (status) => ({ status, text: async () => "{}", headers: { get: () => "application/json" } });
const tx = (o = {}) => ({
  status: "success", reference: "J_ref_0001", amount: 1_499_900, currency: "NGN",
  paid_at: "2026-11-15T09:00:00.000Z", metadata: { product_key: MC.key }, page: { slug: "ai-ads-masterclass" },
  customer: { email: "Buyer@Example.com", first_name: "Ada", last_name: "Lovelace" }, ...o,
});

/** Runs the LeadPilot side, then hands the exact outgoing request to the DigitalSkillX side. */
async function journey(verified, { nowMs = 1_800_000_000_000, seenNonces = new Set() } = {}) {
  lp.resetDigitalSkillXForwardCache();
  const sent = [];
  const result = await lp.routeDigitalSkillXCharge(
    { reference: verified.reference },
    {
      verify: async () => verified,
      now: () => nowMs,
      fetchImpl: async (url, init) => { sent.push({ url, init }); return reply(200); },
    },
  );
  let dsx = null;
  if (sent.length) {
    const { init } = sent[0];
    const h = Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]));
    const sig = handoff.verifyLeadthurHandoffSignature({
      secret: SECRET,
      signature: handoff.parseLeadthurSignatureHeader(h[handoff.LEADTHUR_SIGNATURE_HEADER]),
      timestamp: h[handoff.LEADTHUR_TIMESTAMP_HEADER],
      nonce: h[handoff.LEADTHUR_NONCE_HEADER],
      body: init.body,
      nowSeconds: Math.floor(nowMs / 1000),
    });
    const replay = seenNonces.has(h[handoff.LEADTHUR_NONCE_HEADER]);
    seenNonces.add(h[handoff.LEADTHUR_NONCE_HEADER]);
    const parsed = handoff.parseLeadthurHandoffPayload(init.body);
    const validation = parsed.ok === false ? parsed : handoff.validateLeadthurHandoffPayment({
      headerProductKey: h[handoff.LEADTHUR_PRODUCT_HEADER],
      payload: parsed.payload,
    });
    dsx = { sig, replay, validation, body: JSON.parse(init.body), headers: h };
  }
  return { result, sent, dsx };
}

await check("J1. masterclass payment: LeadPilot forwards, DigitalSkillX accepts signature, product, amount, currency and course", async () => {
  const { result, dsx } = await journey(tx());
  assert.equal(result.outcome, "forwarded");
  assert.equal(dsx.sig.valid, true);
  assert.equal(dsx.validation.ok, true);
  assert.equal(dsx.validation.product.key, MC.key);
  assert.equal(products.configuredExternalCourseId(dsx.validation.product), MC.defaultCourseId);
});

await check("J2. ai-app payment: forwarded to the ai-app product and course, never the masterclass", async () => {
  const { result, dsx } = await journey(tx({ reference: "J_ref_app", amount: 4_999_900, metadata: {}, page: { slug: "aiapp" } }));
  assert.equal(result.outcome, "forwarded");
  assert.equal(dsx.validation.ok, true);
  assert.equal(dsx.validation.product.key, APP.key);
  assert.equal(dsx.body.course_id, APP.defaultCourseId);
  assert.notEqual(dsx.body.course_id, MC.defaultCourseId);
});

await check("J3. tampered body and wrong secret fail DigitalSkillX signature verification", async () => {
  const { sent, dsx } = await journey(tx());
  const h = dsx.headers;
  const base = { signature: handoff.parseLeadthurSignatureHeader(h[handoff.LEADTHUR_SIGNATURE_HEADER]), timestamp: h[handoff.LEADTHUR_TIMESTAMP_HEADER], nonce: h[handoff.LEADTHUR_NONCE_HEADER], nowSeconds: Math.floor(1_800_000_000_000 / 1000) };
  assert.equal(handoff.verifyLeadthurHandoffSignature({ ...base, secret: SECRET, body: sent[0].init.body.replace("1499900", "1") }).valid, false);
  assert.equal(handoff.verifyLeadthurHandoffSignature({ ...base, secret: "wrong_secret_wrong_secret_wrong_secret", body: sent[0].init.body }).valid, false);
});

await check("J4. failed, abandoned, wrong-amount, wrong-currency and unknown-product payments never reach DigitalSkillX", async () => {
  for (const [label, v] of [
    ["failed", tx({ status: "failed" })],
    ["abandoned", tx({ status: "abandoned" })],
    ["amount", tx({ amount: 100_000 })],
    ["currency", tx({ currency: "USD" })],
    ["masterclass page at ai-app price", tx({ amount: 4_999_900 })],
    ["ai-app page at masterclass price", tx({ amount: 1_499_900, metadata: {}, page: { slug: "aiapp" } })],
    ["unknown product", tx({ metadata: { product_key: "something-else" }, page: { slug: "other" } })],
    ["amount only", tx({ metadata: {}, page: null })],
  ]) {
    const { sent } = await journey(v);
    assert.equal(sent.length, 0, label);
  }
});

await check("J5. duplicate webhook is forwarded once", async () => {
  lp.resetDigitalSkillXForwardCache();
  let calls = 0;
  const run = () => lp.routeDigitalSkillXCharge({ reference: "J_dupe" }, {
    verify: async () => tx({ reference: "J_dupe" }),
    fetchImpl: async () => { calls += 1; return reply(200); },
  });
  await run(); await run();
  assert.equal(calls, 1);
});

await check("J6. temporary DigitalSkillX failure is retryable and the retry succeeds once", async () => {
  lp.resetDigitalSkillXForwardCache();
  let n = 0;
  const run = () => lp.routeDigitalSkillXCharge({ reference: "J_retry" }, {
    verify: async () => tx({ reference: "J_retry" }),
    fetchImpl: async () => { n += 1; return n === 1 ? reply(503) : reply(200); },
  });
  assert.equal((await run()).outcome, "retryable");
  assert.equal((await run()).outcome, "forwarded");
  assert.equal(n, 2);
});

await check("J7. status endpoint logic reports paid only after fulfilment, with the same event id the browser uses", async () => {
  const ref = "J_ref_0001";
  const paystackData = { source: "leadthur-paystack-router", product_key: MC.key, payment_page: MC.paymentPageUrl, fulfillment_status: "email_sent", access_email_sent_at: "2026-11-15T09:01:00.000Z" };
  const pending = status.computePurchaseStatus({ transaction: { status: "pending", course_id: MC.defaultCourseId, paystack_data: paystackData }, enrolled: false, siteBaseUrl: "https://www.digitalskillx.com" });
  assert.equal(pending.status, "pending");
  const paid = status.computePurchaseStatus({ transaction: { status: "success", course_id: MC.defaultCourseId, paystack_data: paystackData }, enrolled: true, siteBaseUrl: "https://www.digitalskillx.com" });
  assert.equal(paid.status, "paid");
  assert.equal(paid.product.valueNgn, 14_999);
  const event = tracking.buildMetaPurchaseEvent({ reference: ref, customerEmail: "Buyer@Example.com", product: MC }, 1_800_000_000).data[0];
  assert.equal(event.event_id, `purchase_${ref}`);
  assert.equal(event.custom_data.value, paid.product.valueNgn);
  assert.equal(event.custom_data.currency, paid.product.currency);
  assert.deepEqual(event.custom_data.content_ids, [paid.product.key]);
  assert.equal(JSON.stringify(event).includes("buyer@example.com"), false);
  assert.equal(event.user_data.em[0], tracking.sha256HexEmail("buyer@example.com"));
});

console.log(`\n${passed} passed`);
