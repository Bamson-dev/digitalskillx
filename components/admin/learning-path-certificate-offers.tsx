"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { CERTIFICATE_TEMPLATE_KEYS, CERTIFICATE_TEMPLATE_LABELS } from "@/lib/certificate-templates";
import { formatNaira } from "@/lib/currency";
import { LEARN_CERTIFICATE_PRICE_TIERS } from "@/lib/learn-certificate-pricing";
import type {
  LearningPathCertificateMetrics,
  LearningPathCertificateRow,
  PublishedCourseOption,
} from "@/lib/learn-certificate-shared";

type OfferState = {
  certificate_enabled: boolean;
  certificate_pricing_mode: "automatic" | "fixed" | "free";
  certificate_price_ngn: string;
  recommended_course_id: string;
  certificate_template_override: string;
};

function toState(row: LearningPathCertificateRow): OfferState {
  return {
    certificate_enabled: row.certificate_enabled,
    certificate_pricing_mode: row.certificate_pricing_mode || "automatic",
    certificate_price_ngn: row.certificate_price_ngn != null ? String(row.certificate_price_ngn) : "",
    recommended_course_id: row.recommended_course_id ?? "",
    certificate_template_override: row.certificate_template_override ?? "",
  };
}

function artworkLabel(status: string | null | undefined) {
  switch (status) {
    case "generated":
      return "Generated";
    case "processing":
      return "Processing";
    case "retrying":
      return "Retrying";
    case "source_thumbnail":
      return "Using source thumbnail";
    case "category_fallback":
      return "Category fallback";
    case "failed":
      return "Failed";
    case "missing":
      return "Missing";
    default:
      return status || "Unknown";
  }
}

export function LearningPathCertificateOffers() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [artworkBusyId, setArtworkBusyId] = useState<string | null>(null);
  const [paths, setPaths] = useState<LearningPathCertificateRow[]>([]);
  const [courses, setCourses] = useState<PublishedCourseOption[]>([]);
  const [metrics, setMetrics] = useState<LearningPathCertificateMetrics | null>(null);
  const [drafts, setDrafts] = useState<Record<string, OfferState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/content-factory/certificate-offers", { credentials: "include" });
      const json = (await res.json()) as {
        error?: string;
        paths?: LearningPathCertificateRow[];
        courses?: PublishedCourseOption[];
        metrics?: LearningPathCertificateMetrics;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load certificate offers.");
      const nextPaths = json.paths ?? [];
      setPaths(nextPaths);
      setCourses(json.courses ?? []);
      setMetrics(json.metrics ?? null);
      setDrafts(Object.fromEntries(nextPaths.map((row) => [row.id, toState(row)])));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load certificate offers.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(pathId: string) {
    const draft = drafts[pathId];
    if (!draft) return;
    setSavingId(pathId);
    try {
      const res = await fetch("/api/admin/content-factory/certificate-offers", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pathId,
          certificate_enabled: draft.certificate_enabled,
          certificate_pricing_mode: draft.certificate_pricing_mode,
          certificate_price_ngn:
            draft.certificate_pricing_mode === "free"
              ? 0
              : draft.certificate_price_ngn === ""
                ? null
                : Number(draft.certificate_price_ngn),
          recommended_course_id: courses.some((course) => course.id === draft.recommended_course_id)
            ? draft.recommended_course_id
            : null,
          certificate_template_override: draft.certificate_template_override || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      toast("Certificate offer saved. Publication status was not changed.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function regenerateArtwork(pathId: string, preferYoutube = false) {
    setArtworkBusyId(pathId);
    try {
      const res = await fetch("/api/admin/content-factory/artwork", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathId, preferYoutube }),
      });
      const json = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) throw new Error(json.error ?? "Artwork update failed.");
      toast(`Artwork updated (${json.status || "ok"}).`, "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Artwork update failed.", "error");
    } finally {
      setArtworkBusyId(null);
    }
  }

  if (loading && !paths.length) {
    return <p className="text-sm text-muted">Loading certificate offers…</p>;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-app p-4">
      <div>
        <h2 className="text-lg font-semibold">Learning path certificates</h2>
        <p className="mt-1 text-sm text-muted">
          Configure certificates and artwork for Free Learning Library paths. Saving does not change
          publication status.
        </p>
      </div>

      {metrics ? (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-neutral-50 p-3">
            <dt className="text-xs text-muted">Certificates issued</dt>
            <dd className="mt-1 text-lg font-semibold">{metrics.certificatesIssued}</dd>
          </div>
          <div className="rounded-xl bg-neutral-50 p-3">
            <dt className="text-xs text-muted">Certificate revenue</dt>
            <dd className="mt-1 text-lg font-semibold">{formatNaira(metrics.certificateRevenueNgn)}</dd>
          </div>
          <div className="rounded-xl bg-neutral-50 p-3">
            <dt className="text-xs text-muted">Average certificate value</dt>
            <dd className="mt-1 text-lg font-semibold">{formatNaira(metrics.averageCertificateValueNgn)}</dd>
          </div>
        </dl>
      ) : null}

      {paths.length === 0 ? (
        <p className="text-sm text-muted">No learning paths available yet.</p>
      ) : (
        <ul className="space-y-4">
          {paths.map((path) => {
            const draft = drafts[path.id] ?? toState(path);
            const recommendedId = courses.some((course) => course.id === draft.recommended_course_id)
              ? draft.recommended_course_id
              : "";
            return (
              <li key={path.id} className="space-y-3 rounded-xl border border-app p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{path.title}</p>
                    <p className="text-xs text-muted">
                      {path.status} · {path.certificates_issued} issued
                      {path.status === "published" ? (
                        <>
                          {" · "}
                          <Link href={`/learn/${path.slug}`} className="text-brand hover:underline">
                            View public page
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {path.artwork_public_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={path.artwork_public_url}
                      alt=""
                      className="h-16 w-24 rounded-md object-cover"
                    />
                  ) : null}
                </div>

                <div className="rounded-lg bg-neutral-50 p-3 text-sm">
                  <p className="font-medium">Course artwork</p>
                  <p className="mt-1 text-xs text-muted">
                    Status: {artworkLabel(path.artwork_status)}
                    {path.artwork_source ? ` · Source: ${path.artwork_source}` : ""}
                  </p>
                  {path.artwork_error ? (
                    <p className="mt-1 text-xs text-amber-800">{path.artwork_error}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={artworkBusyId === path.id}
                      onClick={() => void regenerateArtwork(path.id, false)}
                    >
                      Regenerate AI artwork
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={artworkBusyId === path.id}
                      onClick={() => void regenerateArtwork(path.id, true)}
                    >
                      Use source thumbnail
                    </Button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.certificate_enabled}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [path.id]: { ...draft, certificate_enabled: e.target.checked },
                      }))
                    }
                  />
                  Certificate available
                </label>

                <label className="block text-xs text-muted" htmlFor={`mode-${path.id}`}>
                  Pricing mode
                </label>
                <select
                  id={`mode-${path.id}`}
                  className="h-10 w-full rounded-lg border border-app bg-white px-3 text-sm"
                  value={draft.certificate_pricing_mode}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [path.id]: {
                        ...draft,
                        certificate_pricing_mode: e.target.value as OfferState["certificate_pricing_mode"],
                        certificate_price_ngn:
                          e.target.value === "automatic" && path.certificate_recommended_price_ngn != null
                            ? String(path.certificate_recommended_price_ngn)
                            : draft.certificate_price_ngn,
                      },
                    }))
                  }
                >
                  <option value="automatic">Automatic recommendation</option>
                  <option value="fixed">Fixed price</option>
                  <option value="free">Free</option>
                </select>

                {path.certificate_recommended_price_ngn != null ? (
                  <p className="text-xs text-muted">
                    Recommended: {formatNaira(path.certificate_recommended_price_ngn)}
                    {path.certificate_price_reason ? (
                      <span className="mt-1 block whitespace-pre-line">{path.certificate_price_reason}</span>
                    ) : null}
                  </p>
                ) : null}

                {draft.certificate_pricing_mode === "fixed" ? (
                  <>
                    <label className="block text-xs text-muted" htmlFor={`price-${path.id}`}>
                      Final selling price (approved tiers)
                    </label>
                    <select
                      id={`price-${path.id}`}
                      className="h-10 w-full rounded-lg border border-app bg-white px-3 text-sm"
                      value={draft.certificate_price_ngn}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [path.id]: { ...draft, certificate_price_ngn: e.target.value },
                        }))
                      }
                    >
                      <option value="">Select price</option>
                      {LEARN_CERTIFICATE_PRICE_TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          {formatNaira(tier)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : draft.certificate_pricing_mode === "automatic" ? (
                  <>
                    <label className="block text-xs text-muted" htmlFor={`price-auto-${path.id}`}>
                      Final selling price (defaults to recommendation)
                    </label>
                    <Input
                      id={`price-auto-${path.id}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={draft.certificate_price_ngn}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [path.id]: { ...draft, certificate_price_ngn: e.target.value },
                        }))
                      }
                    />
                  </>
                ) : (
                  <p className="text-sm text-neutral-600">Final selling price: Free (₦0)</p>
                )}

                <label className="block text-xs text-muted" htmlFor={`course-${path.id}`}>
                  Recommended paid course
                </label>
                <select
                  id={`course-${path.id}`}
                  className="h-10 w-full rounded-lg border border-app bg-white px-3 text-sm"
                  value={recommendedId}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [path.id]: { ...draft, recommended_course_id: e.target.value },
                    }))
                  }
                >
                  <option value="">No recommendation</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title} · {formatNaira(course.price_ngn)} · Published
                    </option>
                  ))}
                </select>
                <label className="block text-xs text-muted" htmlFor={`template-${path.id}`}>
                  Certificate template override
                </label>
                <select
                  id={`template-${path.id}`}
                  className="h-10 w-full rounded-lg border border-app bg-white px-3 text-sm"
                  value={draft.certificate_template_override}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [path.id]: { ...draft, certificate_template_override: e.target.value },
                    }))
                  }
                >
                  <option value="">Default template</option>
                  {CERTIFICATE_TEMPLATE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {CERTIFICATE_TEMPLATE_LABELS[key] ?? key}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  disabled={savingId === path.id}
                  onClick={() => void save(path.id)}
                >
                  {savingId === path.id ? "Saving…" : "Save certificate offer"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
