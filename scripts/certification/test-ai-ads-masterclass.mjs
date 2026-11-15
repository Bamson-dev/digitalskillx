#!/usr/bin/env node
/**
 * AI Ads Automation Masterclass: catalog, handoff, Meta Purchase and post-payment status.
 * Offline. Uses mocked payments only. Run: npm run test:ai-ads-masterclass
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = (rel) => pathToFileURL(join(root, rel)).href;
const read = (rel) => readFileSync(join(root, rel), "utf8");

const SECRET = "dsx_forward_secret_for_tests_0123456789abcdef";
process.env.DIGITALSKILLX_FORWARD_SECRET = SECRET;

const products = await import(ts("lib/paystack-external-products.ts"));
const handoff = await import(ts("lib/leadthur-handoff.ts"));
const nonceMod = await import(ts("lib/leadthur-handoff-nonce.ts"));
const tracking = await import(ts("lib/purchase-tracking-payload.ts"));
const status = await import(ts("lib/purchase-status.ts"));

const MC = products.AI_ADS_AUTOMATION_MASTERCLASS_PRODUCT;
const APP = products.BUILD_SOFTWARE_WITH_AI_PRODUCT;
const NOW = 1_800_000_000;

let passed = 0;
async function check(label, fn) {
  await fn();
  passed += 1;
  console.log(`PASS: ${label}`);
}

const verifiedBase = { status: "success", amount: 1_499_900, currency: "NGN", metadata: {} };
const identify = (verified, webhookData = null) =>
  products.identifyPaystackExternalProduct({ verified: { ...verifiedBase, ...verified }, webhookData })?.key ?? null;

function payload(overrides = {}) {
  return {
    event: "charge.success",
    source: "leadthur-paystack-router",
    product_key: MC.key,
    course_id: MC.defaultCourseId,
    reference: "T_mc_handoff_001",
    amount: MC.expectedAmountKobo,
    currency: "NGN",
    status: "success",
    paid_at: "2026-11-15T09:00:00.000Z",
    customer: { email: "buyer@example.com" },
    ...overrides,
  };
}

function signed(p, opts = {}) {
  const body = JSON.stringify(p);
  const headers = handoff.buildLeadthurHandoffHeadersForTest({
    secret: SECRET,
    body,
    eventId: opts.eventId ?? p.reference,
    productKey: opts.productKey ?? MC.key,
    nowSeconds: opts.nowSeconds ?? NOW,
    nonce: opts.nonce ?? crypto.randomUUID(),
  });
  return { body, headers };
}

function verifySig({ body, headers }, secret = SECRET, nowSeconds = NOW) {
  return handoff.verifyLeadthurHandoffSignature({
    secret,
    signature: handoff.parseLeadthurSignatureHeader(headers[handoff.LEADTHUR_SIGNATURE_HEADER]),
    timestamp: headers[handoff.LEADTHUR_TIMESTAMP_HEADER],
    nonce: headers[handoff.LEADTHUR_NONCE_HEADER],
    body,
    nowSeconds,
  });
}

const validate = (p, headerKey = MC.key) =>
  handoff.validateLeadthurHandoffPayment({
    headerProductKey: headerKey,
    payload: handoff.parseLeadthurHandoffPayload(JSON.stringify(p)).payload,
  });

// ---------------------------------------------------------------- catalog
await check("A1. masterclass product identity matches the live course and Paystack page", () => {
  assert.equal(MC.key, "ai-ads-automation-masterclass");
  assert.equal(MC.title, "AI Ads Automation Masterclass");
  assert.equal(MC.defaultCourseId, "4e2a16b5-bbfb-4a00-939c-87c7eb5f2afb");
  assert.equal(MC.expectedAmountKobo, 1_499_900);
  assert.equal(MC.expectedAmountNgn, 14_999);
  assert.equal(MC.currency, "NGN");
  assert.equal(MC.paymentPageSlug, "ai-ads-masterclass");
  assert.equal(MC.paymentPageUrl, "https://paystack.shop/pay/ai-ads-masterclass");
  assert.equal(MC.successRedirectUrl, "https://aimoneycode.com.ng/ai-ad/thank-you/");
  assert.equal(MC.metaPixelId, "1043090941844015");
});

await check("A2. existing Build Software With AI product is unchanged", () => {
  assert.equal(APP.key, "build-software-with-ai");
  assert.equal(APP.defaultCourseId, "9818cf69-4158-40b5-8926-54a3be38f306");
  assert.equal(APP.expectedAmountKobo, 1_499_900);
  assert.equal(APP.paymentPageSlug, "ai-app");
  assert.equal(APP.allowAmountOnlyFallback, true);
  assert.equal(APP.metaPixelId, undefined);
});

await check("A3. only one product may use the amount-only fallback", () => {
  assert.equal(products.PAYSTACK_EXTERNAL_PRODUCTS.filter((p) => p.allowAmountOnlyFallback).length, 1);
  assert.equal(MC.allowAmountOnlyFallback, false);
});

await check("A4. keys, slugs and course IDs are unique across the catalog", () => {
  const list = products.PAYSTACK_EXTERNAL_PRODUCTS;
  for (const field of ["key", "defaultCourseId", "paymentPageSlug"]) {
    assert.equal(new Set(list.map((p) => p[field])).size, list.length, field);
  }
});

await check("A5. identification by page slug, product key, referrer URL and title", () => {
  assert.equal(identify({ page: { slug: "ai-ads-masterclass" } }), MC.key);
  assert.equal(identify({ metadata: { product_key: MC.key } }), MC.key);
  assert.equal(identify({}, { metadata: { referrer: "https://paystack.shop/pay/ai-ads-masterclass" } }), MC.key);
  assert.equal(identify({ page: { name: "AI Ads Automation Masterclass" } }), MC.key);
});

await check("A6. same-price payments never cross-enrol", () => {
  assert.equal(identify({ page: { slug: "ai-app" } }), APP.key);
  assert.equal(identify({ metadata: { product_key: APP.key } }), APP.key);
  assert.equal(identify({ metadata: { product: "digitalskillx" } }), APP.key);
  assert.equal(identify({}), APP.key, "bare payload keeps the legacy ai-app fallback");
  assert.notEqual(identify({ page: { slug: "ai-ads-masterclass" } }), APP.key);
});

await check("A7. wrong amount, wrong currency, failed status and foreign metadata are rejected", () => {
  assert.equal(identify({ amount: 100_000, page: { slug: "ai-ads-masterclass" } }), null);
  assert.equal(identify({ currency: "USD", page: { slug: "ai-ads-masterclass" } }), null);
  assert.equal(identify({ status: "failed", page: { slug: "ai-ads-masterclass" } }), null);
  assert.equal(identify({ status: "abandoned", page: { slug: "ai-ads-masterclass" } }), null);
  assert.equal(identify({ metadata: { source: "leadthur" } }), null);
});

await check("A8. course ID override is per product and optional", () => {
  assert.equal(products.configuredExternalCourseId(MC), MC.defaultCourseId);
  process.env.PAYSTACK_AIADS_COURSE_ID = "11111111-1111-1111-1111-111111111111";
  assert.equal(products.configuredExternalCourseId(MC), "11111111-1111-1111-1111-111111111111");
  assert.equal(products.configuredExternalCourseId(APP), APP.defaultCourseId, "override must not leak across products");
  delete process.env.PAYSTACK_AIADS_COURSE_ID;
});

// --------------------------------------------------------------- handoff
await check("B1. valid signed masterclass handoff is accepted", () => {
  const request = signed(payload());
  assert.equal(verifySig(request).valid, true);
  const result = validate(payload());
  assert.equal(result.ok, true);
  assert.equal(result.product.key, MC.key);
  assert.equal(products.configuredExternalCourseId(result.product), MC.defaultCourseId);
});

await check("B2. invalid HMAC, wrong secret, tampered body and stale timestamp are rejected", () => {
  const request = signed(payload());
  const sig = handoff.parseLeadthurSignatureHeader(request.headers[handoff.LEADTHUR_SIGNATURE_HEADER]);
  const common = {
    timestamp: request.headers[handoff.LEADTHUR_TIMESTAMP_HEADER],
    nonce: request.headers[handoff.LEADTHUR_NONCE_HEADER],
    nowSeconds: NOW,
  };
  assert.equal(
    handoff.verifyLeadthurHandoffSignature({ secret: SECRET, signature: "a".repeat(64), body: request.body, ...common }).valid,
    false,
  );
  assert.equal(verifySig(request, "wrong_secret_wrong_secret_wrong_01").valid, false);
  assert.equal(
    handoff.verifyLeadthurHandoffSignature({
      secret: SECRET,
      signature: sig,
      body: request.body.replace("T_mc_handoff_001", "T_attacker"),
      ...common,
    }).valid,
    false,
  );
  assert.equal(verifySig(request, SECRET, NOW + 400).valid, false);
});

await check("B3. replayed nonce is rejected by the persistent store", async () => {
  const store = new Set();
  const admin = {
    from(table) {
      assert.equal(table, "leadthur_handoff_nonces");
      return {
        delete: () => ({ lt: async () => ({ error: null }) }),
        insert(row) {
          const value = row.nonce ?? row;
          if (store.has(value)) return Promise.resolve({ error: { message: "duplicate key value" } });
          store.add(value);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const args = { nonce: "mc-nonce-1", eventId: "T_mc", productKey: MC.key, reference: "T_mc" };
  assert.equal((await nonceMod.claimLeadthurHandoffNonce(admin, args)).ok, true);
  const second = await nonceMod.claimLeadthurHandoffNonce(admin, args);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "replayed_nonce");
});

await check("B4. wrong amount, wrong currency, unknown product and mismatched header are rejected", () => {
  assert.equal(validate(payload({ amount: 100_000 })).ok, false);
  assert.equal(validate(payload({ currency: "USD" })).ok, false);
  assert.equal(validate(payload({ product_key: "unknown-product" }), "unknown-product").ok, false);
  assert.equal(validate(payload(), APP.key).ok, false, "header product must match payload product");
});

await check("B5. forged course ID is rejected, including another product's real course", () => {
  const forged = validate(payload({ course_id: "00000000-0000-0000-0000-000000000001" }));
  assert.equal(forged.ok, false);
  assert.equal(forged.reason, "forged_course_id");
  const crossCourse = validate(payload({ course_id: APP.defaultCourseId }));
  assert.equal(crossCourse.ok, false);
  assert.equal(crossCourse.reason, "forged_course_id");
});

await check("B6. non-success status never reaches fulfilment as success", () => {
  const source = read("lib/paystack-external-fulfillment.ts");
  assert.match(source, /handoff\.status !== "success"/);
  assert.match(source, /verified\.status !== "success"/);
});

// ------------------------------------------------------------------ Meta
const ctx = { reference: "T_mc_meta_001", customerEmail: "  Buyer@Example.COM ", product: MC };

await check("C1. Purchase event carries value, currency, product name, ID and type", () => {
  const { data } = tracking.buildMetaPurchaseEvent(ctx, NOW);
  assert.equal(data.length, 1);
  const event = data[0];
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.action_source, "website");
  assert.equal(event.event_time, NOW);
  assert.equal(event.custom_data.value, 14_999);
  assert.equal(event.custom_data.currency, "NGN");
  assert.equal(event.custom_data.content_name, "AI Ads Automation Masterclass");
  assert.deepEqual(event.custom_data.content_ids, [MC.key]);
  assert.equal(event.custom_data.content_type, "product");
  assert.equal(event.event_source_url, "https://aimoneycode.com.ng/ai-ad/thank-you/");
});

await check("C2. event_id is transaction based and matches the browser format", () => {
  assert.equal(tracking.metaPurchaseEventId("T_mc_meta_001"), "purchase_T_mc_meta_001");
  const a = tracking.buildMetaPurchaseEvent(ctx, NOW).data[0].event_id;
  const b = tracking.buildMetaPurchaseEvent(ctx, NOW + 90).data[0].event_id;
  assert.equal(a, b, "a retry must reuse the same event_id so Meta deduplicates");
  const other = tracking.buildMetaPurchaseEvent({ ...ctx, reference: "T_other" }, NOW).data[0].event_id;
  assert.notEqual(a, other);
});

await check("C3. email is normalized and SHA-256 hashed, never sent in clear text", () => {
  const { data } = tracking.buildMetaPurchaseEvent(ctx, NOW);
  const expected = crypto.createHash("sha256").update("buyer@example.com").digest("hex");
  assert.deepEqual(data[0].user_data.em, [expected]);
  assert.ok(!JSON.stringify(data).toLowerCase().includes("buyer@example.com"));
});

await check("C4. pixel resolution: product pixel wins, ai-app keeps the env default", () => {
  assert.equal(tracking.resolveMetaPixelId(MC, "999"), "1043090941844015");
  assert.equal(tracking.resolveMetaPixelId(APP, "999"), "999");
  assert.equal(tracking.resolveMetaPixelId(APP, undefined), undefined);
  assert.equal(tracking.resolveMetaPixelId(APP, "  "), undefined);
});

await check("C5. CAPI token env name is pixel specific and never a literal secret", () => {
  assert.equal(tracking.metaCapiTokenEnvName("1043090941844015"), "META_CAPI_TOKEN_1043090941844015");
  const source = read("lib/purchase-tracking.ts");
  assert.ok(!/EAA[A-Za-z0-9]{20,}/.test(source), "no Meta token in source");
  assert.match(source, /runtimeEnv\(metaCapiTokenEnvName/);
});

await check("C6. Purchase is sent only after verified fulfilment and a successful access email", () => {
  const source = read("lib/paystack-external-fulfillment.ts");
  const emailOk = source.indexOf("if (emailResult.sent) {");
  const track = source.indexOf("await trackExternalPurchase({");
  const verifyGate = source.indexOf('verified.status !== "success"');
  assert.ok(verifyGate > -1 && emailOk > verifyGate && track > emailOk, "tracking must follow verification and email");
  assert.match(source, /!externalMeta\?\.purchase_tracking_sent_at/, "send once per transaction");
});

await check("C7. Stape GA4 and Meta CAPI both remain wired", () => {
  const source = read("lib/purchase-tracking.ts");
  assert.match(source, /sendStapeGa4Purchase/);
  assert.match(source, /sendMetaCapiPurchase/);
  assert.match(source, /graph\.facebook\.com/);
});

// ---------------------------------------------------------------- status
const base = "https://www.digitalskillx.com";
const COURSE = MC.defaultCourseId;
const tx = (patch = {}, data = {}) => ({
  status: "success",
  course_id: COURSE,
  paystack_data: {
    source: "leadthur-paystack-router",
    product_key: MC.key,
    fulfillment_status: "email_sent",
    access_email_sent_at: "2026-11-15T09:01:00.000Z",
    ...data,
  },
  ...patch,
});

await check("D1. verified, enrolled and emailed payment reports paid with the course link", () => {
  const result = status.computePurchaseStatus({ transaction: tx(), enrolled: true, siteBaseUrl: base });
  assert.equal(result.status, "paid");
  assert.equal(result.enrolled, true);
  assert.equal(result.emailSent, true);
  assert.equal(result.product.courseUrl, `${base}/courses/${COURSE}`);
  assert.equal(result.product.valueNgn, 14_999);
  assert.equal(result.product.key, MC.key);
});

await check("D2. unknown reference reports pending, never paid", () => {
  const result = status.computePurchaseStatus({ transaction: null, enrolled: false, siteBaseUrl: base });
  assert.equal(result.status, "pending");
  assert.equal(result.product, undefined);
});

await check("D3. payment without enrolment is pending, not paid", () => {
  const result = status.computePurchaseStatus({
    transaction: tx({}, { fulfillment_status: "payment_verified", access_email_sent_at: null }),
    enrolled: false,
    siteBaseUrl: base,
  });
  assert.equal(result.status, "pending");
  assert.equal(result.product, undefined);
});

await check("D4. pending transaction record is pending even if an enrolment exists", () => {
  const result = status.computePurchaseStatus({ transaction: tx({ status: "pending" }), enrolled: true, siteBaseUrl: base });
  assert.equal(result.status, "pending");
});

await check("D5. failed payment reports failed and exposes no product", () => {
  const result = status.computePurchaseStatus({ transaction: tx({ status: "failed" }), enrolled: false, siteBaseUrl: base });
  assert.equal(result.status, "failed");
  assert.equal(result.product, undefined);
});

await check("D6. email failure is visible so the page can offer recovery", () => {
  const result = status.computePurchaseStatus({
    transaction: tx({}, { fulfillment_status: "email_failed", access_email_sent_at: null }),
    enrolled: true,
    siteBaseUrl: base,
  });
  assert.equal(result.status, "paid");
  assert.equal(result.emailSent, false);
  assert.equal(result.fulfillment, "email_failed");
});

await check("D7. transactions from other courses and sources are never exposed", () => {
  const other = status.computePurchaseStatus({
    transaction: { status: "success", course_id: COURSE, paystack_data: { source: "paystack", reference: "dsx_1" } },
    enrolled: true,
    siteBaseUrl: base,
  });
  assert.equal(other.status, "pending");
  assert.equal(other.product, undefined);
});

await check("D8. response holds no personal data or secrets", () => {
  const result = status.computePurchaseStatus({
    transaction: tx({}, { customer_email: "buyer@example.com", checkout_email: "buyer@example.com", student_id: "s1" }),
    enrolled: true,
    siteBaseUrl: base,
  });
  const json = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["buyer@example.com", "email\":", "student", "password", "token", "secret"]) {
    assert.ok(!json.includes(forbidden), forbidden);
  }
});

await check("D9. reference validation rejects malformed input", () => {
  for (const ok of ["T_mc_001", "ps-ref.123", "abcd"]) assert.equal(status.isValidPurchaseReference(ok), true, ok);
  for (const bad of ["", "abc", "a b c d", "x".repeat(101), "../../etc", "ref;drop", null, undefined, 42]) {
    assert.equal(status.isValidPurchaseReference(bad), false, String(bad));
  }
});

await check("D10. status route is wired to the pure logic, is uncached and never reads secrets", () => {
  const route = read("app/api/purchase-status/route.ts");
  assert.match(route, /computePurchaseStatus/);
  assert.match(route, /isValidPurchaseReference/);
  assert.match(route, /no-store/);
  assert.match(route, /dynamic = "force-dynamic"/);
  assert.ok(!/runtimeEnv|process\.env|SECRET|TOKEN/.test(route), "route must not touch secrets");
  assert.match(route, /status: 503/, "lookup failure must not read as success");
});

// ------------------------------------------------- fulfilment contracts
await check("E1. email failure returns a retryable 500 and success email is recorded once", () => {
  const source = read("lib/paystack-external-fulfillment.ts");
  assert.match(source, /Access email failed to send/);
  assert.match(source, /permanent: false,\s*\n\s*status: 500/);
  assert.match(source, /access_email_sent_at: emailResult\.sent \? new Date\(\)\.toISOString\(\) : null/);
  assert.match(source, /!externalMeta\?\.access_email_sent_at \|\| params\.forceEmail/);
});

await check("E2. the router answers 5xx on handoff failure so Paystack retries delivery", () => {
  const handler = read("lib/leadthur-handoff-handler.ts");
  assert.match(handler, /status: result\.status/);
  assert.match(handler, /claimLeadthurHandoffNonce/);
});

await check("E3. new and existing students share one path with no duplicate account", () => {
  const source = read("lib/paystack-external-fulfillment.ts");
  assert.match(source, /resolveOrCreateStudentForPurchase/);
  assert.match(source, /enrollmentExists/);
  assert.match(source, /duplicate_enrollment/);
  assert.match(source, /duplicate_payment/);
});

await check("E4. passwords never reach logs", () => {
  const source = read("lib/paystack-external-fulfillment.ts");
  const logCalls = source.match(/secureLog\([\s\S]*?\);/g) ?? [];
  for (const call of logCalls) assert.ok(!/password|loginPassword/i.test(call), call.slice(0, 80));
});

console.log(`\nPASS: AI Ads Automation Masterclass certification (${passed} checks)`);
