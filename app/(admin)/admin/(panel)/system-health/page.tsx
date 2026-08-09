import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSystemHealthSnapshot, type HealthStatus } from "@/lib/system-health";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "System health" };
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<HealthStatus, string> = {
  operational: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  degraded: "bg-amber-50 text-amber-900 ring-amber-200",
  unavailable: "bg-rose-50 text-rose-800 ring-rose-200",
  unknown: "bg-slate-50 text-slate-700 ring-slate-200",
};

function StatusBadge({ status }: { status: HealthStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

export default async function AdminSystemHealthPage() {
  await requireAdmin();
  const { overall, components } = await getSystemHealthSnapshot();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System health</h1>
        <p className="mt-1 text-sm text-muted">
          Lightweight operational status for critical dependencies. Secrets are never shown.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <span className="text-sm text-muted">Overall</span>
        <StatusBadge status={overall} />
        <span className="text-xs text-muted">Checked {new Date().toISOString()}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Component</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Detail</th>
              <th className="px-4 py-3 font-medium">Last check</th>
            </tr>
          </thead>
          <tbody>
            {components.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{c.label}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="max-w-md px-4 py-3 text-muted">
                  {c.detail}
                  {c.lastFailure ? (
                    <div className="mt-1 text-xs text-rose-700">Last failure: {c.lastFailure}</div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                  {c.lastCheckedAt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
