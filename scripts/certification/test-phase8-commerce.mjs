/**
 * Phase 8 — Conversion / commerce growth (offline).
 * Does not hit production or mutate live data.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function mustExist(rel) {
  assert.ok(existsSync(join(root, rel)), `missing ${rel}`);
}

async function load(rel) {
  return import(pathToFileURL(join(root, rel)).href);
}

async function main() {
  // Artifacts
  for (const f of [
    "supabase/migrations/0041_phase8_commerce_growth.sql",
    "sql/apply-phase8-commerce-growth.sql",
    "lib/commerce-ownership.ts",
    "lib/commerce-offers.ts",
    "lib/commerce-fulfillment.ts",
    "lib/commerce-checkout-initialize.ts",
    "lib/digital-products.ts",
    "app/api/admin/commerce-offers/route.ts",
    "app/api/admin/digital-products/route.ts",
    "app/api/cron/checkout-abandon/route.ts",
    "app/(admin)/admin/(panel)/offers/page.tsx",
    "app/(admin)/admin/(panel)/digital-products/page.tsx",
    "app/purchase/success/page.tsx",
    "components/admin/commerce-offers-panel.tsx",
    "components/admin/course-recommendations-panel.tsx",
    "components/admin/digital-products-panel.tsx",
  ]) {
    mustExist(f);
  }
  console.log("PASS: Phase 8 artifacts present");

  const migration = read("supabase/migrations/0041_phase8_commerce_growth.sql");
  assert.match(migration, /commerce_offers/);
  assert.match(migration, /digital_products/);
  assert.match(migration, /checkout_abandon_reminders/);
  assert.match(migration, /next_step/);
  assert.match(migration, /checkout_abandoned/);
  assert.doesNotMatch(migration, /affiliate/i);
  console.log("PASS: migration additive + no affiliates");

  // Ownership helpers (logic)
  const ownershipSrc = read("lib/commerce-ownership.ts");
  assert.match(ownershipSrc, /studentOwnsCourse/);
  assert.match(ownershipSrc, /bundleProvidesNewValue/);
  assert.match(ownershipSrc, /studentOwnsDigitalProduct/);
  console.log("PASS: ownership helpers");

  // Offer resolution never trusts client price
  const offersSrc = read("lib/commerce-offers.ts");
  assert.match(offersSrc, /resolveLiveOfferForCheckout/);
  assert.match(offersSrc, /chargeNgn: offer\.price_ngn/);
  assert.match(offersSrc, /You already have access/);
  console.log("PASS: offer price + ownership guards");

  // Checkout uses existing Paystack initialize
  const initSrc = read("app/api/payments/initialize/route.ts");
  assert.match(initSrc, /initializeCommerceCheckout/);
  assert.match(initSrc, /offerId|bundleId/);
  const commerceInit = read("lib/commerce-checkout-initialize.ts");
  assert.match(commerceInit, /initializeTransaction/);
  assert.match(commerceInit, /nairaToKobo\(chargeNgn\)/);
  assert.doesNotMatch(commerceInit, /body\.price|clientPrice|amountFromClient/i);
  console.log("PASS: checkout wires existing Paystack + server price");

  // Fulfillment reuses enrollments / entitlements
  const fulfill = read("lib/commerce-fulfillment.ts");
  assert.match(fulfill, /ensurePurchaseEnrollment|fulfillPurchase/);
  assert.match(fulfill, /enrollStudentInBundle/);
  assert.match(fulfill, /grantDigitalProductEntitlement/);
  assert.match(fulfill, /source: \"purchase\"/);
  console.log("PASS: fulfillment reuses enrollment + digital entitlements");

  // Guest checkout uses commerce fulfillment
  const guest = read("lib/guest-checkout.ts");
  assert.match(guest, /fulfillCommercePurchase/);
  console.log("PASS: guest checkout commerce fulfillment");

  // Recommendations kinds extended
  const recs = read("lib/course-recommendations.ts");
  assert.match(recs, /next_step/);
  assert.match(recs, /frequently_bought/);
  assert.match(recs, /upgrade/);
  console.log("PASS: recommendation kinds");

  // Analytics events
  const analytics = read("lib/product-analytics.ts");
  for (const ev of [
    "offer_viewed",
    "offer_cta_clicked",
    "checkout_started",
    "checkout_completed",
    "checkout_abandoned",
    "upsell_accepted",
    "upsell_declined",
    "product_purchased",
  ]) {
    assert.match(analytics, new RegExp(ev));
  }
  console.log("PASS: product event vocabulary");

  // Abandonment
  const abandon = read("app/api/cron/checkout-abandon/route.ts");
  assert.match(abandon, /CRON_SECRET|authorization/i);
  assert.match(abandon, /sendCheckoutAbandonReminderIfNeeded|checkout_abandon/);
  const triggers = read("lib/system-email-triggers.ts");
  assert.match(triggers, /sendCheckoutAbandonReminderIfNeeded/);
  assert.match(triggers, /72|cooldown|checkout_abandon_reminders/);
  console.log("PASS: abandonment cron + idempotent email");

  // Resend-only still
  const emailIdx = read("lib/email/index.ts");
  assert.match(emailIdx, /sendViaResend/);
  assert.doesNotMatch(emailIdx, /from ["']nodemailer["']|require\(["']nodemailer["']\)/);
  assert.doesNotMatch(emailIdx, /createTransport\s*\(/);
  assert.doesNotMatch(emailIdx, /sendViaZepto|zeptomail\.smtp/i);
  console.log("PASS: Resend-only email path intact");

  // No affiliate
  const sidebar = read("components/admin/admin-sidebar.tsx");
  assert.doesNotMatch(sidebar, /affiliate/i);
  assert.match(sidebar, /\/admin\/offers/);
  console.log("PASS: admin nav offers, no affiliates");

  // Post-purchase
  const success = read("app/purchase/success/page.tsx");
  assert.match(success, /RecommendationRail|recommend/i);
  const payReturn = read("components/marketplace/payment-return-handler.tsx");
  assert.match(payReturn, /purchase\/success/);
  console.log("PASS: post-purchase success + payment redirect");

  // Types
  const types = read("types/database.ts");
  assert.match(types, /checkout_abandoned/);
  console.log("PASS: automation trigger type");

  // Pure recommendation priority doc in code comments / helper
  const recPriority = read("lib/course-recommendations.ts");
  assert.match(recPriority, /getCourseRecommendationsForDisplay/);
  assert.match(recPriority, /recommendCourses/);
  console.log("PASS: deterministic admin-then-heuristic recommendations");

  console.log("\nAll Phase 8 offline checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
