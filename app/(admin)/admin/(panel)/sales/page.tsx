import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import {
  getSalesFunnelAnalytics,
  type SalesFunnelRange,
} from "@/lib/sales-funnel-analytics";
import { StatCard } from "@/components/admin/stat-card";
import { Users, MousePointerClick, CreditCard, ShoppingBag } from "lucide-react";

export const metadata: Metadata = { title: "Sales" };

const RANGES: Array<{ id: SalesFunnelRange; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "all", label: "All time" },
];

function formatNgn(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: { range?: string; tab?: string };
}) {
  await requireAdmin();
  const range = (RANGES.find((r) => r.id === searchParams.range)?.id ?? "30d") as SalesFunnelRange;
  const tab =
    searchParams.tab === "guidance" ? "guidance" : "analytics";

  const admin = await getAdminSupabase();
  const funnel = await getSalesFunnelAnalytics(admin, range);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sales</h1>
        <p className="mt-1 text-sm text-muted">
          Conversion funnel from Sales Pages — recorded events only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-app pb-3">
        {[
          { id: "analytics", label: "Analytics" },
          { id: "guidance", label: "How to edit offers" },
        ].map((t) => (
          <Link
            key={t.id}
            href={`/admin/sales?tab=${t.id}&range=${range}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-brand text-white" : "border border-app text-ink hover:bg-surface"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "analytics" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <Link
                key={r.id}
                href={`/admin/sales?tab=analytics&range=${r.id}`}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  range === r.id ? "bg-ink text-white" : "border border-app text-muted"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Visitors"
              value={funnel.totals.visitors.toLocaleString()}
              icon={<Users className="h-5 w-5" />}
            />
            <StatCard
              label="CTA clicks"
              value={funnel.totals.ctaClicks.toLocaleString()}
              icon={<MousePointerClick className="h-5 w-5" />}
            />
            <StatCard
              label="Checkout starts"
              value={funnel.totals.checkoutStarts.toLocaleString()}
              icon={<CreditCard className="h-5 w-5" />}
            />
            <StatCard
              label="Purchases"
              value={funnel.totals.purchases.toLocaleString()}
              icon={<ShoppingBag className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-app bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Conversion rate</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{funnel.totals.conversionRate}%</p>
            </div>
            <div className="rounded-xl border border-app bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Revenue</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{formatNgn(funnel.totals.revenueNgn)}</p>
            </div>
            <div className="rounded-xl border border-app bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Revenue / visitor</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {formatNgn(funnel.totals.revenuePerVisitor)}
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-app bg-surface p-4">
            <h2 className="font-semibold">Sales page performance</h2>
            {funnel.pages.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No sales page events in this range yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-app text-xs uppercase text-muted">
                      <th className="py-2 pr-3">Course</th>
                      <th className="py-2 pr-3">Views</th>
                      <th className="py-2 pr-3">CTA</th>
                      <th className="py-2 pr-3">Checkout</th>
                      <th className="py-2 pr-3">Purchases</th>
                      <th className="py-2 pr-3">Conv.</th>
                      <th className="py-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.pages.map((p) => (
                      <tr key={p.courseId} className="border-b border-app/60">
                        <td className="py-2 pr-3 font-medium">
                          <Link href={`/admin/courses/${p.courseId}`} className="hover:text-brand">
                            {p.courseTitle}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{p.views}</td>
                        <td className="py-2 pr-3 tabular-nums">{p.ctaClicks}</td>
                        <td className="py-2 pr-3 tabular-nums">{p.checkoutStarts}</td>
                        <td className="py-2 pr-3 tabular-nums">{p.purchases}</td>
                        <td className="py-2 pr-3 tabular-nums">{p.conversionRate}%</td>
                        <td className="py-2 tabular-nums">{formatNgn(p.revenueNgn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-app bg-surface p-4">
            <h2 className="font-semibold">CTA performance</h2>
            {funnel.ctas.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No CTA clicks recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {funnel.ctas.map((c) => (
                  <li key={`${c.ctaId}-${c.sectionType}`} className="flex justify-between gap-4">
                    <span>
                      <span className="font-medium capitalize">{c.ctaId}</span>
                      <span className="text-muted"> · {c.sectionType}</span>
                    </span>
                    <span className="tabular-nums text-muted">
                      {c.clicks} clicks · {c.clickRate}% of visitors
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-app bg-surface p-4">
            <h2 className="font-semibold">Campaigns (UTM)</h2>
            {funnel.campaigns.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No campaign attribution yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-app text-xs uppercase text-muted">
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Medium</th>
                      <th className="py-2 pr-3">Campaign</th>
                      <th className="py-2 pr-3">Views</th>
                      <th className="py-2 pr-3">Purchases</th>
                      <th className="py-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.campaigns.map((c, i) => (
                      <tr key={`${c.source}-${c.medium}-${c.campaign}-${i}`} className="border-b border-app/60">
                        <td className="py-2 pr-3">{c.source}</td>
                        <td className="py-2 pr-3">{c.medium}</td>
                        <td className="py-2 pr-3">{c.campaign}</td>
                        <td className="py-2 pr-3 tabular-nums">{c.views}</td>
                        <td className="py-2 pr-3 tabular-nums">{c.purchases}</td>
                        <td className="py-2 tabular-nums">{formatNgn(c.revenueNgn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === "guidance" ? (
        <section className="rounded-xl border border-app bg-surface p-4">
          <h2 className="font-semibold">Offers &amp; recommendations</h2>
          <p className="mt-2 text-sm text-muted">
            Offer copy (headline, bonuses, urgency, guarantee) and course recommendations are edited on
            each course Sales Page in the course editor — not as a separate price list.
          </p>
          <Link
            href="/admin/courses"
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Open courses
          </Link>
        </section>
      ) : null}
    </div>
  );
}
