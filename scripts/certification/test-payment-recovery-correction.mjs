#!/usr/bin/env node
/**
 * Historical false-paid correction tool: decision-logic tests.
 * Exercises planCorrection from scripts/payment-recovery-correct-false-paid.mjs
 * against fixture records shaped like the production incident groups.
 * No database, no network. Run: npm run test:payment-recovery-correction
 */
import assert from "node:assert/strict";
import { planCorrection } from "../payment-recovery-correct-false-paid.mjs";

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

const falsePaidGroup = (over = {}) => ({
  id: "grp_1",
  bank_reference: "DSX-REC-TEST01",
  customer_email: "buyer@example.com",
  product_type: "course",
  product_id: "course-1",
  course_id: "course-1",
  student_id: null,
  payment_status: "successful",
  recovery_status: "cancelled",
  is_open: false,
  recovered_via: "paystack",
  recovered_reference: null,
  recovered_amount_kobo: 1_499_900,
  ...over,
});
const nullRefPaidEvent = { id: "evt_paid", kind: "paid", detail: { via: "paystack", reference: null, amount_kobo: 1_499_900 } };
const abandonedAttempt = {
  reference: "T_ATTEMPT_1", status: "abandoned", paystack_status: "abandoned",
  last_verified_at: "2026-11-28T15:05:00Z",
};

await test("correction 1: E4A58D-shaped record is corrected to its verified status and closed already-owned", async () => {
  const plan = planCorrection({
    group: falsePaidGroup({ bank_reference: "DSX-REC-E4A58D" }),
    attempts: [abandonedAttempt],
    events: [
      { id: "evt_created", kind: "group_created", detail: {} },
      { id: "evt_ab", kind: "abandoned", detail: { reason: "checkout_abandoned" } },
      nullRefPaidEvent,
    ],
    ownership: { matched: "enrollment", transactionReference: null },
  });
  assert.equal(plan.action, "correct_false_paid");
  assert.equal(plan.derivedStatus, "abandoned", "status re-derived from the Paystack verification row");
  assert.equal(plan.paystackStatus, "abandoned");
  assert.equal(plan.closeAlreadyOwned, true, "the ownership association is preserved as an already-owned close");
  assert.equal(plan.associationMatch, "enrollment");
  assert.equal(plan.originalEventId, "evt_paid", "the corrective event references the original false paid event");
});

await test("correction 2: C5BE17-shaped record is reattributed to the genuine verified transaction", async () => {
  const plan = planCorrection({
    group: falsePaidGroup({ bank_reference: "DSX-REC-C5BE17" }),
    attempts: [abandonedAttempt],
    events: [nullRefPaidEvent],
    ownership: { matched: "transaction", transactionReference: "T_GENUINE_TX" },
  });
  assert.equal(plan.action, "reattribute", "a genuine payment exists, so the group is never re-opened or re-corrected as unpaid");
  assert.equal(plan.reference, "T_GENUINE_TX");
  assert.equal(plan.source, "transaction");
});

await test("correction 3: a verified successful attempt on the group itself is the reattribution source", async () => {
  const plan = planCorrection({
    group: falsePaidGroup(),
    attempts: [
      abandonedAttempt,
      { reference: "T_OWN_SUCCESS", status: "successful", paystack_status: "success", last_verified_at: "2026-11-28T15:07:00Z" },
    ],
    events: [nullRefPaidEvent],
    ownership: { matched: null, transactionReference: null },
  });
  assert.equal(plan.action, "reattribute");
  assert.equal(plan.reference, "T_OWN_SUCCESS");
  assert.equal(plan.source, "attempt");
});

await test("correction 4: a genuine referenced payment is never touched", async () => {
  const plan = planCorrection({
    group: falsePaidGroup({ recovered_reference: "T_REAL" }),
    attempts: [{ reference: "T_REAL", status: "successful", paystack_status: "success", last_verified_at: "2026-11-28T15:07:00Z" }],
    events: [{ id: "evt_real", kind: "recovered", detail: { via: "paystack", reference: "T_REAL", amount_kobo: 1_499_900 } }],
    ownership: { matched: null, transactionReference: null },
  });
  assert.equal(plan.action, "skip");
  assert.equal(plan.reason, "genuine_referenced_payment");
});

await test("correction 5: rerunning the correction is idempotent", async () => {
  // State after correction 1 was applied: status re-derived, recovered_*
  // cleared, corrective events appended. The false paid event still exists —
  // history is append-only — so idempotency keys on the corrective events.
  const plan = planCorrection({
    group: falsePaidGroup({
      payment_status: "abandoned",
      recovered_via: null,
      recovered_amount_kobo: null,
    }),
    attempts: [abandonedAttempt],
    events: [
      nullRefPaidEvent,
      { id: "evt_fix", kind: "correction_false_paid", detail: { original_event_id: "evt_paid" } },
      { id: "evt_own", kind: "closed_already_owned", detail: { via: "association", matched: "enrollment", via_correction: true } },
    ],
    ownership: { matched: "enrollment", transactionReference: null },
  });
  assert.equal(plan.action, "skip");
  assert.equal(plan.reason, "already_corrected");

  // Same for a reattributed group.
  const plan2 = planCorrection({
    group: falsePaidGroup({ recovered_reference: "T_GENUINE_TX" }),
    attempts: [abandonedAttempt],
    events: [
      nullRefPaidEvent,
      { id: "evt_fix2", kind: "correction_reattributed", detail: { verified_reference: "T_GENUINE_TX" } },
    ],
    ownership: { matched: "transaction", transactionReference: "T_GENUINE_TX" },
  });
  assert.equal(plan2.action, "skip");
  assert.equal(plan2.reason, "already_corrected");
});

await test("correction 6: ambiguous evidence is quarantined, never guessed", async () => {
  const plan = planCorrection({
    group: falsePaidGroup(),
    attempts: [{ reference: "T_UNVERIFIED", status: "awaiting_payment", paystack_status: null, last_verified_at: null }],
    events: [nullRefPaidEvent],
    ownership: { matched: null, transactionReference: null },
  });
  assert.equal(plan.action, "quarantine");
  assert.equal(plan.reason, "no_verified_terminal_attempt");
  assert.equal(plan.appendEvent, true, "first quarantine writes the review-pending audit event");

  const again = planCorrection({
    group: falsePaidGroup(),
    attempts: [{ reference: "T_UNVERIFIED", status: "awaiting_payment", paystack_status: null, last_verified_at: null }],
    events: [nullRefPaidEvent, { id: "evt_q", kind: "correction_review_pending", detail: { reason: "no_verified_terminal_attempt" } }],
    ownership: { matched: null, transactionReference: null },
  });
  assert.equal(again.action, "quarantine");
  assert.equal(again.appendEvent, false, "a repeat run does not spam review events");
});

await test("correction 7: records outside the fingerprint are ignored", async () => {
  const plan = planCorrection({
    group: falsePaidGroup({ payment_status: "abandoned", recovered_via: null, recovered_amount_kobo: null }),
    attempts: [abandonedAttempt],
    events: [{ id: "evt_ab", kind: "abandoned", detail: { reason: "checkout_abandoned" } }],
    ownership: { matched: null, transactionReference: null },
  });
  assert.equal(plan.action, "skip");
  assert.equal(plan.reason, "not_false_paid");
});

await test("correction 8: false-paid with no ownership association corrects without an already-owned close", async () => {
  const plan = planCorrection({
    group: falsePaidGroup(),
    attempts: [{ reference: "T_FAILED", status: "failed", paystack_status: "failed", last_verified_at: "2026-11-28T15:05:00Z" }],
    events: [nullRefPaidEvent],
    ownership: { matched: null, transactionReference: null },
  });
  assert.equal(plan.action, "correct_false_paid");
  assert.equal(plan.derivedStatus, "failed");
  assert.equal(plan.closeAlreadyOwned, false);
  assert.equal(plan.associationMatch, null);
});

console.log(`\n${passed} false-paid correction tests passed`);
if (process.exitCode) process.exit(process.exitCode);
