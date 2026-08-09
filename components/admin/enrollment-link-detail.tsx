"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { AdminLoadingBanner } from "@/components/admin/admin-skeleton";
import {
  recallEnrollmentLinkUrl,
  rememberEnrollmentLinkUrl,
} from "@/lib/enrollment-links/client-url-cache";
import type {
  EnrollmentLink,
  EnrollmentLinkAccess,
  EnrollmentLinkRedirect,
  EnrollmentLinkRedemption,
  EnrollmentLinkStatus,
} from "@/types/database";
import type { EnrollmentLinkAnalytics } from "@/lib/enrollment-links/analytics-service";
import { Copy } from "lucide-react";

type CourseRow = {
  course_id: string;
};

export function EnrollmentLinkDetail({
  linkId,
  allCourses,
}: {
  linkId: string;
  allCourses: Array<{ id: string; title: string }>;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<EnrollmentLink | null>(null);
  const [redemptions, setRedemptions] = useState<EnrollmentLinkRedemption[]>([]);
  const [analytics, setAnalytics] = useState<EnrollmentLinkAnalytics | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [status, setStatus] = useState<EnrollmentLinkStatus>("active");
  const [accessType, setAccessType] = useState<EnrollmentLinkAccess>("public");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [redirectType, setRedirectType] = useState<EnrollmentLinkRedirect>("success_page");
  const [redirectCourseId, setRedirectCourseId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/enrollment-links/${linkId}?analytics=1`);
      const json = (await res.json()) as {
        error?: string;
        link?: EnrollmentLink;
        courses?: CourseRow[];
        redemptions?: EnrollmentLinkRedemption[];
        analytics?: EnrollmentLinkAnalytics;
      };
      if (!res.ok || !json.link) throw new Error(json.error ?? "Not found");
      setLink(json.link);
      setRedemptions(json.redemptions ?? []);
      setAnalytics(json.analytics ?? null);
      setName(json.link.name);
      setDescription(json.link.description ?? "");
      setCourseIds((json.courses ?? []).map((c) => c.course_id));
      setStatus(json.link.status);
      setAccessType(json.link.access_type);
      setMaxRedemptions(
        json.link.max_redemptions != null ? String(json.link.max_redemptions) : "",
      );
      setExpiresAt(
        json.link.expires_at
          ? new Date(json.link.expires_at).toISOString().slice(0, 16)
          : "",
      );
      setRedirectType(json.link.redirect_type);
      setRedirectCourseId(json.link.redirect_course_id ?? "");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }, [linkId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/enrollment-links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          name,
          description,
          courseIds,
          status,
          accessType,
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          redirectType,
          redirectCourseId: redirectType === "specific_course" ? redirectCourseId : null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast("Link saved");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function copyInviteUrl() {
    try {
      const cached = recallEnrollmentLinkUrl(linkId);
      if (cached) {
        await navigator.clipboard.writeText(cached);
        toast("Enrollment link copied");
        return;
      }
      const ok = confirm(
        "The full invite URL was only shown when this link was created.\n\nGenerate a new URL and copy it? The previous URL will stop working for new enrollments.",
      );
      if (!ok) return;
      const res = await fetch(`/api/admin/enrollment-links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate_token" }),
      });
      const json = (await res.json()) as { error?: string; url?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Could not generate invite URL.");
      rememberEnrollmentLinkUrl(linkId, json.url);
      await navigator.clipboard.writeText(json.url);
      toast("New enrollment link copied");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Copy failed", "error");
    }
  }

  if (loading || !link) {
    return (
      <div className="space-y-4">
        <AdminLoadingBanner message="Loading enrollment link…" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/enrollment-links" className="text-sm text-muted hover:text-brand">
            ← Enrollment Links
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{link.name}</h1>
          <p className="text-sm text-muted">
            Prefix {link.token_prefix}… · {link.current_redemptions} redemptions
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void copyInviteUrl()}>
          <Copy className="h-4 w-4" /> Copy link
        </Button>
      </div>

      {analytics ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Visits", analytics.visits],
            ["Enrollments", analytics.redemptionSuccess],
            ["Conversion", `${Math.round(analytics.conversionRate * 100)}%`],
            [
              "Slots left",
              analytics.remainingSlots == null ? "∞" : analytics.remainingSlots,
            ],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-app bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
              <div className="mt-1 text-2xl font-bold">{value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-app bg-white p-6">
          <h2 className="font-semibold">Settings</h2>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as EnrollmentLinkStatus)}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="expired">Expired</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="access">Access</Label>
            <Select
              id="access"
              value={accessType}
              onChange={(e) => setAccessType(e.target.value as EnrollmentLinkAccess)}
            >
              <option value="public">Public</option>
              <option value="imported_students">Imported students</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="max">Max redemptions</Label>
            <Input
              id="max"
              type="number"
              min={1}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <div>
            <Label htmlFor="expires">Expires</Label>
            <Input
              id="expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="redirect">Redirect</Label>
            <Select
              id="redirect"
              value={redirectType}
              onChange={(e) => setRedirectType(e.target.value as EnrollmentLinkRedirect)}
            >
              <option value="success_page">Success page</option>
              <option value="first_course">First course</option>
              <option value="dashboard">Dashboard</option>
              <option value="specific_course">Specific course</option>
            </Select>
          </div>
          {redirectType === "specific_course" ? (
            <div>
              <Label htmlFor="rc">Redirect course</Label>
              <Select
                id="rc"
                value={redirectCourseId}
                onChange={(e) => setRedirectCourseId(e.target.value)}
              >
                <option value="">Select…</option>
                {courseIds.map((id) => {
                  const c = allCourses.find((x) => x.id === id);
                  return (
                    <option key={id} value={id}>
                      {c?.title ?? id}
                    </option>
                  );
                })}
              </Select>
            </div>
          ) : null}
          <div>
            <Label>Courses</Label>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-app p-2">
              {allCourses.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={courseIds.includes(c.id)}
                    onChange={() =>
                      setCourseIds((prev) =>
                        prev.includes(c.id)
                          ? prev.filter((x) => x !== c.id)
                          : [...prev, c.id],
                      )
                    }
                  />
                  {c.title}
                </label>
              ))}
            </div>
          </div>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-app bg-white p-6">
            <h2 className="font-semibold">Recent redemptions</h2>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
              {redemptions.length === 0 ? (
                <p className="text-muted">No redemptions yet.</p>
              ) : (
                redemptions.map((r) => (
                  <div key={r.id} className="rounded-lg border border-app px-3 py-2">
                    <div className="font-medium">{r.email}</div>
                    <div className="text-xs text-muted">
                      {new Date(r.redeemed_at).toLocaleString()}
                      {r.country ? ` · ${r.country}` : ""}
                      {r.device ? ` · ${r.device}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {analytics && (analytics.countries.length > 0 || analytics.devices.length > 0) ? (
            <div className="rounded-xl border border-app bg-white p-6 text-sm">
              <h2 className="font-semibold">Audience</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase text-muted">Countries</div>
                  <ul className="mt-1 space-y-1">
                    {analytics.countries.map((c) => (
                      <li key={c.country}>
                        {c.country}: {c.count}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted">Devices</div>
                  <ul className="mt-1 space-y-1">
                    {analytics.devices.map((d) => (
                      <li key={d.device}>
                        {d.device}: {d.count}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
