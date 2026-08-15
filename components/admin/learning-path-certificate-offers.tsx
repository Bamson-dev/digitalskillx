"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { CERTIFICATE_TEMPLATE_KEYS, CERTIFICATE_TEMPLATE_LABELS } from "@/lib/certificate-templates";
import { formatNaira } from "@/lib/currency";
import type {
  LearningPathCertificateMetrics,
  LearningPathCertificateRow,
  PublishedCourseOption,
} from "@/lib/learn-certificate-shared";

type OfferState = {
  certificate_enabled: boolean;
  certificate_price_ngn: string;
  recommended_course_id: string;
  certificate_template_override: string;
};

function toState(row: LearningPathCertificateRow): OfferState {
  return {
    certificate_enabled: row.certificate_enabled,
    certificate_price_ngn: row.certificate_price_ngn != null ? String(row.certificate_price_ngn) : "",
    recommended_course_id: row.recommended_course_id ?? "",
    certificate_template_override: row.certificate_template_override ?? "",
  };
}

export function LearningPathCertificateOffers() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
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
          certificate_price_ngn: draft.certificate_price_ngn === "" ? null : Number(draft.certificate_price_ngn),
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

  if (loading && !paths.length) {
    return <p className="text-sm text-muted">Loading certificate offers…</p>;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-app p-4">
      <div>
        <h2 className="text-lg font-semibold">Learning path certificates</h2>
        <p className="mt-1 text-sm text-muted">
          Configure optional paid certificates on existing published paths. This does not unpublish a
          path and does not use Save draft.
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
                  Offer paid certificate
                </label>
                <label className="block text-xs text-muted" htmlFor={`price-${path.id}`}>
                  Certificate price (NGN)
                </label>
                <Input
                  id={`price-${path.id}`}
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
                      {CERTIFICATE_TEMPLATE_LABELS[key]}
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

      {metrics?.recent.length ? (
        <div>
          <h3 className="text-sm font-semibold">Recent certificate activity</h3>
          <ul className="mt-2 space-y-1 text-sm text-neutral-700">
            {metrics.recent.map((row) => (
              <li key={row.id}>
                <span className="font-mono">{row.certificate_number}</span>
                {" · "}
                {row.learning_path_title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
