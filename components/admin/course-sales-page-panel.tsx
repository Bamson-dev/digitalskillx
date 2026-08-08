"use client";

import { useEffect, useState } from "react";
import { SalesPageView } from "@/components/marketplace/sales-page-view";
import type { ImportReport, SalesPageRow, SalesPageSchema } from "@/lib/sales-pages/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type CoursePreview = {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  price_ngn: number;
  price_usd: number;
  learning_outcomes: string[];
  instructor_name: string | null;
  instructor_bio: string | null;
  modules: Array<{
    id: string;
    title: string;
    position: number;
    lessons: Array<{ id: string; title: string; position: number; lesson_type: string }>;
  }>;
};

export function CourseSalesPagePanel({ course }: { course: CoursePreview }) {
  const { toast } = useToast();
  const [page, setPage] = useState<SalesPageRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">("desktop");
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sales-pages/${course.id}`, { credentials: "include" });
      const json = (await res.json()) as { page?: SalesPageRow | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load sales page.");
      setPage(json.page ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id]);

  async function createPage() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sales-pages/${course.id}`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { page?: SalesPageRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Create failed.");
      setPage(json.page ?? null);
      toast("Sales page created (draft).", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Create failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(kind: "json" | "zip", file: File) {
    setBusy(true);
    setReport(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/sales-pages/${course.id}/import/${kind}`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const json = (await res.json()) as {
        report?: ImportReport;
        salesPageId?: string;
        error?: string;
      };
      if (!res.ok && !json.report) throw new Error(json.error ?? "Import failed.");
      if (json.report) setReport(json.report);
      await refresh();
      toast(
        json.report?.status === "failed" ? "Import failed — see report." : "Import complete — review draft.",
        json.report?.status === "failed" ? "error" : "success",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!page) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sales-pages/${course.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: page.draft_schema, title: page.title }),
      });
      const json = (await res.json()) as { page?: SalesPageRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      setPage(json.page ?? null);
      toast("Draft saved.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function publish(action: "publish" | "unpublish") {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sales-pages/${course.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { page?: SalesPageRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? `${action} failed.`);
      setPage(json.page ?? null);
      toast(action === "publish" ? "Sales page published." : "Sales page unpublished.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  const schema: SalesPageSchema | null = page?.draft_schema ?? null;

  return (
    <details className="group rounded-xl border border-dashed border-app bg-white open:shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4 font-semibold marker:content-none">
        <span className="flex items-center justify-between gap-2">
          Sales Page
          <span className="text-sm font-normal text-muted">
            {page ? `Status: ${page.status}` : "Not created"}
          </span>
        </span>
        <p className="mt-0.5 text-sm font-normal text-muted">
          Import WordPress JSON/ZIP, preview, and publish a conversion page for this course. Uses existing
          checkout.
        </p>
      </summary>
      <div className="space-y-4 border-t border-app px-5 pb-5 pt-4">
        {loading ? <p className="text-sm text-muted">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!page && !loading ? (
          <Button type="button" onClick={() => void createPage()} disabled={busy}>
            Create Sales Page
          </Button>
        ) : null}

        {page ? (
          <>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-app px-3 py-2 text-sm">
                Import JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importFile("json", f);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-app px-3 py-2 text-sm">
                Import ZIP
                <input
                  type="file"
                  accept="application/zip,.zip"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importFile("zip", f);
                    e.target.value = "";
                  }}
                />
              </label>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void saveDraft()}>
                Save Draft
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? "Hide Preview" : "Preview"}
              </Button>
              {page.status === "published" ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void publish("unpublish")}>
                  Unpublish
                </Button>
              ) : (
                <Button type="button" disabled={busy} onClick={() => void publish("publish")}>
                  Publish
                </Button>
              )}
            </div>

            <p className="text-xs text-muted">
              Draft v{page.draft_version}
              {page.published_version > 0 ? ` · Published v${page.published_version}` : " · Not published"}
              {" · "}
              Editing draft does not change the live published page until you click Publish.
            </p>

            {report ? (
              <div className="rounded-lg border border-app bg-neutral-50 p-4 text-sm">
                <p className="font-semibold">Import report</p>
                <ul className="mt-2 space-y-1 text-muted">
                  <li>
                    Format: {report.sourceFormat} ({report.sourceType})
                  </li>
                  <li>
                    Sections: {report.sectionsImported}/{report.sectionsDetected}
                  </li>
                  <li>
                    Assets: {report.assetsImported} imported · {report.assetsFailed} failed ·{" "}
                    {report.assetsDetected} detected
                  </li>
                  <li>
                    CTAs: {report.ctaConverted}/{report.ctaDetected} converted to DigitalSkillX purchase
                  </li>
                  <li>Status: {report.status}</li>
                </ul>
                {report.missingAssets.length > 0 ? (
                  <div className="mt-3">
                    <p className="font-medium text-amber-800">Missing assets ({report.missingAssets.length})</p>
                    <ul className="mt-1 list-disc pl-5 text-amber-900">
                      {report.missingAssets.slice(0, 8).map((m, i) => (
                        <li key={i}>
                          {m.url ? `${m.url} — ` : ""}
                          {m.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {report.unsupportedElements.length > 0 ? (
                  <div className="mt-3">
                    <p className="font-medium text-amber-800">
                      Unsupported ({report.unsupportedElements.length})
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {report.unsupportedElements.slice(0, 8).map((u, i) => (
                        <li key={i}>
                          {u.type ? `${u.type}: ` : ""}
                          {u.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {report.errors.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-red-700">
                    {report.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {showPreview && schema ? (
              <div className="space-y-3 rounded-lg border border-app p-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={previewViewport === "desktop" ? "primary" : "outline"}
                    onClick={() => setPreviewViewport("desktop")}
                  >
                    Desktop
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={previewViewport === "mobile" ? "primary" : "outline"}
                    onClick={() => setPreviewViewport("mobile")}
                  >
                    Mobile
                  </Button>
                </div>
                <div className="max-h-[70vh] overflow-auto bg-white">
                  <SalesPageView
                    course={course}
                    schema={schema}
                    isEnrolled={false}
                    isLoggedIn={false}
                    preview
                    previewViewport={previewViewport}
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </details>
  );
}
