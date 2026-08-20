"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { DetectedCta, LandingImportReport } from "@/lib/landing-import/constants";

type CourseOption = { id: string; title: string };
type PageListItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  source_url: string;
  destination_url: string | null;
  published_at: string | null;
  import_error: string | null;
};

type PageDetail = PageListItem & {
  draft_html: string;
  draft_css: string;
  cta_map: DetectedCta[];
  import_report: LandingImportReport;
  destination_type: string;
  destination_course_id: string | null;
};

export function LandingPagesPanel({ courses }: { courses: CourseOption[] }) {
  const [pages, setPages] = useState<PageListItem[]>([]);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [active, setActive] = useState<PageDetail | null>(null);
  const [report, setReport] = useState<LandingImportReport | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/landing-pages", { credentials: "include", cache: "no-store" });
    const json = (await res.json()) as {
      pages?: PageListItem[];
      migrationRequired?: boolean;
      error?: string;
    };
    if (json.migrationRequired) setMigrationRequired(true);
    if (Array.isArray(json.pages)) setPages(json.pages);
    if (json.error && !json.migrationRequired) setError(json.error);
  }, []);

  useEffect(() => {
    void refresh();
    // Retry once — first paint can race session cookies after admin login redirect.
    const t = window.setTimeout(() => {
      void refresh();
    }, 750);
    return () => window.clearTimeout(t);
  }, [refresh]);

  async function importPage() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setReport(null);
    try {
      const res = await fetch("/api/admin/landing-pages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl,
          slug,
          destinationType: "course_checkout",
          destinationCourseId: courseId,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        pageId?: string;
        report?: LandingImportReport;
        ctas?: DetectedCta[];
      };
      if (!res.ok) {
        setError(json.error ?? "Import failed.");
        return;
      }
      setReport(json.report ?? null);
      setMessage("Import complete. Review CTAs and preview before publishing.");
      await refresh();
      if (json.pageId) await openPage(json.pageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function openPage(id: string) {
    const res = await fetch(`/api/admin/landing-pages/${id}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as { page?: PageDetail; error?: string };
    if (!res.ok || !json.page) {
      setError(json.error ?? "Could not load page.");
      return;
    }
    setActive(json.page);
    setReport(json.page.import_report ?? null);
  }

  async function patch(action: string, extra?: Record<string, unknown>) {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/landing-pages/${active.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Update failed.");
        return;
      }
      setMessage(action === "publish" ? "Published. Live at /p/" + active.slug : "Updated.");
      await openPage(active.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function toggleCta(id: string) {
    if (!active) return;
    const ctas = (active.cta_map ?? []).map((c) =>
      c.id === id ? { ...c, rewrite: !c.rewrite } : c,
    );
    setActive({ ...active, cta_map: ctas });
  }

  if (migrationRequired) {
    return (
      <Card>
        <CardHeader
          title="Migration required"
          description="Apply supabase/migrations/0047_imported_landing_pages.sql in the Supabase SQL editor before using URL landing imports."
        />
      </Card>
    );
  }

  const previewDoc = active
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${active.draft_css ?? ""}</style></head><body>${active.draft_html ?? ""}</body></html>`
    : "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Import from URL"
          description="Paste a public landing-page URL. DigitalSkillX imports the visual HTML, mirrors safe images, strips scripts, and rewrites conversion CTAs to your course checkout. Nothing goes public until you publish."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="source_url">Landing page URL</Label>
            <Input
              id="source_url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://example.com/offer"
            />
          </div>
          <div>
            <Label htmlFor="slug">DigitalSkillX slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="ai-money-code-offer"
            />
            <p className="mt-1 text-xs text-muted">Public URL will be /p/{slug || "your-slug"}</p>
          </div>
          <div>
            <Label htmlFor="course">Checkout destination (course)</Label>
            <select
              id="course"
              className="h-10 w-full rounded-lg border border-app bg-card px-3 text-sm"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              {courses.length === 0 ? <option value="">No courses</option> : null}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <Button type="button" disabled={busy || !sourceUrl || !slug || !courseId} onClick={() => void importPage()}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </div>
        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}
        {message ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}
      </Card>

      {report ? (
        <Card>
          <CardHeader title="Import report" description={report.title || "Untitled"} />
          <ul className="space-y-1 text-sm text-muted">
            <li>
              Assets: {report.assetsImported} imported · {report.assetsFailed} failed ·{" "}
              {report.assetsBlocked} blocked · {report.assetsSkipped} skipped
            </li>
            <li>
              Stylesheets inlined: {report.stylesheetsInlined}
            </li>
            <li>
              CTAs: {report.ctasMarkedConversion}/{report.ctasDetected} marked for checkout rewrite
            </li>
            {report.warnings.slice(0, 8).map((w) => (
              <li key={w}>Warning: {w}</li>
            ))}
            {report.blocked.slice(0, 5).map((w) => (
              <li key={w}>Blocked: {w}</li>
            ))}
            {report.unsupported.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {active ? (
        <Card>
          <CardHeader
            title={active.title || active.slug}
            description={`Status: ${active.status} · Source: ${active.source_url}`}
          />
          <div className="mb-4 flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void patch("publish")}>
              Publish
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void patch("unpublish")}>
              Unpublish
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void patch("update_ctas", {
                  ctas: active.cta_map,
                  destinationUrl: active.destination_url,
                })
              }
            >
              Save CTA mapping
            </Button>
            {active.status === "published" ? (
              <Link className="text-sm font-semibold text-brand underline" href={`/p/${active.slug}`} target="_blank">
                Open live page
              </Link>
            ) : null}
          </div>

          <div className="mb-4 space-y-2">
            <p className="text-sm font-semibold">CTA review</p>
            <p className="text-xs text-muted">
              Button text stays the same. Toggle which links should go to DigitalSkillX checkout.
            </p>
            {(active.cta_map ?? []).slice(0, 40).map((cta) => (
              <label key={cta.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={cta.rewrite} onChange={() => toggleCta(cta.id)} />
                <span>
                  <span className="font-medium">{cta.text}</span>
                  <span className="block text-xs text-muted">
                    {cta.kind} · {cta.originalHref}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <p className="mb-2 text-sm font-semibold">Preview (as DigitalSkillX will serve it)</p>
          <iframe
            title="Landing preview"
            srcDoc={previewDoc}
            className="h-[70vh] w-full rounded-lg border border-app"
            sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Imported pages" description="Draft and review pages stay private until publish." />
        <ul className="divide-y divide-app text-sm">
          {pages.length === 0 ? <li className="py-3 text-muted">No imports yet.</li> : null}
          {pages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-semibold">{p.title || p.slug}</p>
                <p className="text-xs text-muted">
                  /p/{p.slug} · {p.status}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => void openPage(p.id)}>
                Review
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
