import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { ManualTrackPurchaseForm } from "@/components/admin/manual-track-purchase-form";
import { listManualTrackedPurchases } from "@/lib/manual-purchase-tracking";

export const metadata: Metadata = { title: "Manual purchase tracking" };
export const dynamic = "force-dynamic";

export default async function ManualTrackPurchasePage() {
  await requireAdmin();
  const history = await listManualTrackedPurchases(10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manual purchase tracking</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Paste the buyer’s email and click Track. They get enrolled into{" "}
          <span className="font-medium text-ink">Build And Monetize Your Software With AI</span>{" "}
          and Stape + Meta purchase events fire automatically (amount, product, and reference are
          defaults).
        </p>
      </div>

      <Card>
        <CardHeader title="Track a purchase" />
        <ManualTrackPurchaseForm />
      </Card>

      <Card>
        <CardHeader title="Recent manual tracks" />
        {history.length === 0 ? (
          <p className="text-sm text-muted">No manually tracked purchases yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={`${row.reference}-${row.trackedAt}`} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{row.email}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.reference}</td>
                    <td className="py-2 pr-3">₦{row.amount.toLocaleString("en-NG")}</td>
                    <td className="py-2 text-muted">
                      {new Date(row.trackedAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
