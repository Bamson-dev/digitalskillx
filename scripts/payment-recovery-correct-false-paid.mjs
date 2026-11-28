#!/usr/bin/env node
/**
 * Append-only correction for historical false-paid recovery groups.
 *
 * Background (2026-11-28 incident, PR #18): before the fix, an isAlreadyPaid
 * association match (the customer already owned the product) was closed
 * through markGroupPaid with a NULL Paystack reference, writing
 * payment_status='successful', recovered_* fields and a paid/recovered event
 * for a payment the group never made (e.g. DSX-REC-E4A58D, whose only attempt
 * Paystack verifies as abandoned / "Awaiting Transfer").
 *
 * This tool finds every group matching that fingerprint and, per group:
 *   - reattributes the close to a genuine verified payment when one exists
 *     (a verified successful attempt on the group, or a verified successful
 *     transaction for the same purchase), or
 *   - corrects the false payment: payment_status is re-derived from the
 *     group's own Paystack verification rows, the false recovered_*
 *     attribution is cleared, and — when an ownership association exists —
 *     the close is re-recorded as closed_already_owned, exactly what the
 *     fixed code writes today, or
 *   - quarantines the group (no state change) when the evidence is ambiguous.
 *
 * Original events are NEVER rewritten or deleted; every correction is a new
 * event referencing the original. Groups with a genuine referenced payment
 * are never touched. Running --apply twice changes nothing the second time.
 *
 * Usage (production, inside the app container):
 *   node scripts/payment-recovery-correct-false-paid.mjs            # dry run (default)
 *   node scripts/payment-recovery-correct-false-paid.mjs --apply    # write corrections
 *
 * Requires DATABASE_URL (same env as scripts/db-migrate.mjs). No secrets are
 * printed; customer emails are masked in the output.
 */
import { pathToFileURL } from "node:url";

const TERMINAL_ATTEMPT_STATUSES = new Set(["failed", "abandoned", "reversed", "expired"]);
const CORRECTIVE_KINDS = ["correction_false_paid", "correction_reattributed"];

function eventReference(e) {
  const ref = e?.detail?.reference;
  return typeof ref === "string" && ref.trim() ? ref.trim() : null;
}

function maskEmail(email) {
  const [local, domain] = String(email ?? "").split("@");
  if (!domain) return "***";
  return `${(local ?? "").slice(0, 2)}***@${domain}`;
}

/**
 * Pure decision function (unit-tested in
 * scripts/certification/test-payment-recovery-correction.mjs).
 *
 * input: {
 *   group,                // payment_recovery_groups row
 *   attempts,             // payment_recovery_attempts rows for the group
 *   events,               // payment_recovery_events rows for the group
 *   ownership,            // { matched: 'transaction'|'enrollment'|null,
 *                         //   transactionReference: string|null }
 * }
 * Genuine-payment evidence is gathered by the caller in this priority:
 * a verified successful attempt on the group itself outranks an outside
 * successful transaction.
 */
export function planCorrection(input) {
  const { group, attempts, events, ownership } = input;
  const label = group.bank_reference ?? group.id;

  const priorCorrection = events.find((e) => CORRECTIVE_KINDS.includes(e.kind));
  if (priorCorrection) {
    return { action: "skip", reason: "already_corrected", label, priorKind: priorCorrection.kind };
  }

  const paidEvents = events.filter((e) => e.kind === "paid" || e.kind === "recovered");
  const nullRefPaid = paidEvents.find((e) => !eventReference(e));

  // A genuine referenced payment on this group is never touched.
  const referencedPaid = paidEvents.find((e) => eventReference(e));
  if (referencedPaid && group.recovered_reference && eventReference(referencedPaid) === group.recovered_reference) {
    return { action: "skip", reason: "genuine_referenced_payment", label };
  }

  const groupFingerprint =
    group.payment_status === "successful" &&
    group.recovered_via === "paystack" &&
    !group.recovered_reference;
  if (!nullRefPaid && !groupFingerprint) {
    return { action: "skip", reason: "not_false_paid", label };
  }

  const originalEventId = nullRefPaid?.id ?? paidEvents[0]?.id ?? null;

  // 1) A genuine verified payment exists for this purchase: reattribute.
  const successfulAttempt = attempts.find((a) => a.status === "successful" && a.reference);
  if (successfulAttempt) {
    return {
      action: "reattribute",
      label,
      originalEventId,
      reference: successfulAttempt.reference,
      source: "attempt",
    };
  }
  if (ownership?.transactionReference) {
    return {
      action: "reattribute",
      label,
      originalEventId,
      reference: ownership.transactionReference,
      source: "transaction",
    };
  }

  // 2) No genuine payment: re-derive the status from verified attempt rows.
  const verifiedTerminal = attempts
    .filter((a) => a.paystack_status && TERMINAL_ATTEMPT_STATUSES.has(a.status))
    .sort((a, b) => String(b.last_verified_at ?? "").localeCompare(String(a.last_verified_at ?? "")));
  const derived = verifiedTerminal[0];
  if (!derived) {
    return {
      action: "quarantine",
      label,
      originalEventId,
      reason: "no_verified_terminal_attempt",
      appendEvent: !events.some((e) => e.kind === "correction_review_pending"),
    };
  }

  // 3) Confirmed false-paid: correct it, preserving the ownership association.
  return {
    action: "correct_false_paid",
    label,
    originalEventId,
    derivedStatus: derived.status,
    paystackStatus: derived.paystack_status,
    associationMatch: ownership?.matched ?? null,
    closeAlreadyOwned: Boolean(ownership?.matched),
  };
}

/* ------------------------------------------------------------------------ */
/* Production runner (only when executed directly)                           */
/* ------------------------------------------------------------------------ */

const PRODUCT_COLUMNS = {
  course: "course_id",
  offer: "offer_id",
  bundle: "bundle_id",
  certificate: "learning_path_id",
  digital_product: "digital_product_id",
};

async function loadOwnership(client, group) {
  const email = String(group.customer_email).toLowerCase();
  const column = PRODUCT_COLUMNS[group.product_type];
  let transactionReference = null;
  let matched = null;

  if (column) {
    const { rows } = await client.query(
      `select reference from public.transactions
        where ${column} = $1 and status = 'success'
          and ($2::uuid is not null and student_id = $2
               or paystack_data ->> 'checkout_email' = $3)
        order by created_at asc limit 1`,
      [group.product_id, group.student_id ?? null, email],
    );
    if (rows.length) {
      transactionReference = rows[0].reference ?? null;
      matched = "transaction";
    }
  }

  if (!matched) {
    let studentId = group.student_id ?? null;
    if (!studentId) {
      const { rows } = await client.query(
        `select id from public.profiles where lower(email) = $1 limit 1`,
        [email],
      );
      studentId = rows[0]?.id ?? null;
    }
    if (studentId && group.course_id) {
      const { rows } = await client.query(
        `select id from public.enrollments where student_id = $1 and course_id = $2 limit 1`,
        [studentId, group.course_id],
      );
      if (rows.length) matched = "enrollment";
    }
    if (!matched && studentId && group.product_type === "certificate") {
      const { rows } = await client.query(
        `select id from public.certificates
          where student_id = $1 and learning_path_id = $2 and is_valid = true limit 1`,
        [studentId, group.product_id],
      );
      if (rows.length) matched = "enrollment";
    }
  }

  return { matched, transactionReference };
}

async function applyPlan(client, group, plan) {
  await client.query("begin");
  try {
    if (plan.action === "reattribute") {
      await client.query(
        `update public.payment_recovery_groups
            set recovered_reference = $2, updated_at = now()
          where id = $1`,
        [group.id, plan.reference],
      );
      await client.query(
        `insert into public.payment_recovery_events (group_id, kind, detail)
         values ($1, 'correction_reattributed', $2)`,
        [group.id, JSON.stringify({
          original_event_id: plan.originalEventId,
          verified_reference: plan.reference,
          source: plan.source,
        })],
      );
    } else if (plan.action === "correct_false_paid") {
      await client.query(
        `update public.payment_recovery_groups
            set payment_status = $2,
                recovery_status = 'cancelled',
                is_open = false,
                next_message_at = null,
                recovered_at = null,
                recovered_via = null,
                recovered_reference = null,
                recovered_amount_kobo = null,
                recovered_after_step = null,
                closed_at = coalesce(closed_at, now()),
                updated_at = now()
          where id = $1`,
        [group.id, plan.derivedStatus],
      );
      await client.query(
        `insert into public.payment_recovery_events (group_id, kind, detail)
         values ($1, 'correction_false_paid', $2)`,
        [group.id, JSON.stringify({
          original_event_id: plan.originalEventId,
          reason: "association_close_recorded_as_payment",
          paystack_status: plan.paystackStatus,
          derived_status: plan.derivedStatus,
          association_match: plan.associationMatch,
        })],
      );
      if (plan.closeAlreadyOwned) {
        await client.query(
          `insert into public.payment_recovery_events (group_id, kind, detail)
           values ($1, 'closed_already_owned', $2)`,
          [group.id, JSON.stringify({
            via: "association",
            matched: plan.associationMatch,
            via_correction: true,
            original_event_id: plan.originalEventId,
          })],
        );
      }
    } else if (plan.action === "quarantine" && plan.appendEvent) {
      await client.query(
        `insert into public.payment_recovery_events (group_id, kind, detail)
         values ($1, 'correction_review_pending', $2)`,
        [group.id, JSON.stringify({
          original_event_id: plan.originalEventId,
          reason: plan.reason,
        })],
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("[correct-false-paid] DATABASE_URL is not set");
    process.exit(2);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows: groups } = await client.query(`
      select * from public.payment_recovery_groups
       where id in (
         select e.group_id from public.payment_recovery_events e
          where e.kind in ('paid', 'recovered')
            and coalesce(e.detail ->> 'reference', '') = ''
         union
         select id from public.payment_recovery_groups
          where payment_status = 'successful'
            and recovered_via = 'paystack'
            and coalesce(recovered_reference, '') = ''
       )
       order by created_at asc`);

    console.log(`[correct-false-paid] mode: ${apply ? "APPLY" : "DRY RUN (no changes will be written)"}`);
    console.log(`[correct-false-paid] candidate groups matching the false-paid fingerprint: ${groups.length}`);

    const totals = { reattribute: 0, correct_false_paid: 0, quarantine: 0, skip: 0 };
    for (const group of groups) {
      const [{ rows: attempts }, { rows: events }] = await Promise.all([
        client.query(
          `select reference, status, paystack_status, last_verified_at
             from public.payment_recovery_attempts where group_id = $1 order by created_at asc`,
          [group.id],
        ),
        client.query(
          `select id, kind, detail, created_at from public.payment_recovery_events
            where group_id = $1 order by created_at asc`,
          [group.id],
        ),
      ]);
      const ownership = await loadOwnership(client, group);
      const plan = planCorrection({ group, attempts, events, ownership });
      totals[plan.action] = (totals[plan.action] ?? 0) + 1;

      const before = `${group.payment_status}/${group.recovery_status} recovered_ref=${group.recovered_reference ?? "null"}`;
      let after = before;
      if (plan.action === "reattribute") after = `${group.payment_status}/${group.recovery_status} recovered_ref=${plan.reference} (source: ${plan.source})`;
      if (plan.action === "correct_false_paid") after = `${plan.derivedStatus}/cancelled recovered_ref=null${plan.closeAlreadyOwned ? ` + closed_already_owned (${plan.associationMatch})` : ""}`;
      if (plan.action === "quarantine") after = `${before} [QUARANTINED: ${plan.reason}]`;
      if (plan.action === "skip") after = `${before} [skipped: ${plan.reason}]`;
      console.log(`- ${plan.label} <${maskEmail(group.customer_email)}> action=${plan.action}\n    before: ${before}\n    after:  ${after}`);

      if (apply && plan.action !== "skip") await applyPlan(client, group, plan);
    }

    console.log(
      `[correct-false-paid] totals: reattribute=${totals.reattribute} correct_false_paid=${totals.correct_false_paid} quarantine=${totals.quarantine} skip=${totals.skip}`,
    );
    if (!apply) console.log("[correct-false-paid] DRY RUN complete. Re-run with --apply to write these corrections.");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
