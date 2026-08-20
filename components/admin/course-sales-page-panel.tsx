"use client";

import { useEffect, useState } from "react";
import { SalesPageView } from "@/components/marketplace/sales-page-view";
import type {
  SalesPageRow,
  SalesPageSchema,
  SalesPageSection,
  SalesPageSeo,
  SalesPageSectionType,
  SalesPageVersionRow,
} from "@/lib/sales-pages/types";
import { createDefaultSection, newSectionId, validateSalesPageForPublish } from "@/lib/sales-pages/schema";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { SectionLibrary, SectionToolbar } from "@/components/admin/sales-page/section-library";
import { SectionEditor } from "@/components/admin/sales-page/section-editor";

type Tab =
  | "overview"
  | "builder"
  | "design"
  | "seo"
  | "checkout"
  | "preview"
  | "versions"
  | "publish";

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

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "builder", label: "Builder" },
  { id: "design", label: "Design" },
  { id: "seo", label: "SEO" },
  { id: "checkout", label: "Checkout" },
  { id: "preview", label: "Preview" },
  { id: "versions", label: "Versions" },
  { id: "publish", label: "Publish" },
];

export function CourseSalesPagePanel({ course }: { course: CoursePreview }) {
  const { toast } = useToast();
  const [page, setPage] = useState<SalesPageRow | null>(null);
  const [draft, setDraft] = useState<SalesPageSchema | null>(null);
  const [seo, setSeo] = useState<SalesPageSeo>({});
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [tab, setTab] = useState<Tab>("overview");
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<SalesPageVersionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sales-pages/${course.id}`, { credentials: "include" });
      const json = (await res.json()) as { page?: SalesPageRow | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load sales page.");
      const p = json.page ?? null;
      setPage(p);
      setDraft(p?.draft_schema ?? null);
      setSeo(p?.seo ?? {});
      setTitle(p?.title ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  async function loadVersions() {
    const res = await fetch(`/api/admin/sales-pages/${course.id}/versions`, { credentials: "include" });
    if (!res.ok) return;
    const json = (await res.json()) as { versions?: SalesPageVersionRow[] };
    setVersions(json.versions ?? []);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id]);

  useEffect(() => {
    if (tab === "versions" && page) void loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page?.id]);

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
      setDraft(json.page?.draft_schema ?? null);
      setSeo(json.page?.seo ?? {});
      setTitle(json.page?.title ?? "");
      toast("Sales page created (draft).", "success");
      setTab("builder");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Create failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(next?: { schema?: SalesPageSchema; seo?: SalesPageSeo; title?: string }) {
    if (!page) return;
    setBusy(true);
    setSaveState("saving");
    try {
      const res = await fetch(`/api/admin/sales-pages/${course.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: next?.schema ?? draft,
          seo: next?.seo ?? seo,
          title: next?.title ?? title,
        }),
      });
      const json = (await res.json()) as { page?: SalesPageRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      setPage(json.page ?? null);
      setDraft(json.page?.draft_schema ?? null);
      setSeo(json.page?.seo ?? {});
      setTitle(json.page?.title ?? "");
      setSaveState("saved");
      toast("Draft saved.", "success");
      window.setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      setSaveState("failed");
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function patchAction(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sales-pages/${course.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = (await res.json()) as { page?: SalesPageRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? `${action} failed.`);
      setPage(json.page ?? null);
      setDraft(json.page?.draft_schema ?? null);
      setSeo(json.page?.seo ?? {});
      setTitle(json.page?.title ?? "");
      toast(
        action === "publish"
          ? "Sales page published."
          : action === "unpublish"
            ? "Sales page unpublished."
            : "Draft restored.",
        "success",
      );
      if (action.startsWith("restore")) setTab("builder");
      if (action === "publish" || action === "unpublish") void loadVersions();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file: File): Promise<string | null> {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/sales-pages/${course.id}/assets`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const json = (await res.json()) as { assetId?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      toast("Image uploaded.", "success");
      return json.assetId ?? null;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed.", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function updateSections(sections: SalesPageSection[]) {
    if (!draft) return;
    setDraft({ ...draft, sections });
  }

  function addSection(type: SalesPageSectionType) {
    if (!draft) return;
    const section = createDefaultSection(type);
    updateSections([...draft.sections, section]);
    setExpandedId(section.id);
  }

  function moveSection(from: number, to: number) {
    if (!draft) return;
    if (to < 0 || to >= draft.sections.length) return;
    const sections = [...draft.sections];
    const [item] = sections.splice(from, 1);
    if (!item) return;
    sections.splice(to, 0, item);
    updateSections(sections);
  }

  const publishIssues = draft ? validateSalesPageForPublish(draft) : [];

  return (
    <details className="group rounded-xl border border-dashed border-app bg-white open:shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4 font-semibold marker:content-none">
        <span className="flex items-center justify-between gap-2">
          Sales Page
          <span className="text-sm font-normal text-muted">
            {page ? `Status: ${page.status}` : "Not created"}
            {saveState === "saving" ? " · Saving…" : null}
            {saveState === "saved" ? " · Saved" : null}
            {saveState === "failed" ? " · Save failed" : null}
          </span>
        </span>
        <p className="mt-0.5 text-sm font-normal text-muted">
          Build, import, preview, and publish a conversion page. Uses existing DigitalSkillX checkout.
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

        {page && draft ? (
          <>
            <div className="flex flex-wrap gap-1 border-b border-app pb-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    tab === t.id ? "bg-brand text-white" : "text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <p className="text-xs text-muted">
              Draft v{page.draft_version}
              {page.published_version > 0 ? ` · Published v${page.published_version}` : " · Not published"}
              {" · "}
              Editing draft does not change the live published page until you click Publish.
            </p>

            {tab === "overview" ? (
              <div className="space-y-4">
                <div>
                  <Label>Page title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="rounded-lg border border-app bg-neutral-50 p-3 text-sm text-muted">
                  WordPress JSON/ZIP import is retired. Use{" "}
                  <a className="font-semibold text-brand underline" href="/admin/landing-pages">
                    Landing imports
                  </a>{" "}
                  to paste a public URL, preserve the page visuals, and map CTAs to this course&apos;s
                  checkout. Existing published sales pages stay live. Use the Builder tab to edit the
                  structured course sales page.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void saveDraft()}>
                    {saveState === "saving" ? "Saving…" : "Save Draft"}
                  </Button>
                </div>
              </div>
            ) : null}

            {tab === "builder" ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold">Add section</p>
                  <SectionLibrary onAdd={addSection} disabled={busy} />
                </div>
                <div className="space-y-3">
                  {draft.sections.map((section, index) => (
                    <div
                      key={section.id}
                      className="rounded-lg border border-app p-3"
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex === null || dragIndex === index) return;
                        moveSection(dragIndex, index);
                        setDragIndex(null);
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          className="text-left text-sm font-semibold"
                          onClick={() => setExpandedId(expandedId === section.id ? null : section.id)}
                        >
                          {section.type}
                          {section.hidden ? " (hidden)" : ""}
                        </button>
                        <SectionToolbar
                          index={index}
                          total={draft.sections.length}
                          hidden={section.hidden}
                          disabled={busy}
                          onMoveUp={() => moveSection(index, index - 1)}
                          onMoveDown={() => moveSection(index, index + 1)}
                          onDuplicate={() => {
                            const copy = { ...section, id: newSectionId() } as SalesPageSection;
                            const sections = [...draft.sections];
                            sections.splice(index + 1, 0, copy);
                            updateSections(sections);
                          }}
                          onToggleHidden={() => {
                            const sections = draft.sections.map((s, i) =>
                              i === index ? { ...s, hidden: !s.hidden } : s,
                            );
                            updateSections(sections);
                          }}
                          onDelete={() => {
                            if (!window.confirm("Delete this section?")) return;
                            updateSections(draft.sections.filter((_, i) => i !== index));
                          }}
                        />
                      </div>
                      {expandedId === section.id ? (
                        <div className="mt-3 border-t border-app pt-3">
                          <SectionEditor
                            section={section}
                            busy={busy}
                            onChange={(next) => {
                              const sections = draft.sections.map((s, i) => (i === index ? next : s));
                              updateSections(sections);
                            }}
                            onUploadImage={uploadImage}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <Button type="button" disabled={busy} onClick={() => void saveDraft()}>
                  {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save Draft"}
                </Button>
              </div>
            ) : null}

            {tab === "design" ? (
              <div className="space-y-3 max-w-md">
                <div>
                  <Label>Theme key</Label>
                  <Input
                    value={draft.settings.theme ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, settings: { ...draft.settings, theme: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <Label>Default alignment</Label>
                  <Select
                    value={draft.settings.defaultAlignment ?? "left"}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        settings: {
                          ...draft.settings,
                          defaultAlignment: e.target.value as "left" | "center",
                        },
                      })
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.settings.showDynamicPrice !== false}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        settings: { ...draft.settings, showDynamicPrice: e.target.checked },
                      })
                    }
                  />
                  Show live course price on pricing sections
                </label>
                <div className="border-t border-app pt-4">
                  <p className="text-sm font-semibold">Offer (presentation only)</p>
                  <p className="mt-1 text-xs text-muted">
                    Never overrides checkout price — course price remains authoritative.
                  </p>
                </div>
                <div>
                  <Label>Offer status</Label>
                  <Select
                    value={draft.settings.offer?.status ?? "draft"}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        settings: {
                          ...draft.settings,
                          offer: {
                            ...draft.settings.offer,
                            status: e.target.value as "draft" | "active" | "paused",
                          },
                        },
                      })
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </Select>
                </div>
                <div>
                  <Label>Offer headline</Label>
                  <Input
                    value={draft.settings.offer?.headline ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        settings: {
                          ...draft.settings,
                          offer: { ...draft.settings.offer, headline: e.target.value },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Offer description</Label>
                  <Textarea
                    rows={3}
                    value={draft.settings.offer?.description ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        settings: {
                          ...draft.settings,
                          offer: { ...draft.settings.offer, description: e.target.value },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Urgency message</Label>
                  <Input
                    value={draft.settings.offer?.urgencyMessage ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        settings: {
                          ...draft.settings,
                          offer: { ...draft.settings.offer, urgencyMessage: e.target.value },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Guarantee copy</Label>
                  <Textarea
                    rows={2}
                    value={draft.settings.offer?.guarantee ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        settings: {
                          ...draft.settings,
                          offer: { ...draft.settings.offer, guarantee: e.target.value },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Bonus lines (one per line: Title — body)</Label>
                  <Textarea
                    rows={4}
                    value={(draft.settings.offer?.bonuses ?? [])
                      .map((b) => [b.title, b.body].filter(Boolean).join(" — "))
                      .join("\n")}
                    onChange={(e) => {
                      const bonuses = e.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => {
                          const [title, ...rest] = line.split("—").map((s) => s.trim());
                          return { title, body: rest.join(" — ") || undefined };
                        });
                      setDraft({
                        ...draft,
                        settings: {
                          ...draft.settings,
                          offer: { ...draft.settings.offer, bonuses },
                        },
                      });
                    }}
                  />
                </div>
                <Button type="button" disabled={busy} onClick={() => void saveDraft()}>
                  Save Design
                </Button>
              </div>
            ) : null}

            {tab === "seo" ? (
              <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>SEO title</Label>
                  <Input value={seo.title ?? ""} onChange={(e) => setSeo({ ...seo, title: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Meta description</Label>
                  <Textarea
                    value={seo.description ?? ""}
                    rows={3}
                    onChange={(e) => setSeo({ ...seo, description: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Canonical URL</Label>
                  <Input
                    value={seo.canonicalUrl ?? ""}
                    onChange={(e) => setSeo({ ...seo, canonicalUrl: e.target.value })}
                  />
                </div>
                <div>
                  <Label>OG title</Label>
                  <Input value={seo.ogTitle ?? ""} onChange={(e) => setSeo({ ...seo, ogTitle: e.target.value })} />
                </div>
                <div>
                  <Label>Robots</Label>
                  <Select
                    value={seo.robots ?? "index"}
                    onChange={(e) =>
                      setSeo({ ...seo, robots: e.target.value as "index" | "noindex" })
                    }
                  >
                    <option value="index">Index</option>
                    <option value="noindex">Noindex</option>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>OG description</Label>
                  <Textarea
                    value={seo.ogDescription ?? ""}
                    rows={2}
                    onChange={(e) => setSeo({ ...seo, ogDescription: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-app px-3 py-2 text-sm">
                    Upload OG image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        void uploadImage(f).then((id) => {
                          if (id) setSeo((s) => ({ ...s, ogImageAssetId: id }));
                        });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {seo.ogImageAssetId ? (
                    <span className="ml-2 text-xs text-muted">OG asset set</span>
                  ) : null}
                </div>
                <Button type="button" disabled={busy} onClick={() => void saveDraft({ seo })}>
                  Save SEO
                </Button>
              </div>
            ) : null}

            {tab === "checkout" ? (
              <div className="max-w-xl space-y-2 text-sm text-neutral-700">
                <p>
                  Purchase CTAs use the existing DigitalSkillX <strong>EnrollButton</strong> and course price (
                  NGN {course.price_ngn.toLocaleString()}).
                </p>
                <p>There is no separate Sales Page payment system. WordPress payment URLs are never used.</p>
                <p>Flow: Sales Page CTA → existing checkout → Paystack (when paid) → enrollment engine.</p>
              </div>
            ) : null}

            {tab === "preview" ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  {(["desktop", "tablet", "mobile"] as const).map((v) => (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant={previewViewport === v ? "primary" : "outline"}
                      onClick={() => setPreviewViewport(v)}
                    >
                      {v}
                    </Button>
                  ))}
                </div>
                <div className="max-h-[70vh] overflow-auto bg-white">
                  <SalesPageView
                    course={course}
                    schema={draft}
                    isEnrolled={false}
                    isLoggedIn={false}
                    preview
                    previewViewport={previewViewport}
                  />
                </div>
              </div>
            ) : null}

            {tab === "versions" ? (
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !page.published_schema}
                  onClick={() => void patchAction("restore_published")}
                >
                  Restore current published → draft
                </Button>
                <ul className="space-y-2">
                  {versions.length === 0 ? (
                    <li className="text-sm text-muted">No previous published snapshots yet.</li>
                  ) : (
                    versions.map((v) => (
                      <li
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-app px-3 py-2 text-sm"
                      >
                        <span>
                          Published v{v.version} · {new Date(v.created_at).toLocaleString()}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void patchAction("restore_version", { versionId: v.id })}
                        >
                          Restore to draft
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ) : null}

            {tab === "publish" ? (
              <div className="space-y-4">
                <div>
                  <p className="font-semibold">Validation</p>
                  {publishIssues.length === 0 ? (
                    <p className="mt-1 text-sm text-green-700">Ready to publish.</p>
                  ) : (
                    <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                      {publishIssues.map((i) => (
                        <li key={i.code}>{i.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => void saveDraft()}>
                    Save Draft
                  </Button>
                  {page.status === "published" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void patchAction("unpublish")}
                    >
                      Unpublish
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={busy || publishIssues.length > 0}
                      onClick={() => void patchAction("publish")}
                    >
                      Publish
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </details>
  );
}
