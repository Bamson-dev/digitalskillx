import "server-only";
import { buildRecoveryDeps } from "./server";
import { isValidRecoveryEmail, type Group } from "./engine";
import { computeRecoveryAnalytics, type AnalyticsGroup } from "./analytics";

export type RecoveryFilters = {
  q?: string;
  from?: string;
  to?: string;
  course?: string;
  payment?: string;
  recovery?: string;
  page?: number;
};

export const PAGE_SIZE = 25;

export const PAYMENT_STATUSES = [
  "initiated", "awaiting_payment", "pending", "processing", "successful", "failed",
  "abandoned", "reversed", "bank_transfer_pending", "bank_transfer_confirmed", "expired",
] as const;
export const RECOVERY_STATUSES = [
  "none", "scheduled", "in_progress", "completed", "recovered", "cancelled",
  "opted_out", "suppressed", "no_email", "excluded",
] as const;

function safeSearch(q: string) {
  return q.replace(/[^\p{L}\p{N}@._+\- ]/gu, "").trim().slice(0, 80);
}

function lagosDayStart(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00+01:00` : null;
}
function lagosDayEnd(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T23:59:59.999+01:00` : null;
}

function applyFilters(query: any, f: RecoveryFilters) {
  let q = query;
  const term = f.q ? safeSearch(f.q) : "";
  if (term) {
    q = q.or(`customer_email.ilike.%${term}%,customer_name.ilike.%${term}%,bank_reference.ilike.%${term}%,customer_phone.ilike.%${term}%`);
  }
  const from = f.from ? lagosDayStart(f.from) : null;
  const to = f.to ? lagosDayEnd(f.to) : null;
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  if (f.course && /^[0-9a-f-]{36}$/.test(f.course)) q = q.eq("course_id", f.course);
  if (f.payment && (PAYMENT_STATUSES as readonly string[]).includes(f.payment)) q = q.eq("payment_status", f.payment);
  if (f.recovery && (RECOVERY_STATUSES as readonly string[]).includes(f.recovery)) q = q.eq("recovery_status", f.recovery);
  return q;
}

export async function listRecoveryGroups(f: RecoveryFilters) {
  const { db } = await buildRecoveryDeps();
  const page = Math.max(1, f.page ?? 1);
  const query = applyFilters(
    db.from("payment_recovery_groups").select("*", { count: "exact" }),
    f,
  )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data, count, error } = await query;
  return { rows: (data ?? []) as Group[], total: count ?? 0, page, error: error?.message ?? null };
}

export async function exportRecoveryGroups(f: RecoveryFilters) {
  const { db } = await buildRecoveryDeps();
  const { data } = await applyFilters(db.from("payment_recovery_groups").select("*"), f)
    .order("created_at", { ascending: false })
    .limit(5000);
  return (data ?? []) as Array<Group & Record<string, unknown>>;
}

export async function recoveryOverview(f: RecoveryFilters) {
  const { db } = await buildRecoveryDeps();
  const { data: groups, error } = await applyFilters(
    db
      .from("payment_recovery_groups")
      .select("id, course_id, product_title, payment_status, recovery_status, failed_at, abandoned_at, emails_sent, recovered_via, recovered_amount_kobo, recovered_after_step"),
    { ...f, page: undefined },
  ).limit(10000);
  if (error) return { error: error.message as string, stats: null };
  const ids = ((groups ?? []) as Array<{ id: string }>).map((g) => g.id);
  let messages: Array<{ status: string }> = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("payment_recovery_messages").select("status").in("group_id", ids.slice(i, i + 200));
    messages = messages.concat((data ?? []) as Array<{ status: string }>);
  }
  return { error: null, stats: computeRecoveryAnalytics((groups ?? []) as AnalyticsGroup[], messages) };
}

export async function recoveryGroupDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { db } = await buildRecoveryDeps();
  const { data: group } = await db.from("payment_recovery_groups").select("*").eq("id", id).maybeSingle();
  if (!group) return null;
  const [attempts, messages, events, bank, suppression] = await Promise.all([
    db.from("payment_recovery_attempts").select("*").eq("group_id", id).order("created_at", { ascending: true }),
    db.from("payment_recovery_messages").select("*").eq("group_id", id).order("created_at", { ascending: true }),
    db.from("payment_recovery_events").select("*").eq("group_id", id).order("created_at", { ascending: true }),
    db.from("payment_recovery_bank_confirmations").select("*").eq("group_id", id).order("created_at", { ascending: true }),
    db.from("payment_recovery_suppressions").select("*").eq("email", (group as Group).customer_email).maybeSingle(),
  ]);
  return {
    group: group as Group & Record<string, unknown>,
    attempts: (attempts.data ?? []) as Array<Record<string, unknown>>,
    messages: (messages.data ?? []) as Array<Record<string, unknown>>,
    events: (events.data ?? []) as Array<Record<string, unknown>>,
    bank: (bank.data ?? []) as Array<Record<string, unknown>>,
    suppression: (suppression.data ?? null) as Record<string, unknown> | null,
  };
}

export async function recoveryCourses() {
  const { db } = await buildRecoveryDeps();
  const { data } = await db.from("courses").select("id, title").order("title");
  return (data ?? []) as Array<{ id: string; title: string }>;
}

/* ------------------------------------------------------------------------ */
/* Historical review                                                         */
/* ------------------------------------------------------------------------ */

export type HistoricalCandidate = {
  transactionId: string;
  reference: string;
  email: string | null;
  fullName: string | null;
  studentId: string | null;
  courseId: string;
  courseTitle: string;
  amountKobo: number;
  status: string;
  createdAt: string;
  verdict:
    | "eligible"
    | "already_paid"
    | "prior_reminder"
    | "suppressed"
    | "no_email"
    | "duplicate"
    | "already_tracked";
};

export async function historicalCandidates(days = 30): Promise<HistoricalCandidate[]> {
  const { db, deps } = await buildRecoveryDeps();
  const now = deps.now();
  const since = new Date(now - Math.min(Math.max(days, 1), 90) * 86_400_000).toISOString();
  const until = new Date(now - 60 * 60_000).toISOString();
  const { data: txs } = await db
    .from("transactions")
    .select("id, reference, student_id, course_id, amount, status, paystack_data, created_at")
    .in("status", ["pending", "failed"])
    .not("course_id", "is", null)
    .gte("created_at", since)
    .lte("created_at", until)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (txs ?? []) as Array<{
    id: string; reference: string; student_id: string | null; course_id: string; amount: number;
    status: string; paystack_data: Record<string, unknown> | null; created_at: string;
  }>;
  // Payment Page (external) payments have their own reconcile flow and no pre-checkout capture.
  const native = rows.filter((r) => !r.paystack_data || !r.paystack_data.source);

  const refs = native.map((r) => r.reference);
  const tracked = new Set<string>();
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await db.from("payment_recovery_attempts").select("reference").in("reference", refs.slice(i, i + 200));
    ((data ?? []) as Array<{ reference: string }>).forEach((r) => tracked.add(r.reference));
  }
  const reminded = new Set<string>();
  const txIds = native.map((r) => r.id);
  for (let i = 0; i < txIds.length; i += 200) {
    const { data } = await db.from("checkout_abandon_reminders").select("transaction_id").in("transaction_id", txIds.slice(i, i + 200));
    ((data ?? []) as Array<{ transaction_id: string }>).forEach((r) => reminded.add(r.transaction_id));
  }
  const courseIds = [...new Set(native.map((r) => r.course_id))];
  const titles = new Map<string, string>();
  if (courseIds.length) {
    const { data } = await db.from("courses").select("id, title").in("id", courseIds);
    ((data ?? []) as Array<{ id: string; title: string }>).forEach((c) => titles.set(c.id, c.title));
  }

  const seen = new Set<string>();
  const out: HistoricalCandidate[] = [];
  for (const r of native) {
    let email = typeof r.paystack_data?.checkout_email === "string" ? String(r.paystack_data.checkout_email).toLowerCase() : null;
    const fullName = typeof r.paystack_data?.checkout_full_name === "string" ? String(r.paystack_data.checkout_full_name) : null;
    if (!email && r.student_id) {
      const { data: p } = await db.from("profiles").select("email").eq("id", r.student_id).maybeSingle();
      email = p?.email ? String(p.email).toLowerCase() : null;
    }
    const base = {
      transactionId: r.id, reference: r.reference, email, fullName, studentId: r.student_id,
      courseId: r.course_id, courseTitle: titles.get(r.course_id) ?? "Course", amountKobo: r.amount,
      status: r.status, createdAt: r.created_at,
    };
    let verdict: HistoricalCandidate["verdict"] = "eligible";
    if (tracked.has(r.reference)) verdict = "already_tracked";
    else if (!isValidRecoveryEmail(email)) verdict = "no_email";
    else if (seen.has(`${email}:${r.course_id}`)) verdict = "duplicate";
    else if (reminded.has(r.id)) verdict = "prior_reminder";
    else {
      const { data: sup } = await db.from("payment_recovery_suppressions").select("email").eq("email", email).maybeSingle();
      if (sup) verdict = "suppressed";
      else if (await deps.isAlreadyPaid({ customer_email: email!, course_id: r.course_id, student_id: r.student_id } as Group)) {
        verdict = "already_paid";
      }
    }
    if (email) seen.add(`${email}:${r.course_id}`);
    out.push({ ...base, verdict });
  }
  return out;
}
