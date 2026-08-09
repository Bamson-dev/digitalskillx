import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { getBusinessOverview, type BusinessRange } from "@/lib/business-analytics";
import { StatCard } from "@/components/admin/stat-card";
import {
  Banknote,
  ShoppingCart,
  Users,
  UserPlus,
  GraduationCap,
  Repeat,
} from "lucide-react";

export const metadata: Metadata = { title: "Business" };

const RANGES: Array<{ id: BusinessRange; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

function formatNgn(n: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export default async function AdminBusinessPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireAdmin();
  const range = (RANGES.find((r) => r.id === searchParams.range)?.id ?? "30d") as BusinessRange;
  const admin = await getAdminSupabase();
  const data = await getBusinessOverview(admin, range);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Business</h1>
        <p className="mt-1 text-sm text-muted">
          Revenue and customer overview from successful transactions and enrollments — real data
          only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.id}
            href={`/admin/business?range=${r.id}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              range === r.id ? "bg-ink text-white" : "border border-app text-muted"
            }`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Revenue" value={formatNgn(data.revenueNgn)} icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Orders" value={data.orders.toLocaleString()} icon={<ShoppingCart className="h-5 w-5" />} />
        <StatCard label="Avg order value" value={formatNgn(data.averageOrderValueNgn)} icon={<Banknote className="h-5 w-5" />} />
        <StatCard label="Customers" value={data.totalCustomers.toLocaleString()} icon={<Users className="h-5 w-5" />} />
        <StatCard label="New customers" value={data.newCustomers.toLocaleString()} icon={<UserPlus className="h-5 w-5" />} />
        <StatCard label="Active students (14d)" value={data.activeStudents.toLocaleString()} icon={<GraduationCap className="h-5 w-5" />} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-app bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Enrollments</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{data.enrollments.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-app bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Completions</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{data.completions.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-app bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Completion rate</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{data.completionRate}%</p>
        </div>
        <div className="rounded-xl border border-app bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <Repeat className="h-3.5 w-3.5" /> Repeat purchasers
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{data.repeatPurchasers.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted">{data.repeatPurchaseRate}% of buyers</p>
        </div>
      </div>

      <section className="rounded-xl border border-app bg-surface p-4">
        <h2 className="font-semibold">Sales funnel (Phase 3 events)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
          <div>
            <p className="text-muted">Visitors</p>
            <p className="font-semibold tabular-nums">{data.salesFunnel.visitors.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted">CTA clicks</p>
            <p className="font-semibold tabular-nums">{data.salesFunnel.ctaClicks.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted">Checkout starts</p>
            <p className="font-semibold tabular-nums">{data.checkoutStarts.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted">Purchases</p>
            <p className="font-semibold tabular-nums">{data.purchases.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted">Conversion</p>
            <p className="font-semibold tabular-nums">{data.salesFunnel.conversionRate}%</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Stale pending checkouts (45m+):{" "}
          <span className="font-medium text-neutral-800">{data.checkoutAbandonProxy.toLocaleString()}</span>
          {" · "}
          Failed checkouts:{" "}
          <span className="font-medium text-neutral-800">{data.failedCheckouts.toLocaleString()}</span>
        </p>
        <p className="mt-3 text-xs text-muted">
          Detailed Sales Page reporting:{" "}
          <Link href="/admin/sales" className="text-brand hover:underline">
            Admin → Sales
          </Link>
        </p>
      </section>

      <section className="rounded-xl border border-app bg-surface p-4">
        <h2 className="font-semibold">Top products</h2>
        {data.topProducts.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No successful orders in this range.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-app text-xs uppercase text-muted">
                  <th className="py-2 pr-3">Course</th>
                  <th className="py-2 pr-3">Orders</th>
                  <th className="py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((p) => (
                  <tr key={p.courseId} className="border-b border-app/60">
                    <td className="py-2 pr-3">
                      <Link href={`/admin/courses/${p.courseId}`} className="font-medium hover:text-brand">
                        {p.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{p.orders}</td>
                    <td className="py-2 tabular-nums">{formatNgn(p.revenueNgn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-app bg-surface p-4">
        <h2 className="font-semibold">Product performance</h2>
        {data.productPerformance.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No product performance data yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-app text-xs uppercase text-muted">
                  <th className="py-2 pr-2">Product</th>
                  <th className="py-2 pr-2">Revenue</th>
                  <th className="py-2 pr-2">Enrollments</th>
                  <th className="py-2 pr-2">Completion</th>
                  <th className="py-2 pr-2">SP views</th>
                  <th className="py-2 pr-2">CTA</th>
                  <th className="py-2">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {data.productPerformance.map((p) => (
                  <tr key={p.courseId} className="border-b border-app/60">
                    <td className="py-2 pr-2 font-medium">{p.title}</td>
                    <td className="py-2 pr-2 tabular-nums">{formatNgn(p.revenueNgn)}</td>
                    <td className="py-2 pr-2 tabular-nums">{p.enrollments}</td>
                    <td className="py-2 pr-2 tabular-nums">{p.completionRate}%</td>
                    <td className="py-2 pr-2 tabular-nums">{p.salesPageViews}</td>
                    <td className="py-2 pr-2 tabular-nums">{p.ctaClicks}</td>
                    <td className="py-2 tabular-nums">{p.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-app bg-surface p-4">
        <h2 className="font-semibold">Revenue trend</h2>
        {data.revenueTrend.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No revenue in this range.</p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
            {data.revenueTrend.map((d) => (
              <li key={d.date} className="flex justify-between gap-4 border-b border-app/40 py-1">
                <span className="text-muted">{d.date}</span>
                <span className="tabular-nums font-medium">{formatNgn(d.revenueNgn)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
