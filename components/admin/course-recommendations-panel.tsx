"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

type CourseOption = { id: string; title: string };

type RecommendationKind =
  | "cross_sell"
  | "upsell"
  | "downsell"
  | "related"
  | "next_step"
  | "frequently_bought"
  | "upgrade"
  | "bundle_component"
  | "recommended";

type CourseRecommendationRow = {
  id: string;
  course_id: string;
  recommended_course_id: string;
  kind: RecommendationKind;
  sort_order: number;
  active: boolean;
};

const RECOMMENDATION_KIND_LABELS: Record<RecommendationKind, string> = {
  cross_sell: "Cross-sell",
  upsell: "Upsell",
  downsell: "Downsell",
  related: "Related",
  next_step: "Next step",
  frequently_bought: "Frequently bought together",
  upgrade: "Upgrade",
  bundle_component: "Bundle component",
  recommended: "Recommended",
};

const KIND_OPTIONS = Object.entries(RECOMMENDATION_KIND_LABELS) as Array<
  [RecommendationKind, string]
>;

export function CourseRecommendationsPanel({
  courseId,
  allCourses,
}: {
  courseId: string;
  allCourses: CourseOption[];
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<CourseRecommendationRow[]>([]);
  const [recommendedCourseId, setRecommendedCourseId] = useState("");
  const [kind, setKind] = useState<RecommendationKind>("cross_sell");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const titleById = new Map(allCourses.map((c) => [c.id, c.title]));
  const selectable = allCourses.filter((c) => c.id !== courseId);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/course-recommendations?courseId=${encodeURIComponent(courseId)}`,
        { credentials: "include" },
      );
      const json = (await res.json()) as {
        recommendations?: CourseRecommendationRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load recommendations.");
      setRows(json.recommendations ?? []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load.", "error");
    } finally {
      setLoading(false);
    }
  }, [courseId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!recommendedCourseId) {
      toast("Select a course to recommend.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/course-recommendations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          recommendedCourseId,
          kind,
          active: true,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not add recommendation.");
      toast("Recommendation added.", "success");
      setRecommendedCourseId("");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Remove this recommendation?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/course-recommendations?id=${encodeURIComponent(id)}`,
        { method: "DELETE", credentials: "include" },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not delete.");
      toast("Recommendation removed.", "success");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Course recommendations"
        description="Suggest related courses for cross-sell and upsell placements."
      />
      <form onSubmit={onAdd} className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Label htmlFor="rec-course">Recommend</Label>
          <Select
            id="rec-course"
            value={recommendedCourseId}
            onChange={(e) => setRecommendedCourseId(e.target.value)}
            required
          >
            <option value="">Select a course…</option>
            {selectable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Label htmlFor="rec-kind">Type</Label>
          <Select
            id="rec-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as RecommendationKind)}
          >
            {KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" size="sm" disabled={busy}>
          Add
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">No recommendations yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-app px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">
                  {titleById.get(row.recommended_course_id) ?? row.recommended_course_id}
                </span>
                <span className="ml-2 text-xs text-muted">
                  {RECOMMENDATION_KIND_LABELS[row.kind] ?? row.kind}
                  {!row.active ? " · Inactive" : ""}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => void onDelete(row.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
