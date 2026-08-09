import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/schema-guard";

export type SalesFunnelRange = "today" | "7d" | "30d" | "90d" | "all";

export type SalesFunnelTotals = {
  visitors: number;
  ctaClicks: number;
  checkoutStarts: number;
  purchases: number;
  conversionRate: number;
  revenueNgn: number;
  revenuePerVisitor: number;
};

export type SalesPageFunnelRow = {
  courseId: string;
  courseTitle: string;
  salesPageId: string | null;
  views: number;
  ctaClicks: number;
  checkoutStarts: number;
  purchases: number;
  conversionRate: number;
  revenueNgn: number;
};

export type CtaPerformanceRow = {
  ctaId: string;
  sectionType: string;
  clicks: number;
  views: number;
  clickRate: number;
};

export type CampaignRow = {
  source: string;
  medium: string;
  campaign: string;
  views: number;
  purchases: number;
  revenueNgn: number;
};

function rangeStart(range: SalesFunnelRange): Date | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function metaString(meta: unknown, key: string): string {
  if (!meta || typeof meta !== "object") return "";
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

type EventRow = {
  event_name: string;
  course_id: string | null;
  created_at: string;
  metadata: unknown;
};

/**
 * Aggregate sales funnel metrics from product_events + successful transactions.
 * Uses indexed event_name/created_at filters; fails open to empty if table missing.
 */
export async function getSalesFunnelAnalytics(
  admin: SupabaseClient,
  range: SalesFunnelRange = "30d",
): Promise<{
  totals: SalesFunnelTotals;
  pages: SalesPageFunnelRow[];
  ctas: CtaPerformanceRow[];
  campaigns: CampaignRow[];
}> {
  const empty = {
    totals: {
      visitors: 0,
      ctaClicks: 0,
      checkoutStarts: 0,
      purchases: 0,
      conversionRate: 0,
      revenueNgn: 0,
      revenuePerVisitor: 0,
    } satisfies SalesFunnelTotals,
    pages: [] as SalesPageFunnelRow[],
    ctas: [] as CtaPerformanceRow[],
    campaigns: [] as CampaignRow[],
  };

  const start = rangeStart(range);
  const eventNames = [
    "sales_page_view",
    "sales_page_cta_click",
    "sales_page_checkout_start",
    "sales_page_purchase",
  ];

  let eventsQuery = admin
    .from("product_events")
    .select("event_name, course_id, created_at, metadata")
    .in("event_name", eventNames)
    .order("created_at", { ascending: false })
    .limit(20_000);

  if (start) {
    eventsQuery = eventsQuery.gte("created_at", start.toISOString());
  }

  const { data: events, error } = await eventsQuery;
  if (error) {
    if (isMissingRelationError(error.message)) return empty;
    console.error("[sales-funnel]", error.message);
    return empty;
  }

  const rows = (events ?? []) as EventRow[];

  let visitors = 0;
  let ctaClicks = 0;
  let checkoutStarts = 0;
  let purchases = 0;

  const byCourse = new Map<
    string,
    {
      views: number;
      ctaClicks: number;
      checkoutStarts: number;
      purchases: number;
      salesPageId: string | null;
    }
  >();

  const ctaMap = new Map<string, { ctaId: string; sectionType: string; clicks: number }>();
  const campaignMap = new Map<
    string,
    { source: string; medium: string; campaign: string; views: number; purchases: number }
  >();

  for (const e of rows) {
    const courseId = e.course_id ?? (metaString(e.metadata, "course_id") || "unknown");
    const page = byCourse.get(courseId) ?? {
      views: 0,
      ctaClicks: 0,
      checkoutStarts: 0,
      purchases: 0,
      salesPageId: metaString(e.metadata, "sales_page_id") || null,
    };
    if (!page.salesPageId) {
      const sp = metaString(e.metadata, "sales_page_id");
      if (sp) page.salesPageId = sp;
    }

    const source = metaString(e.metadata, "utm_source") || "direct";
    const medium = metaString(e.metadata, "utm_medium") || "none";
    const campaign = metaString(e.metadata, "utm_campaign") || "(none)";
    const campKey = `${source}|${medium}|${campaign}`;
    const camp = campaignMap.get(campKey) ?? {
      source,
      medium,
      campaign,
      views: 0,
      purchases: 0,
    };

    if (e.event_name === "sales_page_view") {
      visitors++;
      page.views++;
      camp.views++;
    } else if (e.event_name === "sales_page_cta_click") {
      ctaClicks++;
      page.ctaClicks++;
      const ctaId = metaString(e.metadata, "cta_id") || "unknown";
      const sectionType = metaString(e.metadata, "section_type") || "unknown";
      const ck = `${ctaId}|${sectionType}`;
      const c = ctaMap.get(ck) ?? { ctaId, sectionType, clicks: 0 };
      c.clicks++;
      ctaMap.set(ck, c);
    } else if (e.event_name === "sales_page_checkout_start") {
      checkoutStarts++;
      page.checkoutStarts++;
    } else if (e.event_name === "sales_page_purchase") {
      purchases++;
      page.purchases++;
      camp.purchases++;
    }

    byCourse.set(courseId, page);
    campaignMap.set(campKey, camp);
  }

  // Revenue from successful transactions in range (authoritative money, not invented)
  let txQuery = admin
    .from("transactions")
    .select("course_id, amount, currency, status, paystack_data, created_at")
    .eq("status", "success")
    .limit(10_000);
  if (start) {
    txQuery = txQuery.gte("created_at", start.toISOString());
  }
  const { data: txs } = await txQuery;
  let revenueNgn = 0;
  const revenueByCourse = new Map<string, number>();
  const revenueByCampaign = new Map<string, number>();

  for (const tx of txs ?? []) {
    if (String(tx.currency).toUpperCase() !== "NGN") continue;
    const amount = Number(tx.amount) || 0;
    // transactions.amount is Paystack kobo for NGN
    const naira = amount / 100;
    revenueNgn += naira;
    if (tx.course_id) {
      revenueByCourse.set(tx.course_id, (revenueByCourse.get(tx.course_id) ?? 0) + naira);
    }
    const meta = tx.paystack_data;
    const nested =
      meta && typeof meta === "object" && "metadata" in (meta as object)
        ? (meta as { metadata?: unknown }).metadata
        : meta;
    const source = metaString(nested, "utm_source") || metaString(meta, "utm_source") || "direct";
    const medium = metaString(nested, "utm_medium") || metaString(meta, "utm_medium") || "none";
    const campaign =
      metaString(nested, "utm_campaign") || metaString(meta, "utm_campaign") || "(none)";
    const campKey = `${source}|${medium}|${campaign}`;
    revenueByCampaign.set(campKey, (revenueByCampaign.get(campKey) ?? 0) + naira);
  }

  const courseIds = [...byCourse.keys()].filter((id) => id !== "unknown");
  const titleById = new Map<string, string>();
  if (courseIds.length) {
    const { data: courses } = await admin.from("courses").select("id, title").in("id", courseIds);
    for (const c of courses ?? []) titleById.set(c.id, c.title);
  }

  const pages: SalesPageFunnelRow[] = [...byCourse.entries()]
    .filter(([id]) => id !== "unknown")
    .map(([courseId, v]) => ({
      courseId,
      courseTitle: titleById.get(courseId) ?? courseId.slice(0, 8),
      salesPageId: v.salesPageId,
      views: v.views,
      ctaClicks: v.ctaClicks,
      checkoutStarts: v.checkoutStarts,
      purchases: v.purchases,
      conversionRate: v.views > 0 ? Math.round((v.purchases / v.views) * 1000) / 10 : 0,
      revenueNgn: revenueByCourse.get(courseId) ?? 0,
    }))
    .sort((a, b) => b.views - a.views);

  const totalViewsForCta = Math.max(visitors, 1);
  const ctas: CtaPerformanceRow[] = [...ctaMap.values()]
    .map((c) => ({
      ctaId: c.ctaId,
      sectionType: c.sectionType,
      clicks: c.clicks,
      views: visitors,
      clickRate: Math.round((c.clicks / totalViewsForCta) * 1000) / 10,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 20);

  const campaigns: CampaignRow[] = [...campaignMap.entries()]
    .map(([key, c]) => ({
      source: c.source,
      medium: c.medium,
      campaign: c.campaign,
      views: c.views,
      purchases: c.purchases,
      revenueNgn: revenueByCampaign.get(key) ?? 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 30);

  const conversionRate = visitors > 0 ? Math.round((purchases / visitors) * 1000) / 10 : 0;
  const revenuePerVisitor = visitors > 0 ? Math.round(revenueNgn / visitors) : 0;

  return {
    totals: {
      visitors,
      ctaClicks,
      checkoutStarts,
      purchases,
      conversionRate,
      revenueNgn,
      revenuePerVisitor,
    },
    pages,
    ctas,
    campaigns,
  };
}
