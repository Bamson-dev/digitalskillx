"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { AuthorityArticleListItem } from "@/lib/content-factory/authority-shared";

type Summary = {
  total: number;
  idea: number;
  qualified: number;
  review: number;
  approved: number;
  published: number;
  failed: number;
  stale: number;
  caps: {
    opportunitiesPerPath: number;
    generationPerRun: number;
    aiCallsPerRun: number;
  };
};

type PublishedPath = { id: string; title: string; slug: string; category: string };

export function OrganicAuthorityPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [articles, setArticles] = useState<AuthorityArticleListItem[]>([]);
  const [publishedPaths, setPublishedPaths] = useState<PublishedPath[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [schemaReady, setSchemaReady] = useState(true);
  const [pathId, setPathId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/content-factory/authority", { credentials: "include" });
      const json = (await res.json()) as {
        error?: string;
        articles?: AuthorityArticleListItem[];
        publishedPaths?: PublishedPath[];
        summary?: Summary;
        schemaReady?: boolean;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load authority queue.");
      setArticles(json.articles ?? []);
      setPublishedPaths(json.publishedPaths ?? []);
      setSummary(json.summary ?? null);
      setSchemaReady(json.schemaReady !== false);
      if (!pathId && json.publishedPaths?.[0]?.id) setPathId(json.publishedPaths[0].id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load authority queue.", "error");
    } finally {
      setLoading(false);
    }
  }, [pathId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return articles.filter((row) => {
      if (pathId && row.learning_path_id !== pathId) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (typeFilter !== "all" && row.content_type !== typeFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      return true;
    });
  }, [articles, pathId, statusFilter, typeFilter, categoryFilter]);

  const categories = useMemo(
    () => Array.from(new Set(articles.map((row) => row.category).filter(Boolean))).sort(),
    [articles],
  );

  const reviewArticle = selectedReviewId
    ? articles.find((row) => row.id === selectedReviewId) ?? null
    : filtered.find((row) => row.status === "review") ?? null;

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    const key = `${action}:${String(extra.articleId ?? extra.pathId ?? pathId)}`;
    setBusy(key);
    try {
      const res = await fetch("/api/admin/content-factory/authority", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, pathId, ...extra }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Authority action failed.");
      toast("Authority action completed.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Authority action failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !summary) {
    return <p className="text-sm text-muted">Loading Organic Content Authority…</p>;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-app p-4">
      <div>
        <h2 className="text-lg font-semibold">Organic Content Authority</h2>
        <p className="mt-1 text-sm text-muted">
          Supporting guides around published learning paths. AI proposes and drafts. Humans approve.
          Nothing publishes automatically. Public pages never call DeepSeek.
        </p>
      </div>

      {!schemaReady ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Authority tables are not enabled yet. Apply{" "}
          <code className="rounded bg-white px-1">sql/apply-organic-authority-content.sql</code> when
          authorized. Migration file exists as{" "}
          <code className="rounded bg-white px-1">0045_organic_authority_content.sql</code> (not applied).
        </p>
      ) : null}

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Ideas" value={String(summary.idea)} />
          <Stat label="Qualified" value={String(summary.qualified)} />
          <Stat label="Review" value={String(summary.review)} />
          <Stat label="Approved" value={String(summary.approved)} />
          <Stat label="Published" value={String(summary.published)} />
          <Stat label="Failed / rejected" value={String(summary.failed)} />
          <Stat label="Stale proposals" value={String(summary.stale)} />
          <Stat
            label="Caps / run"
            value={`${summary.caps.generationPerRun} gen · ${summary.caps.aiCallsPerRun} AI`}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Learning path</span>
          <select
            className="min-h-[40px] min-w-[220px] rounded-lg border border-app bg-white px-2"
            value={pathId}
            onChange={(e) => setPathId(e.target.value)}
          >
            <option value="">All paths</option>
            {publishedPaths.map((path) => (
              <option key={path.id} value={path.id}>
                {path.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Status</span>
          <select
            className="min-h-[40px] rounded-lg border border-app bg-white px-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {[
              "all",
              "idea",
              "qualified",
              "generating",
              "review",
              "approved",
              "published",
              "rejected",
              "failed",
            ].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Type</span>
          <select
            className="min-h-[40px] rounded-lg border border-app bg-white px-2"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">all</option>
            {[
              "guide",
              "tutorial",
              "explainer",
              "study_notes",
              "lesson_summary",
              "faq",
              "glossary",
              "practical_example",
              "common_mistakes",
              "comparison",
              "prerequisites",
              "next_steps",
            ].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Category</span>
          <select
            className="min-h-[40px] rounded-lg border border-app bg-white px-2"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">all</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!pathId || busy != null}
          onClick={() => void runAction("generate_opportunities")}
        >
          Generate opportunities
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!pathId || busy != null}
          onClick={() => void runAction("qualify")}
        >
          Qualify opportunities
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!pathId || busy != null}
          onClick={() => void runAction("generate")}
        >
          Generate selected (bounded)
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy != null}
          onClick={() => void runAction("mark_stale")}
        >
          Propose stale refresh
        </Button>
      </div>

      {reviewArticle ? (
        <div className="space-y-3 rounded-xl border border-app p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">Review</h3>
              <p className="text-sm text-muted">
                {reviewArticle.content_type} · {reviewArticle.target_intent} ·{" "}
                {reviewArticle.target_audience}
              </p>
            </div>
            <p className="text-sm">
              QC {reviewArticle.quality_score ?? "—"} · Opportunity {reviewArticle.opportunity_score}
            </p>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Title</dt>
              <dd>{reviewArticle.title}</dd>
            </div>
            <div>
              <dt className="text-muted">Slug</dt>
              <dd>{reviewArticle.slug}</dd>
            </div>
            <div>
              <dt className="text-muted">Learning path</dt>
              <dd>
                {reviewArticle.path_title ? (
                  <Link href={`/learn/${reviewArticle.path_slug}`} className="text-brand hover:underline">
                    {reviewArticle.path_title}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">SEO</dt>
              <dd>
                {reviewArticle.seo_title || "—"}
                <br />
                <span className="text-muted">{reviewArticle.seo_description || "—"}</span>
              </dd>
            </div>
          </dl>
          {reviewArticle.related_lesson_titles?.length ? (
            <p className="text-sm text-muted">
              Related lessons: {reviewArticle.related_lesson_titles.join(", ")}
            </p>
          ) : null}
          {reviewArticle.quality_issues?.length ? (
            <ul className="space-y-1 text-sm">
              {reviewArticle.quality_issues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`} className="text-muted">
                  [{issue.severity}] {issue.field}: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          {reviewArticle.internal_links?.length ? (
            <p className="text-sm text-muted">
              Internal links:{" "}
              {reviewArticle.internal_links.map((link) => `${link.label} (${link.href})`).join(" · ")}
            </p>
          ) : null}
          {reviewArticle.source_urls?.length ? (
            <p className="text-sm text-muted">Sources: {reviewArticle.source_urls.join(" · ")}</p>
          ) : null}
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-xs">
            {reviewArticle.body_md || "(empty draft)"}
          </pre>
          <div className="flex flex-wrap gap-2">
            {reviewArticle.status === "review" ? (
              <Button
                type="button"
                disabled={busy != null}
                onClick={() => void runAction("approve", { articleId: reviewArticle.id })}
              >
                Approve
              </Button>
            ) : null}
            {reviewArticle.status === "approved" ? (
              <Button
                type="button"
                disabled={busy != null}
                onClick={() => void runAction("publish", { articleId: reviewArticle.id })}
              >
                Publish (after approval)
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={busy != null}
              onClick={() =>
                void runAction("reject", {
                  articleId: reviewArticle.id,
                  reason: "Rejected from authority review",
                })
              }
            >
              Reject
            </Button>
            {reviewArticle.learning_path_id ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy != null}
                onClick={() =>
                  void runAction("retry", {
                    pathId: reviewArticle.learning_path_id,
                    articleId: reviewArticle.id,
                  })
                }
              >
                Retry
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold">Authority queue ({filtered.length})</h3>
        {filtered.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No authority content for these filters yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {filtered.slice(0, 60).map((row) => (
              <li key={row.id} className="rounded-xl border border-app p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      className="text-left font-medium hover:text-brand"
                      onClick={() => setSelectedReviewId(row.id)}
                    >
                      {row.title}
                    </button>
                    <p className="text-xs text-muted">
                      {row.status}
                      {row.stale ? " · stale" : ""} · {row.content_type} · {row.target_intent} · score{" "}
                      {row.opportunity_score}
                      {row.quality_score != null ? ` · QC ${row.quality_score}` : ""}
                      {row.path_title ? ` · ${row.path_title}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.status === "review" ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy != null}
                        onClick={() => void runAction("approve", { articleId: row.id })}
                      >
                        Approve
                      </Button>
                    ) : null}
                    {row.status === "approved" ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy != null}
                        onClick={() => void runAction("publish", { articleId: row.id })}
                      >
                        Publish
                      </Button>
                    ) : null}
                    {row.status === "published" ? (
                      <Link href={`/guides/${row.slug}`} className="text-brand hover:underline">
                        Public
                      </Link>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy != null}
                      onClick={() =>
                        void runAction("reject", {
                          articleId: row.id,
                          reason: "Rejected from authority queue",
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>
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
    <div className="rounded-xl bg-neutral-50 px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
