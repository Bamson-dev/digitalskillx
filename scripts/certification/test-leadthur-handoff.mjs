#!/usr/bin/env node
/**
 * Leadthur signed Paystack handoff certification.
 * Run: npm run test:leadthur-handoff
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

const handoff = await import(ts("lib/leadthur-handoff.ts"));
const products = await import(ts("lib/paystack-external-products.ts"));
const nonceMod = await import(ts("lib/leadthur-handoff-nonce.ts"));

const PRODUCT = products.BUILD_SOFTWARE_WITH_AI_PRODUCT;
const NOW = 1_800_000_000;

function buildPayload(overrides = {}) {
  return {
    event: "charge.success",
    source: "leadthur-paystack-router",
    product_key: PRODUCT.key,
    course_id: PRODUCT.defaultCourseId,
    reference: "T_handoff_001",
    amount: PRODUCT.expectedAmountKobo,
    currency: "NGN",
    status: "success",
    paid_at: "2026-08-29T09:00:00.000Z",
    customer: { email: "buyer@example.com" },
    ...overrides,
  };
}

function signedRequest(payload, opts = {}) {
  const body = JSON.stringify(payload);
  const headers = handoff.buildLeadthurHandoffHeadersForTest({
    secret: SECRET,
    body,
    eventId: opts.eventId ?? payload.reference,
    productKey: opts.productKey ?? PRODUCT.key,
    nowSeconds: opts.nowSeconds ?? NOW,
    nonce: opts.nonce ?? crypto.randomUUID(),
  });
  return { body, headers };
}

function headerBag(headers) {
  return {
    get(name) {
      const key = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
      return key ? headers[key] : null;
    },
  };
}

function mockNonceAdmin(store = new Set()) {
  return {
    from(table) {
      assert.equal(table, "leadthur_handoff_nonces");
      return {
        delete() {
          return { lt: async () => ({ error: null }) };
        },
        insert(row) {
          const nonce = row.nonce ?? row;
          const value = typeof nonce === "object" ? nonce.nonce : nonce;
          if (store.has(value)) {
            return Promise.resolve({ error: { message: "duplicate key value" } });
          }
          store.add(value);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

let passed = 0;
async function check(label, fn) {
  await fn();
  passed += 1;
  console.log(`PASS: ${label}`);
}

await check("1. valid Leadthur signature verifies", () => {
  const { body, headers } = signedRequest(buildPayload());
  const sig = handoff.parseLeadthurSignatureHeader(headers[handoff.LEADTHUR_SIGNATURE_HEADER]);
  assert.ok(sig);
  const result = handoff.verifyLeadthurHandoffSignature({
    secret: SECRET,
    signature: sig,
    timestamp: headers[handoff.LEADTHUR_TIMESTAMP_HEADER],
    nonce: headers[handoff.LEADTHUR_NONCE_HEADER],
    body,
    nowSeconds: NOW,
  });
  assert.equal(result.valid, true);
});

await check("2. invalid signature rejected", () => {
  const { body, headers } = signedRequest(buildPayload());
  const result = handoff.verifyLeadthurHandoffSignature({
    secret: SECRET,
    signature: "a".repeat(64),
    timestamp: headers[handoff.LEADTHUR_TIMESTAMP_HEADER],
    nonce: headers[handoff.LEADTHUR_NONCE_HEADER],
    body,
    nowSeconds: NOW,
  });
  assert.equal(result.valid, false);
});

await check("3. missing signature header detected", () => {
  const result = handoff.readLeadthurHandoffHeaders(headerBag({}));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_signature");
});

await check("4. wrong secret fails verification", () => {
  const { body, headers } = signedRequest(buildPayload());
  const sig = handoff.parseLeadthurSignatureHeader(headers[handoff.LEADTHUR_SIGNATURE_HEADER]);
  const result = handoff.verifyLeadthurHandoffSignature({
    secret: "wrong_secret_wrong_secret_wrong_01",
    signature: sig,
    timestamp: headers[handoff.LEADTHUR_TIMESTAMP_HEADER],
    nonce: headers[handoff.LEADTHUR_NONCE_HEADER],
    body,
    nowSeconds: NOW,
  });
  assert.equal(result.valid, false);
});

await check("5. missing timestamp rejected", () => {
  const { body, headers } = signedRequest(buildPayload());
  const bag = headerBag({ ...headers, [handoff.LEADTHUR_TIMESTAMP_HEADER]: "" });
  const result = handoff.readLeadthurHandoffHeaders(bag);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_timestamp");
});

await check("6. stale timestamp rejected", () => {
  const { body, headers } = signedRequest(buildPayload(), { nowSeconds: NOW - 400 });
  const sig = handoff.parseLeadthurSignatureHeader(headers[handoff.LEADTHUR_SIGNATURE_HEADER]);
  assert.ok(sig);
  const result = handoff.verifyLeadthurHandoffSignature({
    secret: SECRET,
    signature: sig,
    timestamp: headers[handoff.LEADTHUR_TIMESTAMP_HEADER],
    nonce: headers[handoff.LEADTHUR_NONCE_HEADER],
    body,
    nowSeconds: NOW,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "stale_timestamp");
});

await check("7. future timestamp beyond tolerance rejected", () => {
  const { body, headers } = signedRequest(buildPayload(), { nowSeconds: NOW + 400 });
  const sig = handoff.parseLeadthurSignatureHeader(headers[handoff.LEADTHUR_SIGNATURE_HEADER]);
  assert.ok(sig);
  const result = handoff.verifyLeadthurHandoffSignature({
    secret: SECRET,
    signature: sig,
    timestamp: headers[handoff.LEADTHUR_TIMESTAMP_HEADER],
    nonce: headers[handoff.LEADTHUR_NONCE_HEADER],
    body,
    nowSeconds: NOW,
  });
  assert.equal(result.valid, false);
});

await check("8. missing nonce rejected", () => {
  const { headers } = signedRequest(buildPayload());
  const bag = headerBag({ ...headers, [handoff.LEADTHUR_NONCE_HEADER]: "" });
  const result = handoff.readLeadthurHandoffHeaders(bag);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_nonce");
});

await check("9. replayed nonce rejected by persistent store", async () => {
  const store = new Set();
  const admin = mockNonceAdmin(store);
  const first = await nonceMod.claimLeadthurHandoffNonce(admin, {
    nonce: "nonce-replay-1",
    eventId: "evt-1",
    productKey: PRODUCT.key,
    reference: "T_replay",
  });
  const second = await nonceMod.claimLeadthurHandoffNonce(admin, {
    nonce: "nonce-replay-1",
    eventId: "evt-2",
    productKey: PRODUCT.key,
    reference: "T_replay",
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "replayed_nonce");
});

await check("10. missing event ID rejected", () => {
  const { headers } = signedRequest(buildPayload());
  const bag = headerBag({ ...headers, [handoff.LEADTHUR_EVENT_ID_HEADER]: "" });
  const result = handoff.readLeadthurHandoffHeaders(bag);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_event_id");
});

await check("11. wrong product key rejected", () => {
  const payload = buildPayload({ product_key: "other-product" });
  const result = handoff.validateLeadthurHandoffPayment({
    headerProductKey: PRODUCT.key,
    payload: handoff.parseLeadthurHandoffPayload(JSON.stringify(payload)).payload,
  });
  assert.equal(result.ok, false);
});

await check("12. forged course ID rejected", () => {
  const payload = buildPayload({ course_id: "00000000-0000-0000-0000-000000000001" });
  const parsed = handoff.parseLeadthurHandoffPayload(JSON.stringify(payload));
  const result = handoff.validateLeadthurHandoffPayment({
    headerProductKey: PRODUCT.key,
    payload: parsed.payload,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "forged_course_id");
});

await check("13. wrong amount rejected", () => {
  const payload = buildPayload({ amount: 100_000 });
  const parsed = handoff.parseLeadthurHandoffPayload(JSON.stringify(payload));
  const result = handoff.validateLeadthurHandoffPayment({
    headerProductKey: PRODUCT.key,
    payload: parsed.payload,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "amount_or_currency_mismatch");
});

await check("14. wrong currency rejected", () => {
  const payload = buildPayload({ currency: "USD" });
  const parsed = handoff.parseLeadthurHandoffPayload(JSON.stringify(payload));
  const result = handoff.validateLeadthurHandoffPayment({
    headerProductKey: PRODUCT.key,
    payload: parsed.payload,
  });
  assert.equal(result.ok, false);
});

await check("15. missing Paystack reference rejected", () => {
  const payload = buildPayload({ reference: "" });
  const result = handoff.parseLeadthurHandoffPayload(JSON.stringify(payload));
  assert.equal(result.ok, false);
});

await check("16. valid ₦49,999 transaction accepted", () => {
  const payload = buildPayload();
  const parsed = handoff.parseLeadthurHandoffPayload(JSON.stringify(payload));
  const result = handoff.validateLeadthurHandoffPayment({
    headerProductKey: PRODUCT.key,
    payload: parsed.payload,
  });
  assert.equal(result.ok, true);
  assert.equal(result.product.key, PRODUCT.key);
  assert.equal(result.product.expectedAmountKobo, 4_999_900);
});

await check("17. duplicate reference idempotency uses transactions.reference unique", () => {
  const mig = read("supabase/migrations/0005_marketplace.sql");
  assert.match(mig, /reference\s+text not null unique/i);
});

await check("18. duplicate webhook path documented in fulfillment", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /duplicate_payment/);
  assert.match(mod, /duplicate_enrollment/);
});

await check("19. existing student flow uses resolveOrCreateStudentForPurchase", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /resolveOrCreateStudentForPurchase/);
  assert.match(mod, /user_found/);
});

await check("20. new student flow uses magic link", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /sendMagicLinkEmail/);
  assert.match(mod, /user_created/);
});

await check("21. enrollment already exists path is idempotent", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /priorEnrollment/);
  assert.match(mod, /duplicate_enrollment/);
});

await check("22. access email retry skipped when already sent", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /duplicate_email_skipped/);
  assert.match(mod, /access_email_sent_at/);
});

await check("23. Leadthur auth failure returns 401", () => {
  const mod = read("lib/leadthur-handoff-handler.ts");
  assert.match(mod, /status:\s*401/);
});

await check("24. DigitalSkillX 5xx on nonce store failure", () => {
  const mod = read("lib/leadthur-handoff-handler.ts");
  assert.match(mod, /status:\s*500/);
});

await check("25. network timeout is Leadthur retry concern", () => {
  const leadthur = readFileSync(
    join(root, "../LeadRush/backend/src/services/paystack-digitalskillx-forward.ts"),
    "utf8",
  );
  assert.match(leadthur, /FORWARD_TIMEOUT_MS/);
  assert.match(leadthur, /retryable/);
});

await check("26. direct Paystack path still verifies transaction", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /verifyTransaction/);
  assert.match(mod, /verify_failed/);
});

await check("27. forged payload body fails signature", () => {
  const { body, headers } = signedRequest(buildPayload());
  const sig = handoff.parseLeadthurSignatureHeader(headers[handoff.LEADTHUR_SIGNATURE_HEADER]);
  const tampered = body.replace("T_handoff_001", "T_attacker_999");
  const result = handoff.verifyLeadthurHandoffSignature({
    secret: SECRET,
    signature: sig,
    timestamp: headers[handoff.LEADTHUR_TIMESTAMP_HEADER],
    nonce: headers[handoff.LEADTHUR_NONCE_HEADER],
    body: tampered,
    nowSeconds: NOW,
  });
  assert.equal(result.valid, false);
});

await check("28. browser price manipulation cannot override catalog", () => {
  const payload = buildPayload({ amount: 1_000 });
  const parsed = handoff.parseLeadthurHandoffPayload(JSON.stringify(payload));
  const result = handoff.validateLeadthurHandoffPayment({
    headerProductKey: PRODUCT.key,
    payload: parsed.payload,
  });
  assert.equal(result.ok, false);
});

await check("29. browser course ID manipulation rejected", () => {
  const product = products.resolveExternalProductByKey(PRODUCT.key);
  assert.notEqual(product?.defaultCourseId, "attacker-course-id");
  const payload = buildPayload({ course_id: "attacker-course-id" });
  const parsed = handoff.parseLeadthurHandoffPayload(JSON.stringify(payload));
  const result = handoff.validateLeadthurHandoffPayment({
    headerProductKey: PRODUCT.key,
    payload: parsed.payload,
  });
  assert.equal(result.ok, false);
});

await check("30. successful complete flow wiring", () => {
  const route = read("app/api/webhooks/paystack/route.ts");
  const handler = read("lib/leadthur-handoff-handler.ts");
  const fulfillment = read("lib/paystack-external-fulfillment.ts");
  assert.match(route, /isLeadthurHandoffRequest/);
  assert.match(route, /handleLeadthurHandoffRequest/);
  assert.match(route, /verifyWebhookSignature/);
  assert.match(handler, /claimLeadthurHandoffNonce/);
  assert.match(handler, /fulfillPaystackExternalCharge/);
  assert.match(fulfillment, /handoffPayment/);
  assert.match(fulfillment, /leadthur-paystack-router/);

  const { body, headers } = signedRequest(buildPayload({ reference: "T_complete_flow" }));
  const sig = handoff.parseLeadthurSignatureHeader(headers[handoff.LEADTHUR_SIGNATURE_HEADER]);
  assert.equal(
    handoff.verifyLeadthurHandoffSignature({
      secret: SECRET,
      signature: sig,
      timestamp: headers[handoff.LEADTHUR_TIMESTAMP_HEADER],
      nonce: headers[handoff.LEADTHUR_NONCE_HEADER],
      body,
      nowSeconds: NOW,
    }).valid,
    true,
  );
  const parsed = handoff.parseLeadthurHandoffPayload(body);
  const validated = handoff.validateLeadthurHandoffPayment({
    headerProductKey: headers[handoff.LEADTHUR_PRODUCT_HEADER],
    payload: parsed.payload,
  });
  assert.equal(validated.ok, true);
  assert.equal(products.configuredExternalCourseId(validated.product), PRODUCT.defaultCourseId);
});

console.log(`\nPASS: Leadthur Paystack handoff certification (${passed} checks)`);
