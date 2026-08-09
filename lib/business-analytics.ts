import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSalesFunnelAnalytics,
  type SalesFunnelRange,
} from "@/lib/sales-funnel-analytics";

export type BusinessRange = "today" | "7d" | "30d" | "90d" | "year" | "all";

function rangeStart(range: BusinessRange): Date | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "year") return new Date(now.getFullYear(), 0, 1);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 86400000);
}

function toFunnelRange(range: BusinessRange): SalesFunnelRange {
  if (range === "year") return "90d";
  if (range === "today" || range === "7d" || range === "30d" || range === "90d" || range === "all") {
    return range;
  }
  return "30d";
}

function koboToNaira(amount: number) {
  return (Number(amount) || 0) / 100;
}

export async function getBusinessOverview(admin: SupabaseClient, range: BusinessRange = "30d") {
  const start = rangeStart(range);

  let txQ = admin
    .from("transactions")
    .select("id, amount, currency, course_id, student_id, created_at, status")
    .eq("status", "success")
    .limit(8_000);
  if (start) txQ = txQ.gte("created_at", start.toISOString());
  const { data: txs } = await txQ;

  const ngnTxs = (txs ?? []).filter((t) => String(t.currency).toUpperCase() === "NGN");
  const revenueNgn = ngnTxs.reduce((s, t) => s + koboToNaira(t.amount), 0);
  const orders = ngnTxs.length;
  const aov = orders ? Math.round(revenueNgn / orders) : 0;
  const buyers = new Set(ngnTxs.map((t) => t.student_id).filter(Boolean));

  const revenueByCourse = new Map<string, { revenue: number; orders: number }>();
  for (const t of ngnTxs) {
    if (!t.course_id) continue;
    const cur = revenueByCourse.get(t.course_id) ?? { revenue: 0, orders: 0 };
    cur.revenue += koboToNaira(t.amount);
    cur.orders += 1;
    revenueByCourse.set(t.course_id, cur);
  }

  let profileQ = admin
    .from("profiles")
    .select("id, created_at, last_active_at", { count: "exact" })
    .eq("role", "student");
  const { count: totalCustomers } = await profileQ;

  let newCustQ = admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "student");
  if (start) newCustQ = newCustQ.gte("created_at", start.toISOString());
  const { count: newCustomers } = await newCustQ;

  const activeCutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const { count: activeStudents } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "student")
    .eq("is_suspended", false)
    .gte("last_active_at", activeCutoff);

  let enrQ = admin.from("enrollments").select("id, completed_at", { count: "exact" });
  if (start) enrQ = enrQ.gte("enrolled_at", start.toISOString());
  const { data: enrRows, count: enrollments } = await enrQ.limit(5_000);
  const completions = (enrRows ?? []).filter((e) => e.completed_at).length;

  // Repeat purchasers (all-time among buyers in range)
  const purchaseCounts = new Map<string, number>();
  for (const t of ngnTxs) {
    if (!t.student_id) continue;
    purchaseCounts.set(t.student_id, (purchaseCounts.get(t.student_id) ?? 0) + 1);
  }
  const repeatPurchasers = [...purchaseCounts.values()].filter((n) => n >= 2).length;

  const courseIds = [...revenueByCourse.keys()];
  const titleById = new Map<string, string>();
  if (courseIds.length) {
    const { data: courses } = await admin.from("courses").select("id, title").in("id", courseIds);
    for (const c of courses ?? []) titleById.set(c.id, c.title);
  }

  const topProducts = [...revenueByCourse.entries()]
    .map(([courseId, v]) => ({
      courseId,
      title: titleById.get(courseId) ?? courseId.slice(0, 8),
      revenueNgn: v.revenue,
      orders: v.orders,
    }))
    .sort((a, b) => b.revenueNgn - a.revenueNgn)
    .slice(0, 10);

  // Daily revenue trend (last buckets)
  const trendMap = new Map<string, number>();
  for (const t of ngnTxs) {
    const d = t.created_at.slice(0, 10);
    trendMap.set(d, (trendMap.get(d) ?? 0) + koboToNaira(t.amount));
  }
  const revenueTrend = [...trendMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-30)
    .map(([date, revenueNgn]) => ({ date, revenueNgn }));

  const funnel = await getSalesFunnelAnalytics(admin, toFunnelRange(range));

  // Product performance join enrollments
  const productPerformance = [];
  for (const p of topProducts.slice(0, 8)) {
    const { count: enrCount } = await admin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", p.courseId);
    const { count: completedCount } = await admin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", p.courseId)
      .not("completed_at", "is", null);
    const enrolled = enrCount ?? 0;
    const completed = completedCount ?? 0;
    const page = funnel.pages.find((x) => x.courseId === p.courseId);
    productPerformance.push({
      ...p,
      enrollments: enrolled,
      completionRate: enrolled ? Math.round((completed / enrolled) * 1000) / 10 : 0,
      salesPageViews: page?.views ?? 0,
      ctaClicks: page?.ctaClicks ?? 0,
      checkoutStarts: page?.checkoutStarts ?? 0,
      conversionRate: page?.conversionRate ?? 0,
    });
  }

  return {
    range,
    revenueNgn,
    orders,
    averageOrderValueNgn: aov,
    uniqueBuyers: buyers.size,
    totalCustomers: totalCustomers ?? 0,
    newCustomers: newCustomers ?? 0,
    activeStudents: activeStudents ?? 0,
    enrollments: enrollments ?? 0,
    completions,
    completionRate:
      enrollments && enrollments > 0 ? Math.round((completions / enrollments) * 1000) / 10 : 0,
    repeatPurchasers,
    topProducts,
    productPerformance,
    revenueTrend,
    salesFunnel: funnel.totals,
    salesPages: funnel.pages.slice(0, 10),
    campaigns: funnel.campaigns.slice(0, 10),
  };
}
