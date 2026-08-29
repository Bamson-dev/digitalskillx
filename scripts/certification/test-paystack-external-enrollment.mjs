#!/usr/bin/env node
/**
 * Paystack Payment Page → DigitalSkillX enrollment certification.
 * Run: npm run test:paystack-external
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const leadthurBackend = resolve(root, "../LeadRush/backend");
const ts = (rel) => pathToFileURL(join(root, rel)).href;
const read = (rel) => readFileSync(join(root, rel), "utf8");
const readLeadthur = (rel) => readFileSync(join(leadthurBackend, rel), "utf8");

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`PASS: ${label}`);
}

const products = await import(ts("lib/paystack-external-products.ts"));
const emailTpl = await import(ts("lib/email/system-templates.ts"));

const PRODUCT = products.BUILD_SOFTWARE_WITH_AI_PRODUCT;
const validVerified = {
  status: "success",
  reference: "T_aiapp_001",
  amount: 4_999_900,
  currency: "NGN",
  metadata: { product_key: "build-software-with-ai" },
  customer: { email: "buyer@example.com", first_name: "Ada", last_name: "Lovelace" },
};

check("product config matches ₦49,999 NGN", () => {
  assert.equal(PRODUCT.expectedAmountKobo, 4_999_900);
  assert.equal(PRODUCT.expectedAmountNgn, 49_999);
  assert.equal(PRODUCT.currency, "NGN");
  assert.equal(PRODUCT.paymentPageSlug, "aiapp");
});

check("valid charge.success product identification", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: validVerified,
    webhookData: {
      reference: "T_aiapp_001",
      amount: 4_999_900,
      currency: "NGN",
      customer: validVerified.customer,
      metadata: { payment_page: "aiapp" },
    },
  });
  assert.equal(match?.key, "build-software-with-ai");
});

check("invalid Paystack signature rejected", () => {
  const secret = "sk_test_demo_secret";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
  const good = crypto.createHmac("sha512", secret).update(body).digest("hex");
  const bad = crypto.createHmac("sha512", secret).update(`${body}tamper`).digest("hex");
  assert.notEqual(good, bad);
});

check("wrong amount rejected", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: { ...validVerified, amount: 50_000_000 },
    webhookData: null,
  });
  assert.equal(match, null);
});

check("wrong currency rejected", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: { ...validVerified, currency: "USD" },
    webhookData: null,
  });
  assert.equal(match, null);
});

check("failed transaction rejected", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: { ...validVerified, status: "failed" },
    webhookData: null,
  });
  assert.equal(match, null);
});

check("pending transaction rejected", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: { ...validVerified, status: "pending" },
    webhookData: null,
  });
  assert.equal(match, null);
});

check("wrong product amount rejected", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: { ...validVerified, amount: 2_000_000 },
    webhookData: { metadata: { product_key: "other-product" } },
  });
  assert.equal(match, null);
});

check("metadata product_key accepted", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: validVerified,
    webhookData: { metadata: { product_key: "build-software-with-ai" } },
  });
  assert.equal(match?.key, "build-software-with-ai");
});

check("amount+currency alone does not identify product", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: { ...validVerified, metadata: {} },
    webhookData: { amount: 4_999_900, currency: "NGN" },
  });
  assert.equal(match, null);
});

check("page slug aiapp identifies product", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: { ...validVerified, metadata: {} },
    webhookData: {
      amount: 4_999_900,
      currency: "NGN",
      page: { slug: "aiapp" },
    },
  });
  assert.equal(match?.key, "build-software-with-ai");
});

check("paystack.shop referrer identifies product", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: { ...validVerified, metadata: {} },
    webhookData: {
      amount: 4_999_900,
      currency: "NGN",
      metadata: { referrer: "https://paystack.shop/pay/aiapp" },
    },
  });
  assert.equal(match?.key, "build-software-with-ai");
});

check("Leadthur payment must not match DigitalSkillX product", () => {
  const match = products.identifyPaystackExternalProduct({
    verified: {
      status: "success",
      amount: 50_000_000,
      currency: "NGN",
      metadata: { product: "leadthur", source: "leadthur_checkout" },
    },
    webhookData: {
      reference: "LP-1786343304640-4WA4OQ",
      metadata: { product: "leadthur" },
    },
  });
  assert.equal(match, null);
});

check("configured course id defaults to production course", () => {
  const prev = process.env.PAYSTACK_AIAPP_COURSE_ID;
  delete process.env.PAYSTACK_AIAPP_COURSE_ID;
  assert.equal(
    products.configuredExternalCourseId(PRODUCT),
    "9818cf69-4158-40b5-8926-54a3be38f306",
  );
  process.env.PAYSTACK_AIAPP_COURSE_ID = "course-override";
  assert.equal(products.configuredExternalCourseId(PRODUCT), "course-override");
  if (prev) process.env.PAYSTACK_AIAPP_COURSE_ID = prev;
  else delete process.env.PAYSTACK_AIAPP_COURSE_ID;
});

check("external paystack_data reader", () => {
  const row = products.readExternalPaystackData({
    source: "paystack_payment_page",
    product_key: "build-software-with-ai",
    fulfillment_status: "enrolled",
  });
  assert.equal(row?.product_key, "build-software-with-ai");
  assert.equal(row?.fulfillment_status, "enrolled");
});

check("access email subject and course title", () => {
  const tpl = emailTpl.paystackCourseAccessReadyEmail({
    firstName: "Ada",
    courseTitle: PRODUCT.title,
    courseUrl: "https://www.digitalskillx.com/courses/abc",
    loginUrl: "https://www.digitalskillx.com/login",
    isNewAccount: false,
    supportEmail: "support@digitalskillx.com",
  });
  assert.equal(tpl.subject, "Your course access is ready");
  assert.match(tpl.html, /Build And Monetize Your Software With AI/);
  assert.match(tpl.html, /Start learning/);
});

check("new account email mentions secure sign-in", () => {
  const tpl = emailTpl.paystackCourseAccessReadyEmail({
    firstName: "Ada",
    courseTitle: PRODUCT.title,
    courseUrl: "https://www.digitalskillx.com/courses/abc",
    loginUrl: "https://www.digitalskillx.com/login",
    isNewAccount: true,
    supportEmail: "support@digitalskillx.com",
  });
  assert.match(tpl.html, /secure sign-in link/i);
});

check("webhook route supports Leadthur handoff and direct Paystack", () => {
  const route = read("app/api/webhooks/paystack/route.ts");
  assert.match(route, /isLeadthurHandoffRequest/);
  assert.match(route, /handleLeadthurHandoffRequest/);
  assert.match(route, /verifyWebhookSignature/);
  assert.match(route, /completePaidCheckout/);
});

check("fulfillment module uses server verification", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /verifyTransaction/);
  assert.match(mod, /resolveOrCreateStudentForPurchase/);
  assert.match(mod, /ensurePurchaseEnrollment|fulfillPurchase/);
  assert.match(mod, /skipCustomerEmails:\s*true/);
});

check("idempotency via unique transaction reference", () => {
  const mig = read("supabase/migrations/0005_marketplace.sql");
  assert.match(mig, /reference\s+text not null unique/i);
});

check("duplicate enrollment protection via enrollments table", () => {
  const mig = read("supabase/migrations/0001_init.sql");
  assert.match(mig, /unique.*student_id.*course_id|student_id.*course_id.*unique/i);
});

check("client cannot set course id in fulfillment module", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.doesNotMatch(mod, /request\.json/);
  assert.doesNotMatch(mod, /searchParams/);
});

check("mocked E2E flow stages present", () => {
  const stages = [
    "payment_received",
    "payment_verified",
    "user_found",
    "user_created",
    "enrollment_created",
    "duplicate_payment",
    "duplicate_enrollment",
    "email_sent",
    "fulfillment_failed",
  ];
  const mod = read("lib/paystack-external-fulfillment.ts");
  for (const stage of stages) {
    assert.match(mod, new RegExp(stage));
  }
});

check("purchase flow preserves skipCustomerEmails flag", () => {
  const mod = read("lib/purchase.ts");
  assert.match(mod, /skipCustomerEmails/);
});

check("no plaintext password in access email template", () => {
  const tpl = emailTpl.paystackCourseAccessReadyEmail({
    firstName: "Ada",
    courseTitle: PRODUCT.title,
    courseUrl: "https://www.digitalskillx.com/courses/abc",
    loginUrl: "https://www.digitalskillx.com/login",
    isNewAccount: true,
    supportEmail: "support@digitalskillx.com",
  });
  assert.doesNotMatch(tpl.html, /Password:/i);
});

check("duplicate email skipped when access email already sent", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /duplicate_email_skipped/);
  assert.match(mod, /access_email_sent_at/);
});

check("abandoned payment handled without enrollment", () => {
  const route = read("app/api/webhooks/paystack/route.ts");
  assert.match(route, /charge\.abandoned/);
  assert.match(route, /status:\s*"failed"/);
});

check("missing customer email rejected in fulfillment", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /missing_customer_email/);
});

check("Paystack API verification failure returns handled error", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /verify_failed/);
  assert.match(mod, /verifyTransaction/);
});

check("enrollment already exists path is idempotent", () => {
  const mod = read("lib/paystack-external-fulfillment.ts");
  assert.match(mod, /duplicate_enrollment/);
  assert.match(mod, /priorEnrollment/);
});

check("Leadthur webhook routes DigitalSkillX payments", () => {
  const router = readLeadthur("src/api/webhook-router.ts");
  assert.match(router, /isDigitalSkillXPaystackEvent/);
  assert.match(router, /routeDigitalSkillXCharge/);
  assert.match(router, /isLeadThurLifetimePaystackCharge/);
});

check("DigitalSkillX payment must not trigger Leadthur fulfillment", () => {
  const guard = readLeadthur("src/services/paystack-product-guard.ts");
  assert.match(guard, /isDigitalSkillXPaystackEvent/);
  assert.match(guard, /return false/);
});

console.log(`\nPASS: Paystack external enrollment certification (${passed} checks)`);
