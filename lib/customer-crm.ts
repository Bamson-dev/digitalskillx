import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/schema-guard";

export type CustomerListFilter = {
  q?: string;
  status?: "active" | "suspended" | "";
  tag?: string;
  /** purchased | never_purchased | completed | incomplete | certificates | inactive | recent_purchase | high_value | new */
  audience?: string;
  courseId?: string;
  inactiveDays?: number;
  page?: number;
  pageSize?: number;
};

export type CustomerValue = {
  totalSpentNgn: number;
  purchaseCount: number;
  averageOrderValueNgn: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
};

export type CustomerTimelineEvent = {
  id: string;
  at: string;
  type: string;
  title: string;
  detail?: string;
};

function koboToNaira(amount: number): number {
  return (Number(amount) || 0) / 100;
}

export async function getCustomerValue(
  admin: SupabaseClient,
  studentId: string,
): Promise<CustomerValue> {
  const { data } = await admin
    .from("transactions")
    .select("amount, currency, created_at, status")
    .eq("student_id", studentId)
    .eq("status", "success")
    .order("created_at", { ascending: true })
    .limit(500);

  const txs = (data ?? []).filter((t) => String(t.currency).toUpperCase() === "NGN");
  const totalSpentNgn = txs.reduce((s, t) => s + koboToNaira(t.amount), 0);
  const purchaseCount = txs.length;
  return {
    totalSpentNgn,
    purchaseCount,
    averageOrderValueNgn: purchaseCount ? Math.round(totalSpentNgn / purchaseCount) : 0,
    firstPurchaseAt: txs[0]?.created_at ?? null,
    lastPurchaseAt: txs[txs.length - 1]?.created_at ?? null,
  };
}

/**
 * Paginated customer search over profiles (students only).
 * Does not load the full table into the browser — pageSize capped.
 */
export async function searchCustomers(
  admin: SupabaseClient,
  filter: CustomerListFilter,
): Promise<{ rows: Array<Record<string, unknown>>; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(50, Math.max(10, filter.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from("profiles")
    .select("id, full_name, email, is_suspended, tags, last_active_at, created_at", {
      count: "exact",
    })
    .eq("role", "student")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filter.q?.trim()) {
    const q = filter.q.trim().replace(/[%_,]/g, "");
    if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }
  if (filter.status === "suspended") query = query.eq("is_suspended", true);
  if (filter.status === "active") query = query.eq("is_suspended", false);
  if (filter.tag?.trim()) query = query.contains("tags", [filter.tag.trim()]);

  if (filter.audience === "new") {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    query = query.gte("created_at", since);
  }
  if (filter.audience === "inactive") {
    const days = filter.inactiveDays && filter.inactiveDays > 0 ? filter.inactiveDays : 14;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    query = query.or(`last_active_at.is.null,last_active_at.lt.${cutoff}`);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  let rows = data ?? [];

  // Post-filters that need related tables (bounded by current page candidates + extra fetch when needed)
  if (filter.audience === "purchased" || filter.audience === "never_purchased" || filter.audience === "high_value" || filter.audience === "recent_purchase") {
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: txs } = await admin
        .from("transactions")
        .select("student_id, amount, created_at")
        .in("student_id", ids)
        .eq("status", "success");
      const spent = new Map<string, number>();
      const lastBuy = new Map<string, string>();
      for (const t of txs ?? []) {
        if (!t.student_id) continue;
        spent.set(t.student_id, (spent.get(t.student_id) ?? 0) + koboToNaira(t.amount));
        const prev = lastBuy.get(t.student_id);
        if (!prev || t.created_at > prev) lastBuy.set(t.student_id, t.created_at);
      }
      if (filter.audience === "purchased") rows = rows.filter((r) => spent.has(r.id));
      if (filter.audience === "never_purchased") rows = rows.filter((r) => !spent.has(r.id));
      if (filter.audience === "high_value") rows = rows.filter((r) => (spent.get(r.id) ?? 0) >= 100_000);
      if (filter.audience === "recent_purchase") {
        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        rows = rows.filter((r) => {
          const at = lastBuy.get(r.id);
          return at && at >= since;
        });
      }
    }
  }

  if (filter.courseId) {
    const { data: enr } = await admin
      .from("enrollments")
      .select("student_id, completed_at")
      .eq("course_id", filter.courseId)
      .limit(5000);
    const set = new Map((enr ?? []).map((e) => [e.student_id, e.completed_at]));
    if (filter.audience === "completed") {
      rows = rows.filter((r) => set.has(r.id) && set.get(r.id));
    } else if (filter.audience === "incomplete") {
      rows = rows.filter((r) => set.has(r.id) && !set.get(r.id));
    } else {
      rows = rows.filter((r) => set.has(r.id));
    }
  } else if (filter.audience === "completed" || filter.audience === "incomplete") {
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: enr } = await admin
        .from("enrollments")
        .select("student_id, completed_at")
        .in("student_id", ids);
      const byStudent = new Map<string, { any: boolean; completed: boolean }>();
      for (const e of enr ?? []) {
        const cur = byStudent.get(e.student_id) ?? { any: false, completed: false };
        cur.any = true;
        if (e.completed_at) cur.completed = true;
        byStudent.set(e.student_id, cur);
      }
      if (filter.audience === "completed") {
        rows = rows.filter((r) => byStudent.get(r.id)?.completed);
      } else {
        rows = rows.filter((r) => byStudent.get(r.id)?.any && !byStudent.get(r.id)?.completed);
      }
    }
  }

  if (filter.audience === "certificates") {
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: certs } = await admin
        .from("certificates")
        .select("student_id")
        .in("student_id", ids)
        .eq("is_valid", true);
      const set = new Set((certs ?? []).map((c) => c.student_id));
      rows = rows.filter((r) => set.has(r.id));
    }
  }

  return { rows, total: count ?? rows.length, page, pageSize };
}

/** Aggregate timeline from existing tables — only real events. */
export async function getCustomerTimeline(
  admin: SupabaseClient,
  studentId: string,
  limit = 80,
): Promise<CustomerTimelineEvent[]> {
  const events: CustomerTimelineEvent[] = [];

  const { data: profile } = await admin
    .from("profiles")
    .select("created_at, email, full_name")
    .eq("id", studentId)
    .maybeSingle();
  if (profile?.created_at) {
    events.push({
      id: `acct-${studentId}`,
      at: profile.created_at,
      type: "account_created",
      title: "Account created",
      detail: profile.email,
    });
  }

  const [{ data: enrollments }, { data: txs }, { data: certs }, { data: productEvents }] =
    await Promise.all([
      admin
        .from("enrollments")
        .select("id, enrolled_at, completed_at, source, course:courses(title)")
        .eq("student_id", studentId)
        .order("enrolled_at", { ascending: false })
        .limit(40),
      admin
        .from("transactions")
        .select("id, created_at, amount, currency, status, reference, course:courses(title)")
        .eq("student_id", studentId)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(40),
      admin
        .from("certificates")
        .select("id, issued_at, certificate_number, course:courses(title)")
        .eq("student_id", studentId)
        .order("issued_at", { ascending: false })
        .limit(20),
      admin
        .from("product_events")
        .select("id, created_at, event_name, course_id, metadata")
        .eq("student_id", studentId)
        .in("event_name", [
          "sales_page_view",
          "sales_page_cta_click",
          "sales_page_checkout_start",
          "sales_page_purchase",
          "course_view",
        ])
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

  for (const e of enrollments ?? []) {
    const course = Array.isArray(e.course) ? e.course[0] : e.course;
    const title = (course as { title?: string } | null)?.title ?? "Course";
    events.push({
      id: `enr-${e.id}`,
      at: e.enrolled_at,
      type: "enrolled",
      title: `Enrolled in ${title}`,
      detail: e.source ? `Source: ${e.source}` : undefined,
    });
    if (e.completed_at) {
      events.push({
        id: `cmp-${e.id}`,
        at: e.completed_at,
        type: "completed",
        title: `Completed ${title}`,
      });
    }
  }

  for (const t of txs ?? []) {
    const course = Array.isArray(t.course) ? t.course[0] : t.course;
    const title = (course as { title?: string } | null)?.title ?? "Course";
    const naira = String(t.currency).toUpperCase() === "NGN" ? koboToNaira(t.amount) : t.amount;
    events.push({
      id: `tx-${t.id}`,
      at: t.created_at,
      type: "purchase",
      title: `Purchase · ${title}`,
      detail: `₦${Math.round(naira).toLocaleString()} · ${t.reference}`,
    });
  }

  for (const c of certs ?? []) {
    const course = Array.isArray(c.course) ? c.course[0] : c.course;
    const title = (course as { title?: string } | null)?.title ?? "Course";
    events.push({
      id: `cert-${c.id}`,
      at: c.issued_at,
      type: "certificate",
      title: `Certificate issued · ${title}`,
      detail: c.certificate_number,
    });
  }

  for (const pe of productEvents ?? []) {
    const labels: Record<string, string> = {
      sales_page_view: "Sales page viewed",
      sales_page_cta_click: "Sales CTA clicked",
      sales_page_checkout_start: "Checkout started",
      sales_page_purchase: "Sales page purchase attributed",
      course_view: "Course page viewed",
    };
    events.push({
      id: `pe-${pe.id}`,
      at: pe.created_at,
      type: pe.event_name,
      title: labels[pe.event_name] ?? pe.event_name,
    });
  }

  const { data: notes } = await admin
    .from("admin_notes")
    .select("id, content, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const n of notes ?? []) {
    events.push({
      id: `note-${n.id}`,
      at: n.created_at,
      type: "admin_note",
      title: "Internal note added",
      detail: String(n.content).slice(0, 120),
    });
  }

  // Lesson completions (meaningful learning) — sample recent
  try {
    const { data: progress } = await admin
      .from("lesson_progress")
      .select("id, completed_at, lesson:lessons(title)")
      .eq("student_id", studentId)
      .eq("completed", true)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(25);
    for (const p of progress ?? []) {
      if (!p.completed_at) continue;
      const lesson = Array.isArray(p.lesson) ? p.lesson[0] : p.lesson;
      events.push({
        id: `lp-${p.id}`,
        at: p.completed_at,
        type: "lesson_completed",
        title: `Lesson completed · ${(lesson as { title?: string } | null)?.title ?? "Lesson"}`,
      });
    }
  } catch (err) {
    if (!(err instanceof Error && isMissingRelationError(err.message))) {
      /* ignore */
    }
  }

  return events
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);
}
