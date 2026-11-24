/**
 * Payment recovery engine. No framework imports: every side effect is injected
 * through RecoveryDeps, so the same code runs in production and in tests.
 *
 * Grouping: one open group per (lowercased customer email, course). Every Paystack
 * reference for that order is an attempt in the group. A verified payment on any
 * attempt, or a confirmed bank transfer, closes the whole group and stops all email.
 */
import { RECOVERY_SEQUENCE, clampToSendWindow, type RecoveryConfig } from "./config";
import {
  classifyVerification,
  pendingRecheckMs,
  verifyBackoffMs,
  UNRESOLVED_ATTEMPT,
  type VerifyOutcome,
} from "./status";
import { firstNameFrom, renderRecoveryEmail, type RecoveryStep } from "./templates";

export type Db = { from(table: string): any };

export type Group = {
  id: string;
  customer_email: string;
  customer_name: string | null;
  customer_phone: string | null;
  student_id: string | null;
  course_id: string | null;
  product_title: string;
  amount_kobo: number;
  currency: string;
  payment_status: string;
  recovery_status: string;
  is_open: boolean;
  source: string;
  failure_reason: string | null;
  bank_reference: string;
  retry_token: string;
  first_attempt_at: string;
  failed_at: string | null;
  abandoned_at: string | null;
  next_message_at: string | null;
  initial_sent_at: string | null;
  last_email_at: string | null;
  last_email_step: string | null;
  emails_sent: number;
};

export type Attempt = {
  id: string;
  group_id: string;
  reference: string;
  source: string;
  status: string;
  amount_kobo: number;
  verify_count: number;
  verify_failures: number;
  created_at: string;
  next_verify_at: string;
};

export type SendResult = { messageId?: string; error?: string; skipped?: boolean };

export type RecoveryDeps = {
  now: () => number;
  config: RecoveryConfig;
  siteUrl: string;
  randomToken: (bytes: number) => string;
  newReference: () => string;
  verify: (reference: string) => Promise<VerifyOutcome>;
  /** Existing successful-payment flow (lib/guest-checkout completePaidCheckout). Idempotent. */
  completePaidCheckout: (reference: string) => Promise<{ ok: boolean; error?: string }>;
  /** True when this customer already paid for this course outside the group (other checkout, enrolment). */
  isAlreadyPaid: (group: Group) => Promise<boolean>;
  sendEmail: (params: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
    tags: Array<{ name: string; value: string }>;
  }) => Promise<SendResult>;
  /** Current product data from trusted server-side tables. */
  loadProduct: (courseId: string) => Promise<{ title: string; priceKobo: number; available: boolean } | null>;
  /** Inserts the pending transactions row for a retry, same shape as normal checkout. */
  createPendingTransaction: (params: { reference: string; group: Group; amountKobo: number }) => Promise<void>;
  initializePaystack: (params: {
    reference: string;
    group: Group;
    amountKobo: number;
  }) => Promise<{ authorizationUrl: string }>;
  /** Existing enrolment path for a confirmed bank transfer. Idempotent on the bank reference. */
  fulfilBankTransfer: (group: Group) => Promise<{ ok: boolean; error?: string }>;
};

const PAID_STATUSES = new Set(["successful", "bank_transfer_confirmed"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function iso(ms: number) {
  return new Date(ms).toISOString();
}

export function isValidRecoveryEmail(email: string | null | undefined) {
  return Boolean(email && email.length <= 254 && EMAIL_RE.test(email));
}

function isDuplicate(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "23505" || /duplicate/i.test(error.message ?? "");
}

async function event(db: Db, groupId: string, kind: string, detail: Record<string, unknown> = {}, actorId?: string | null) {
  await db.from("payment_recovery_events").insert({
    group_id: groupId,
    kind,
    detail,
    actor_id: actorId ?? null,
  });
}

async function loadGroup(db: Db, id: string): Promise<Group | null> {
  const { data } = await db.from("payment_recovery_groups").select("*").eq("id", id).maybeSingle();
  return (data as Group | null) ?? null;
}

async function updateGroup(db: Db, id: string, patch: Record<string, unknown>, now: number) {
  await db
    .from("payment_recovery_groups")
    .update({ ...patch, updated_at: iso(now) })
    .eq("id", id);
}

export function generateBankReference(randomToken: (bytes: number) => string) {
  return `DSX-REC-${randomToken(3).toUpperCase()}`;
}

/* ------------------------------------------------------------------------ */
/* Capture                                                                   */
/* ------------------------------------------------------------------------ */

export async function registerCheckoutAttempt(
  db: Db,
  deps: RecoveryDeps,
  input: {
    reference: string;
    email: string;
    fullName?: string | null;
    phone?: string | null;
    studentId?: string | null;
    courseId: string;
    productTitle: string;
    amountKobo: number;
    currency?: string;
    source?: "checkout" | "retry" | "historical";
    groupId?: string;
  },
): Promise<{ ok: boolean; groupId?: string; reason?: string }> {
  const now = deps.now();
  const email = input.email.trim().toLowerCase();
  if (!isValidRecoveryEmail(email)) return { ok: false, reason: "invalid_email" };
  if (!(input.amountKobo > 0)) return { ok: false, reason: "invalid_amount" };

  let group: Group | null = null;
  if (input.groupId) {
    group = await loadGroup(db, input.groupId);
  } else {
    const found = await db
      .from("payment_recovery_groups")
      .select("*")
      .eq("customer_email", email)
      .eq("course_id", input.courseId)
      .eq("is_open", true)
      .maybeSingle();
    group = (found.data as Group | null) ?? null;
  }

  if (!group) {
    for (let i = 0; i < 3 && !group; i++) {
      const insert = await db
        .from("payment_recovery_groups")
        .insert({
          customer_email: email,
          customer_name: input.fullName?.trim() || null,
          customer_phone: input.phone?.trim() || null,
          student_id: input.studentId ?? null,
          course_id: input.courseId,
          product_title: input.productTitle,
          amount_kobo: input.amountKobo,
          currency: input.currency ?? "NGN",
          payment_status: "awaiting_payment",
          source: input.source === "historical" ? "historical" : "checkout",
          bank_reference: generateBankReference(deps.randomToken),
          retry_token: deps.randomToken(24),
          first_attempt_at: iso(now),
        })
        .select("*")
        .maybeSingle();
      if (!insert.error && insert.data) {
        group = insert.data as Group;
        await event(db, group.id, "group_created", { reference: input.reference, source: input.source ?? "checkout" });
        break;
      }
      if (!isDuplicate(insert.error)) return { ok: false, reason: insert.error?.message ?? "insert_failed" };
      // Lost a race on the open-group index or a reference collision: read the winner.
      const again = await db
        .from("payment_recovery_groups")
        .select("*")
        .eq("customer_email", email)
        .eq("course_id", input.courseId)
        .eq("is_open", true)
        .maybeSingle();
      group = (again.data as Group | null) ?? null;
    }
    if (!group) return { ok: false, reason: "group_unavailable" };
  } else {
    await updateGroup(
      db,
      group.id,
      {
        customer_name: group.customer_name ?? (input.fullName?.trim() || null),
        customer_phone: group.customer_phone ?? (input.phone?.trim() || null),
        student_id: group.student_id ?? input.studentId ?? null,
        product_title: input.productTitle,
        amount_kobo: input.amountKobo,
        payment_status: PAID_STATUSES.has(group.payment_status) ? group.payment_status : "awaiting_payment",
      },
      now,
    );
  }

  const firstVerify = now + Math.min(deps.config.failedDelayMs, deps.config.abandonedDelayMs);
  const attempt = await db.from("payment_recovery_attempts").insert({
    group_id: group.id,
    reference: input.reference,
    source: input.source ?? "checkout",
    status: "awaiting_payment",
    amount_kobo: input.amountKobo,
    next_verify_at: iso(input.source === "historical" ? now : firstVerify),
  });
  if (attempt.error && !isDuplicate(attempt.error)) {
    return { ok: false, groupId: group.id, reason: attempt.error.message };
  }
  await event(db, group.id, "attempt_created", { reference: input.reference, source: input.source ?? "checkout" });
  return { ok: true, groupId: group.id };
}

/** Webhook hint (charge.failed etc.): verify this reference on the next run. Never trusted alone. */
export async function nudgeVerification(db: Db, deps: RecoveryDeps, reference: string) {
  await db
    .from("payment_recovery_attempts")
    .update({ next_verify_at: iso(deps.now()) })
    .eq("reference", reference)
    .in("status", UNRESOLVED_ATTEMPT as unknown as string[]);
}

/* ------------------------------------------------------------------------ */
/* Paid: close the whole group                                               */
/* ------------------------------------------------------------------------ */

export async function markGroupPaid(
  db: Db,
  deps: RecoveryDeps,
  groupId: string,
  params: { via: "paystack" | "bank_transfer"; reference: string | null; amountKobo: number; actorId?: string | null },
) {
  const now = deps.now();
  const group = await loadGroup(db, groupId);
  if (!group || !group.is_open) return { changed: false };
  const recovered = group.emails_sent > 0;
  const result = await db
    .from("payment_recovery_groups")
    .update({
      is_open: false,
      payment_status: params.via === "bank_transfer" ? "bank_transfer_confirmed" : "successful",
      recovery_status: recovered ? "recovered" : "cancelled",
      recovered_at: iso(now),
      recovered_via: params.via,
      recovered_reference: params.reference,
      recovered_amount_kobo: params.amountKobo,
      recovered_after_step: recovered ? group.last_email_step : null,
      payment_method: params.via === "bank_transfer" ? "bank_transfer" : "paystack",
      next_message_at: null,
      closed_at: iso(now),
      updated_at: iso(now),
    })
    .eq("id", groupId)
    .eq("is_open", true)
    .select("id");
  const changed = (result.data?.length ?? 0) > 0;
  if (changed) {
    await event(db, groupId, recovered ? "recovered" : "paid", {
      via: params.via,
      reference: params.reference,
      amount_kobo: params.amountKobo,
    }, params.actorId);
  }
  return { changed };
}

/** Called after the existing success flow fulfils a reference (webhook or reconcile). */
export async function markPaidByReference(
  db: Db,
  deps: RecoveryDeps,
  reference: string,
  fallback?: { email: string | null; courseId: string | null; amountKobo: number },
) {
  const { data: attempt } = await db
    .from("payment_recovery_attempts")
    .select("id, group_id, amount_kobo")
    .eq("reference", reference)
    .maybeSingle();
  if (attempt) {
    await db
      .from("payment_recovery_attempts")
      .update({ status: "successful", paystack_status: "success", updated_at: iso(deps.now()) })
      .eq("id", attempt.id);
    return markGroupPaid(db, deps, attempt.group_id, {
      via: "paystack",
      reference,
      amountKobo: attempt.amount_kobo,
    });
  }
  if (fallback?.email && fallback.courseId) {
    const { data: group } = await db
      .from("payment_recovery_groups")
      .select("id")
      .eq("customer_email", fallback.email.trim().toLowerCase())
      .eq("course_id", fallback.courseId)
      .eq("is_open", true)
      .maybeSingle();
    if (group) {
      return markGroupPaid(db, deps, group.id, { via: "paystack", reference, amountKobo: fallback.amountKobo });
    }
  }
  return { changed: false };
}

/* ------------------------------------------------------------------------ */
/* Reconciliation                                                            */
/* ------------------------------------------------------------------------ */

async function afterTerminal(db: Db, deps: RecoveryDeps, groupId: string, kind: "failed" | "abandoned", reason: string) {
  const now = deps.now();
  const group = await loadGroup(db, groupId);
  if (!group || !group.is_open || PAID_STATUSES.has(group.payment_status)) return;
  if (group.payment_status === "bank_transfer_pending") return;

  const patch: Record<string, unknown> = {
    payment_status: kind,
    failure_reason: reason,
  };
  if (kind === "failed") patch.failed_at = group.failed_at ?? iso(now);
  else patch.abandoned_at = group.abandoned_at ?? iso(now);

  if (group.recovery_status === "none") {
    if (!isValidRecoveryEmail(group.customer_email)) {
      patch.recovery_status = "no_email";
    } else {
      const due =
        kind === "failed"
          ? now + deps.config.failedDelayMs
          : Math.max(Date.parse(group.first_attempt_at) + deps.config.abandonedDelayMs, now);
      patch.recovery_status = "scheduled";
      patch.next_message_at = iso(clampToSendWindow(due, deps.config.sendWindow));
    }
  }
  await updateGroup(db, groupId, patch, now);
  await event(db, groupId, kind, { reason });
}

export async function reconcileAttempts(db: Db, deps: RecoveryDeps, limit?: number) {
  const now = deps.now();
  const max = limit ?? deps.config.batchLimit;
  const { data, error } = await db
    .from("payment_recovery_attempts")
    .select("*")
    .in("status", UNRESOLVED_ATTEMPT as unknown as string[])
    .lte("next_verify_at", iso(now))
    .order("next_verify_at", { ascending: true })
    .limit(max);
  if (error) return { ok: false as const, error: error.message };

  const summary = { checked: 0, successful: 0, failed: 0, abandoned: 0, reversed: 0, pending: 0, unreachable: 0, expired: 0, mismatch: 0 };
  for (const attempt of (data ?? []) as Attempt[]) {
    summary.checked += 1;
    const group = await loadGroup(db, attempt.group_id);
    if (!group) continue;
    const ageMs = now - Date.parse(attempt.created_at);

    if (ageMs > deps.config.verifyMaxAgeMs) {
      await db.from("payment_recovery_attempts").update({ status: "expired", updated_at: iso(now) }).eq("id", attempt.id);
      summary.expired += 1;
      continue;
    }

    const outcome = await deps.verify(attempt.reference);
    const base = {
      verify_count: attempt.verify_count + 1,
      last_verified_at: iso(now),
      updated_at: iso(now),
      paystack_status: outcome.kind === "ok" ? outcome.status : outcome.kind,
      ...(outcome.kind === "ok"
        ? { gateway_response: outcome.gatewayResponse ?? null, channel: outcome.channel ?? null }
        : {}),
    };
    const c = classifyVerification({
      outcome,
      ageMs,
      abandonAfterMs: deps.config.abandonedDelayMs,
      expectedAmountKobo: attempt.amount_kobo,
      expectedCurrency: group.currency,
    });

    if (c.next === "successful") {
      const done = await deps.completePaidCheckout(attempt.reference);
      if (done.ok) {
        await db.from("payment_recovery_attempts").update({ ...base, status: "successful" }).eq("id", attempt.id);
        await markGroupPaid(db, deps, group.id, { via: "paystack", reference: attempt.reference, amountKobo: attempt.amount_kobo });
        summary.successful += 1;
      } else {
        // Paid but fulfilment did not finish: keep checking, never email.
        await db
          .from("payment_recovery_attempts")
          .update({ ...base, status: "processing", next_verify_at: iso(now + deps.config.verifyIntervalMs) })
          .eq("id", attempt.id);
        await event(db, group.id, "fulfilment_retry", { reference: attempt.reference, error: done.error ?? null });
        summary.pending += 1;
      }
      continue;
    }
    if (c.next === "amount_mismatch") {
      await db
        .from("payment_recovery_attempts")
        .update({ ...base, status: "processing", gateway_response: "amount_mismatch", next_verify_at: iso(now + 6 * 3_600_000) })
        .eq("id", attempt.id);
      await event(db, group.id, "amount_mismatch", { reference: attempt.reference });
      summary.mismatch += 1;
      continue;
    }
    if (c.next === "failed" || c.next === "abandoned") {
      await db.from("payment_recovery_attempts").update({ ...base, status: c.next }).eq("id", attempt.id);
      await afterTerminal(db, deps, group.id, c.next, c.reason);
      summary[c.next] += 1;
      continue;
    }
    if (c.next === "reversed") {
      await db.from("payment_recovery_attempts").update({ ...base, status: "reversed" }).eq("id", attempt.id);
      if (group.is_open && !PAID_STATUSES.has(group.payment_status)) {
        await updateGroup(db, group.id, { payment_status: "reversed", recovery_status: "cancelled", next_message_at: null }, now);
      }
      await event(db, group.id, "reversed", { reference: attempt.reference });
      summary.reversed += 1;
      continue;
    }
    // keep
    const failures = c.transient ? attempt.verify_failures + 1 : 0;
    const wait = c.transient
      ? verifyBackoffMs(failures, deps.config.verifyIntervalMs)
      : pendingRecheckMs(ageMs, deps.config.verifyIntervalMs);
    await db
      .from("payment_recovery_attempts")
      .update({ ...base, status: c.status, verify_failures: failures, next_verify_at: iso(now + wait) })
      .eq("id", attempt.id);
    if (c.transient) summary.unreachable += 1;
    else summary.pending += 1;
  }
  return { ok: true as const, ...summary };
}

/* ------------------------------------------------------------------------ */
/* Email sequence                                                            */
/* ------------------------------------------------------------------------ */

function sequenceIndex(step: string | null | undefined) {
  if (!step || step === "manual") return step === "manual" ? 0 : -1;
  if (step === "final_48h") return 4; // legacy three-email sequence
  return RECOVERY_SEQUENCE.findIndex((s) => s.step === step);
}

/** Next email in the seven-email sequence, or null after the last one. */
function nextStep(group: Group, _cfg: RecoveryConfig): RecoveryStep | null {
  if (!group.initial_sent_at) return "initial";
  const idx = sequenceIndex(group.last_email_step);
  const next = RECOVERY_SEQUENCE[Math.max(idx, 0) + 1];
  return next ? next.step : null;
}

/**
 * When the email after `step` is due: offset from the first email, never sooner
 * than minGap after now, and always inside the Lagos sending window.
 */
function scheduleAfter(step: RecoveryStep, initialSentMs: number, sentMs: number, cfg: RecoveryConfig) {
  const idx = Math.max(sequenceIndex(step), 0);
  const nextOffset = cfg.sequenceOffsetsMs[idx + 1];
  if (nextOffset === undefined) return null;
  const due = Math.max(initialSentMs + nextOffset, sentMs + cfg.minGapMs);
  return clampToSendWindow(due, cfg.sendWindow);
}

async function isSuppressed(db: Db, email: string) {
  const { data } = await db
    .from("payment_recovery_suppressions")
    .select("reason")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return (data?.reason as string | undefined) ?? null;
}

async function hasActiveAttempt(db: Db, groupId: string, now: number) {
  const { data } = await db
    .from("payment_recovery_attempts")
    .select("id, created_at")
    .eq("group_id", groupId)
    .in("status", UNRESOLVED_ATTEMPT as unknown as string[]);
  return ((data ?? []) as Array<{ created_at: string }>).some(
    (a) => now - Date.parse(a.created_at) < 2 * 3_600_000,
  );
}

async function hasSuccessfulAttempt(db: Db, groupId: string) {
  const { data } = await db
    .from("payment_recovery_attempts")
    .select("reference, amount_kobo")
    .eq("group_id", groupId)
    .eq("status", "successful")
    .limit(1);
  return ((data ?? []) as Array<{ reference: string; amount_kobo: number }>)[0] ?? null;
}

export function recoveryLinks(siteUrl: string, token: string) {
  const base = siteUrl.replace(/\/$/, "");
  return {
    retryUrl: `${base}/api/payment-recovery/retry?t=${encodeURIComponent(token)}`,
    optOutUrl: `${base}/api/payment-recovery/opt-out?t=${encodeURIComponent(token)}`,
  };
}

async function claimMessage(db: Db, groupId: string, step: RecoveryStep, manualSeq: number, toEmail: string, actorId?: string | null) {
  const insert = await db
    .from("payment_recovery_messages")
    .insert({ group_id: groupId, step, manual_seq: manualSeq, to_email: toEmail, status: "sending", created_by: actorId ?? null })
    .select("id, retry_count")
    .maybeSingle();
  if (!insert.error && insert.data) return { id: insert.data.id as string, retry: 0 };
  if (!isDuplicate(insert.error)) return null;
  const { data: existing } = await db
    .from("payment_recovery_messages")
    .select("id, status, retry_count")
    .eq("group_id", groupId)
    .eq("step", step)
    .eq("manual_seq", manualSeq)
    .maybeSingle();
  if (!existing || existing.status !== "failed" || existing.retry_count >= 3) return null;
  const cas = await db
    .from("payment_recovery_messages")
    .update({ status: "sending", retry_count: existing.retry_count + 1 })
    .eq("id", existing.id)
    .eq("status", "failed")
    .eq("retry_count", existing.retry_count)
    .select("id");
  return (cas.data?.length ?? 0) === 1 ? { id: existing.id as string, retry: existing.retry_count + 1 } : null;
}

async function loadProductSummary(db: Db, courseId: string | null) {
  if (!courseId) return null;
  const { data } = await db.from("courses").select("description").eq("id", courseId).maybeSingle();
  const text = (data?.description as string | null | undefined) ?? null;
  return text && text.trim() ? text : null;
}

async function deliver(
  db: Db,
  deps: RecoveryDeps,
  group: Group,
  step: RecoveryStep,
  manualSeq: number,
  actorId?: string | null,
): Promise<"sent" | "failed" | "skipped"> {
  const now = deps.now();
  const claim = await claimMessage(db, group.id, step, manualSeq, group.customer_email, actorId);
  if (!claim) return "skipped";

  const links = recoveryLinks(deps.siteUrl, group.retry_token);
  const email = renderRecoveryEmail({
    step,
    firstName: firstNameFrom(group.customer_name),
    productTitle: group.product_title,
    amountKobo: group.amount_kobo,
    bankReference: group.bank_reference,
    retryUrl: links.retryUrl,
    optOutUrl: links.optOutUrl,
    reason: group.failed_at ? "failed" : "abandoned",
    productSummary: await loadProductSummary(db, group.course_id),
  });
  const result = await deps.sendEmail({
    to: group.customer_email,
    subject: email.subject,
    html: email.html,
    idempotencyKey: `payment-recovery/${group.id}/${step}/${manualSeq}`,
    tags: [
      { name: "category", value: "payment_recovery" },
      { name: "step", value: step },
    ],
  });

  if (result.messageId) {
    await db
      .from("payment_recovery_messages")
      .update({ status: "sent", resend_id: result.messageId, sent_at: iso(now), error: null, updated_at: iso(now) })
      .eq("id", claim.id);
    const initialMs = group.initial_sent_at ? Date.parse(group.initial_sent_at) : now;
    const next = step === "manual" && group.initial_sent_at ? group.next_message_at : (() => {
      const at = scheduleAfter(step, initialMs, now, deps.config);
      return at === null ? null : iso(Math.max(at, now));
    })();
    const finished = step === "final_120h" || (step !== "manual" && next === null);
    await updateGroup(
      db,
      group.id,
      {
        emails_sent: group.emails_sent + 1,
        last_email_at: iso(now),
        last_email_step: step === "manual" && group.last_email_step ? group.last_email_step : step,
        last_email_status: "sent",
        initial_sent_at: group.initial_sent_at ?? iso(now),
        recovery_status: finished ? "completed" : "in_progress",
        next_message_at: finished ? iso(now + deps.config.expireAfterFinalMs) : next,
      },
      now,
    );
    await event(db, group.id, "email_sent", { step, resend_id: result.messageId }, actorId);
    return "sent";
  }

  const status = result.skipped ? "suppressed" : "failed";
  await db
    .from("payment_recovery_messages")
    .update({ status, error: (result.error ?? "send_failed").slice(0, 500), updated_at: iso(now) })
    .eq("id", claim.id);
  await updateGroup(db, group.id, { last_email_status: status, next_message_at: iso(now + 30 * 60_000) }, now);
  await event(db, group.id, "email_failed", { step, error: (result.error ?? "send_failed").slice(0, 200) }, actorId);
  return "failed";
}

export async function processDueMessages(db: Db, deps: RecoveryDeps, limit?: number) {
  const now = deps.now();
  const { data, error } = await db
    .from("payment_recovery_groups")
    .select("*")
    .eq("is_open", true)
    .in("recovery_status", ["scheduled", "in_progress", "completed"])
    .lte("next_message_at", iso(now))
    .order("next_message_at", { ascending: true })
    .limit(limit ?? deps.config.batchLimit);
  if (error) return { ok: false as const, error: error.message };

  const summary = { due: 0, sent: 0, failed: 0, closedPaid: 0, postponed: 0, suppressed: 0, expired: 0 };
  for (const group of (data ?? []) as Group[]) {
    summary.due += 1;

    // Paid already? Close the group, never email.
    const success = await hasSuccessfulAttempt(db, group.id);
    if (success || (await deps.isAlreadyPaid(group))) {
      await markGroupPaid(db, deps, group.id, {
        via: "paystack",
        reference: success?.reference ?? null,
        amountKobo: success?.amount_kobo ?? group.amount_kobo,
      });
      summary.closedPaid += 1;
      continue;
    }

    if (group.recovery_status === "completed") {
      await updateGroup(db, group.id, { is_open: false, payment_status: "expired", closed_at: iso(now), next_message_at: null }, now);
      await event(db, group.id, "expired");
      summary.expired += 1;
      continue;
    }

    if (!["failed", "abandoned"].includes(group.payment_status)) {
      // pending, processing, awaiting_payment, bank_transfer_pending, reversed: no failure email.
      const pause = group.payment_status === "bank_transfer_pending" || group.payment_status === "reversed";
      await updateGroup(db, group.id, { next_message_at: pause ? null : iso(now + 15 * 60_000) }, now);
      summary.postponed += 1;
      continue;
    }
    if (await hasActiveAttempt(db, group.id, now)) {
      await updateGroup(db, group.id, { next_message_at: iso(now + 15 * 60_000) }, now);
      summary.postponed += 1;
      continue;
    }

    const suppressed = await isSuppressed(db, group.customer_email);
    if (suppressed || !isValidRecoveryEmail(group.customer_email)) {
      await updateGroup(
        db,
        group.id,
        {
          recovery_status: suppressed === "opt_out" ? "opted_out" : suppressed ? "suppressed" : "no_email",
          next_message_at: null,
        },
        now,
      );
      summary.suppressed += 1;
      continue;
    }

    const windowAt = clampToSendWindow(now, deps.config.sendWindow);
    if (windowAt > now) {
      await updateGroup(db, group.id, { next_message_at: iso(windowAt) }, now);
      summary.postponed += 1;
      continue;
    }

    const step = nextStep(group, deps.config);
    if (!step) {
      await updateGroup(db, group.id, { recovery_status: "completed", next_message_at: iso(now + deps.config.expireAfterFinalMs) }, now);
      continue;
    }
    const outcome = await deliver(db, deps, group, step, 0);
    if (outcome === "sent") summary.sent += 1;
    else if (outcome === "failed") summary.failed += 1;
  }
  return { ok: true as const, ...summary };
}

/* ------------------------------------------------------------------------ */
/* Customer links                                                            */
/* ------------------------------------------------------------------------ */

export type RetryResult =
  | { kind: "redirect"; url: string }
  | { kind: "already_paid"; courseId: string | null }
  | { kind: "error"; code: "not_found" | "unavailable" | "init_failed" | "closed" };

export async function createRetryCheckout(db: Db, deps: RecoveryDeps, token: string): Promise<RetryResult> {
  const now = deps.now();
  if (!token || token.length < 16) return { kind: "error", code: "not_found" };
  const { data } = await db.from("payment_recovery_groups").select("*").eq("retry_token", token).maybeSingle();
  const group = data as Group | null;
  if (!group) return { kind: "error", code: "not_found" };
  if (PAID_STATUSES.has(group.payment_status)) return { kind: "already_paid", courseId: group.course_id };
  if (!group.is_open) return { kind: "error", code: "closed" };
  if (await deps.isAlreadyPaid(group)) {
    await markGroupPaid(db, deps, group.id, { via: "paystack", reference: null, amountKobo: group.amount_kobo });
    return { kind: "already_paid", courseId: group.course_id };
  }
  if (!group.course_id) return { kind: "error", code: "unavailable" };
  const product = await deps.loadProduct(group.course_id);
  if (!product || !product.available || !(product.priceKobo > 0)) return { kind: "error", code: "unavailable" };

  const reference = deps.newReference();
  const fresh: Group = { ...group, product_title: product.title, amount_kobo: product.priceKobo };
  try {
    await deps.createPendingTransaction({ reference, group: fresh, amountKobo: product.priceKobo });
  } catch {
    return { kind: "error", code: "init_failed" };
  }
  await registerCheckoutAttempt(db, deps, {
    reference,
    email: group.customer_email,
    courseId: group.course_id,
    productTitle: product.title,
    amountKobo: product.priceKobo,
    currency: group.currency,
    source: "retry",
    groupId: group.id,
  });
  await event(db, group.id, "retry_started", { reference });
  try {
    const init = await deps.initializePaystack({ reference, group: fresh, amountKobo: product.priceKobo });
    return { kind: "redirect", url: init.authorizationUrl };
  } catch (err) {
    await db
      .from("payment_recovery_attempts")
      .update({ status: "expired", gateway_response: "initialize_failed", updated_at: iso(now) })
      .eq("reference", reference);
    await event(db, group.id, "retry_failed", { reference, error: err instanceof Error ? err.message.slice(0, 200) : "error" });
    return { kind: "error", code: "init_failed" };
  }
}

export async function optOut(db: Db, deps: RecoveryDeps, token: string) {
  const now = deps.now();
  if (!token || token.length < 16) return { ok: false };
  const { data } = await db.from("payment_recovery_groups").select("*").eq("retry_token", token).maybeSingle();
  const group = data as Group | null;
  if (!group) return { ok: false };
  const ins = await db
    .from("payment_recovery_suppressions")
    .insert({ email: group.customer_email, reason: "opt_out", detail: `group ${group.id}` });
  void ins;
  if (group.is_open && !PAID_STATUSES.has(group.payment_status)) {
    await updateGroup(db, group.id, { recovery_status: "opted_out", next_message_at: null }, now);
  }
  await event(db, group.id, "opted_out");
  return { ok: true };
}

/* ------------------------------------------------------------------------ */
/* Resend delivery events                                                    */
/* ------------------------------------------------------------------------ */

const STATUS_RANK: Record<string, number> = {
  sending: 0,
  sent: 1,
  delivery_delayed: 2,
  delivered: 3,
  failed: 4,
  suppressed: 4,
  bounced: 5,
  complained: 6,
};

export async function handleResendEvent(
  db: Db,
  deps: RecoveryDeps,
  evt: { type: string; created_at?: string; data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string } } },
) {
  const now = deps.now();
  const resendId = evt.data?.email_id;
  if (!resendId) return { handled: false };
  const map: Record<string, string> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delivery_delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.failed": "failed",
    "email.suppressed": "suppressed",
  };
  const status = map[evt.type];
  if (!status) return { handled: false };
  const { data: msg } = await db
    .from("payment_recovery_messages")
    .select("id, group_id, status, to_email")
    .eq("resend_id", resendId)
    .maybeSingle();
  if (!msg) return { handled: false };

  const patch: Record<string, unknown> = { last_event: evt.type, last_event_at: evt.created_at ?? iso(now), updated_at: iso(now) };
  if ((STATUS_RANK[status] ?? 0) >= (STATUS_RANK[msg.status] ?? 0)) patch.status = status;
  if (status === "bounced") {
    patch.bounce_type = evt.data?.bounce?.type ?? null;
    patch.error = evt.data?.bounce?.message?.slice(0, 300) ?? null;
  }
  await db.from("payment_recovery_messages").update(patch).eq("id", msg.id);

  const hard =
    status === "complained" ||
    status === "suppressed" ||
    (status === "bounced" && !/transient|temporary|soft/i.test(evt.data?.bounce?.type ?? ""));
  if (hard) {
    await db.from("payment_recovery_suppressions").insert({
      email: String(msg.to_email).toLowerCase(),
      reason: status === "complained" ? "complaint" : status === "suppressed" ? "resend_suppressed" : "hard_bounce",
      detail: evt.data?.bounce?.message?.slice(0, 300) ?? null,
    });
    await updateGroup(db, msg.group_id, { recovery_status: "suppressed", next_message_at: null, last_email_status: status }, now);
  } else {
    await updateGroup(db, msg.group_id, { last_email_status: status }, now);
  }
  await event(db, msg.group_id, `email_${status}`, { resend_id: resendId });
  return { handled: true, status };
}

/* ------------------------------------------------------------------------ */
/* Admin actions                                                             */
/* ------------------------------------------------------------------------ */

export async function markBankTransferClaimed(db: Db, deps: RecoveryDeps, groupId: string, actorId: string | null, note?: string) {
  const group = await loadGroup(db, groupId);
  if (!group || !group.is_open || PAID_STATUSES.has(group.payment_status)) return { ok: false, error: "Order is not open." };
  await updateGroup(db, groupId, { payment_status: "bank_transfer_pending", next_message_at: null }, deps.now());
  await event(db, groupId, "bank_transfer_claimed", { note: note ?? null }, actorId);
  return { ok: true };
}

export async function confirmBankTransfer(
  db: Db,
  deps: RecoveryDeps,
  params: { groupId: string; receivedKobo: number; bankTransactionRef: string; notes?: string; actorId: string | null },
): Promise<{ ok: boolean; status?: "confirmed" | "investigating" | "already"; error?: string }> {
  const group = await loadGroup(db, params.groupId);
  if (!group) return { ok: false, error: "Order not found." };
  if (PAID_STATUSES.has(group.payment_status) && !group.is_open) return { ok: false, status: "already", error: "This order is already paid." };
  const bankRef = params.bankTransactionRef.trim();
  if (bankRef.length < 3) return { ok: false, error: "Enter the bank transaction reference you checked." };
  if (!Number.isInteger(params.receivedKobo) || params.receivedKobo <= 0) return { ok: false, error: "Enter the amount received." };

  if (params.receivedKobo !== group.amount_kobo) {
    await db.from("payment_recovery_bank_confirmations").insert({
      group_id: group.id,
      bank_reference: group.bank_reference,
      expected_amount_kobo: group.amount_kobo,
      received_amount_kobo: params.receivedKobo,
      bank_transaction_ref: bankRef,
      status: "investigating",
      notes: params.notes ?? null,
      admin_id: params.actorId,
    });
    await updateGroup(db, group.id, { payment_status: "bank_transfer_pending", next_message_at: null }, deps.now());
    await event(db, group.id, "bank_transfer_amount_mismatch", {
      expected_kobo: group.amount_kobo,
      received_kobo: params.receivedKobo,
    }, params.actorId);
    return { ok: false, status: "investigating", error: "Amount does not match. The transfer stays under investigation." };
  }

  const ins = await db.from("payment_recovery_bank_confirmations").insert({
    group_id: group.id,
    bank_reference: group.bank_reference,
    expected_amount_kobo: group.amount_kobo,
    received_amount_kobo: params.receivedKobo,
    bank_transaction_ref: bankRef,
    status: "confirmed",
    notes: params.notes ?? null,
    admin_id: params.actorId,
  });
  if (ins.error && !isDuplicate(ins.error)) return { ok: false, error: ins.error.message };
  if (!ins.error) await event(db, group.id, "bank_transfer_confirmed", { bank_transaction_ref: bankRef }, params.actorId);

  // Fulfil through the existing enrolment path. Idempotent on the bank reference, so a
  // retry after a partial failure completes without a second enrolment.
  const fulfil = await deps.fulfilBankTransfer(group);
  if (!fulfil.ok) return { ok: false, error: fulfil.error ?? "Enrolment did not complete. Try again." };
  await markGroupPaid(db, deps, group.id, {
    via: "bank_transfer",
    reference: group.bank_reference,
    amountKobo: group.amount_kobo,
    actorId: params.actorId,
  });
  return { ok: true, status: "confirmed" };
}

export async function rejectBankTransfer(
  db: Db,
  deps: RecoveryDeps,
  params: { groupId: string; notes: string; actorId: string | null },
) {
  const now = deps.now();
  const group = await loadGroup(db, params.groupId);
  if (!group || !group.is_open || PAID_STATUSES.has(group.payment_status)) return { ok: false, error: "Order is not open." };
  await db.from("payment_recovery_bank_confirmations").insert({
    group_id: group.id,
    bank_reference: group.bank_reference,
    expected_amount_kobo: group.amount_kobo,
    received_amount_kobo: 0,
    bank_transaction_ref: "rejected",
    status: "rejected",
    notes: params.notes,
    admin_id: params.actorId,
  });
  const back = group.failed_at ? "failed" : "abandoned";
  const resume = ["scheduled", "in_progress"].includes(group.recovery_status) ? iso(now + 60 * 60_000) : group.next_message_at;
  await updateGroup(db, group.id, { payment_status: back, next_message_at: resume }, now);
  await event(db, group.id, "bank_transfer_rejected", { notes: params.notes }, params.actorId);
  return { ok: true };
}

export async function sendManualRecoveryEmail(db: Db, deps: RecoveryDeps, groupId: string, actorId: string | null) {
  const now = deps.now();
  const group = await loadGroup(db, groupId);
  if (!group || !group.is_open || PAID_STATUSES.has(group.payment_status)) return { ok: false, error: "Order is not open." };
  if (!["failed", "abandoned"].includes(group.payment_status)) {
    return { ok: false, error: "Only failed or abandoned orders can receive a recovery email." };
  }
  if (await deps.isAlreadyPaid(group)) {
    await markGroupPaid(db, deps, group.id, { via: "paystack", reference: null, amountKobo: group.amount_kobo });
    return { ok: false, error: "Customer has already paid. Order closed." };
  }
  const suppressed = await isSuppressed(db, group.customer_email);
  if (suppressed) return { ok: false, error: `Address is suppressed (${suppressed}).` };
  if (group.last_email_at && now - Date.parse(group.last_email_at) < 12 * 3_600_000) {
    return { ok: false, error: "A recovery email went out in the last 12 hours." };
  }
  const { data: manual } = await db
    .from("payment_recovery_messages")
    .select("id")
    .eq("group_id", groupId)
    .eq("step", "manual");
  const seq = ((manual ?? []) as unknown[]).length + 1;
  if (seq > 3) return { ok: false, error: "Manual resend limit reached for this order." };
  const out = await deliver(db, deps, group, "manual", seq, actorId);
  return out === "sent" ? { ok: true } : { ok: false, error: "Email could not be sent. See the message log." };
}

export async function addNote(db: Db, groupId: string, text: string, actorId: string | null) {
  const note = text.trim().slice(0, 2000);
  if (!note) return { ok: false };
  await event(db, groupId, "note", { text: note }, actorId);
  return { ok: true };
}

export async function verifyGroupNow(db: Db, deps: RecoveryDeps, groupId: string) {
  const now = deps.now();
  await db
    .from("payment_recovery_attempts")
    .update({ next_verify_at: iso(now) })
    .eq("group_id", groupId)
    .in("status", UNRESOLVED_ATTEMPT as unknown as string[]);
  return reconcileAttempts(db, deps);
}

/* ------------------------------------------------------------------------ */
/* Cron entry                                                                */
/* ------------------------------------------------------------------------ */

export async function runRecoveryCycle(db: Db, deps: RecoveryDeps) {
  const reconcile = await reconcileAttempts(db, deps);
  const messages = await processDueMessages(db, deps);
  return { reconcile, messages };
}
