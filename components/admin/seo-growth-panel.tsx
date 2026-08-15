"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { SeoDashboardSummary, SeoQueueRow } from "@/lib/content-factory/seo-shared";

export function SeoGrowthPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rows, setRows] = useState<SeoQueueRow[]>([]);
  const [summary, setSummary] = useState<SeoDashboardSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/content-factory/seo", { credentials: "include" });
      const json = (await res.json()) as {
        error?: string;
        rows?: SeoQueueRow[];
        summary?: SeoDashboardSummary;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load SEO queue.");
      setRows(json.rows ?? []);
      setSummary(json.summary ?? null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load SEO queue.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(pathId: string, action: string) {
    setBusyId(pathId);
    try {
      const res = await fetch("/api/admin/content-factory/seo", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathId, action }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "SEO action failed.");
      toast(
        action === "apply" || action === "approve_and_apply"
          ? "SEO metadata applied. Publication status was not changed."
          : "SEO suggestion updated.",
        "success",
      );
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "SEO action failed.", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !summary) {
    return <p className="text-sm text-muted">Loading SEO growth queue…</p>;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-app p-4">
      <div>
        <h2 className="text-lg font-semibold">SEO Growth Engine</h2>
        <p className="mt-1 text-sm text-muted">
          AI suggests. Humans approve. Nothing publishes automatically. Public pages never call DeepSeek
          or YouTube APIs.
        </p>
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="SEO health" value={`${summary.healthScore}/100`} />
          <Stat label="Indexed-ready paths" value={String(summary.indexedReady)} />
          <Stat label="Missing descriptions" value={String(summary.missingDescriptions)} />
          <Stat label="Duplicate titles" value={String(summary.duplicateTitles)} />
          <Stat label="Needs review" value={String(summary.needsReview)} />
          <Stat label="Suggested" value={String(summary.suggested)} />
          <Stat label="Weak internal links" value={String(summary.weakInternalLinks)} />
          <Stat
            label="Category hubs needing content"
            value={String(summary.categoryHubsNeedingContent)}
          />
        </div>
      ) : null}

      {summary ? (
        <div className="rounded-xl bg-neutral-50 p-3 text-sm">
          <p className="font-medium">Google Search Console</p>
          <p className="mt-1 text-muted">
            Status: <span className="font-semibold text-neutral-900">{summary.searchConsole.label}</span>
          </p>
          {!summary.searchConsole.connected ? (
            <p className="mt-1 text-xs text-muted">
              Foundation only. No fabricated impressions/clicks. Connect later with{" "}
              <code className="rounded bg-white px-1">GOOGLE_SEARCH_CONSOLE_CONNECTED=true</code> and
              site URL when ready.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">Site: {summary.searchConsole.siteUrl}</p>
          )}
        </div>
      ) : null}

      {summary?.categoryCoverage?.length ? (
        <div>
          <h3 className="text-sm font-semibold">Category coverage</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {summary.categoryCoverage.map((row) => (
              <li key={row.id} className="rounded-lg border border-app px-3 py-2 text-sm">
                <span className="font-medium">{row.label}</span>
                <span className="text-muted">
                  {" "}
                  · {row.published} published · {row.hubReady ? "hub ready" : "needs more content"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold">SEO improvement queue</h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No learning paths available yet.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {rows.slice(0, 40).map((row) => (
              <li key={row.id} className="space-y-2 rounded-xl border border-app p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.title}</p>
                    <p className="text-xs text-muted">
                      {row.status} · SEO {row.seo_score}/100 · Opportunity {row.opportunity_score}/100 ·{" "}
                      {row.queue_status}
                      {row.status === "published" ? (
                        <>
                          {" · "}
                          <Link href={`/learn/${row.slug}`} className="text-brand hover:underline">
                            Public page
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <p className="text-xs text-muted">
                    {row.lesson_count} lessons
                    {row.creator_name ? ` · ${row.creator_name}` : ""}
                  </p>
                </div>
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Current SEO title</dt>
                    <dd className="break-words">{row.seo_title || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Suggested SEO title</dt>
                    <dd className="break-words">{row.suggested_seo_title || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Current SEO description</dt>
                    <dd className="break-words">{row.seo_description || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Suggested SEO description</dt>
                    <dd className="break-words">{row.suggested_seo_description || "—"}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted">
                  Intent: {row.search_intent.join(", ") || "—"}
                  {row.primary_topic ? ` · Topic: ${row.primary_topic}` : ""}
                </p>
                {row.reasons.length ? (
                  <p className="text-xs text-neutral-700">Why: {row.reasons.slice(0, 3).join(" · ")}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void runAction(row.id, "suggest")}
                  >
                    {busyId === row.id ? "Working…" : "Generate suggestion"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyId === row.id || !row.suggested_seo_title}
                    onClick={() => void runAction(row.id, "approve")}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyId === row.id || row.queue_status !== "approved"}
                    onClick={() => void runAction(row.id, "apply")}
                  >
                    Apply to public metadata
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyId === row.id || !row.suggested_seo_title}
                    onClick={() => void runAction(row.id, "approve_and_apply")}
                  >
                    Approve &amp; apply
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyId === row.id}
                    onClick={() => void runAction(row.id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
