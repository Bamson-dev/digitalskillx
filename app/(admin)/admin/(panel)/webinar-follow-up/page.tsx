import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { listWebinarCampaigns } from "@/lib/webinar-followup/store";
import { resendConfigured } from "@/lib/email/providers/resend";

export const metadata: Metadata = { title: "Webinar Follow-Up" };
export const dynamic = "force-dynamic";

export default async function WebinarFollowUpIndexPage() {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const { migrationRequired, campaigns } = await listWebinarCampaigns(admin);
  const resendReady = resendConfigured();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webinar Follow-Up</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Standalone post-WebinarJam email campaigns. Separate from LMS students, course
          enrollments, and the AI Money Code campaign. Contacts are identified by email only.
        </p>
      </div>

      {!resendReady ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Resend is not configured. Campaign sends will fail until the email provider is ready.
        </p>
      ) : null}

      {migrationRequired ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Migration <code>0048_webinar_followup_campaigns.sql</code> has not been applied yet.
          Apply it locally or on staging before using this feature. Do not activate campaigns
          without explicit approval.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Contacts</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Today</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-muted">
                  No campaigns yet. Apply migration 0048 to seed the first draft campaign.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{c.name}</div>
                    <div className="text-xs text-muted">{c.slug}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{c.status}</td>
                  <td className="px-4 py-3">{c.counts.total}</td>
                  <td className="px-4 py-3">{c.counts.active}</td>
                  <td className="px-4 py-3">{c.counts.sent}</td>
                  <td className="px-4 py-3">
                    {c.status === "active" && c.counts.dueNow === 0 && (c.counts.sending ?? 0) === 0 ? (
                      <span className="font-medium text-emerald-700">
                        Sent ({c.counts.sentToday})
                      </span>
                    ) : c.status === "active" && c.counts.dueNow > 0 ? (
                      <span className="font-medium text-amber-800">
                        Sending {c.counts.sentToday} / {c.counts.dueNow} due
                      </span>
                    ) : (
                      c.counts.sentToday
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/webinar-follow-up/${c.id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
