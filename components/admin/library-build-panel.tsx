"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type LibraryBuildStatus = {
  publishedCount: number;
  target: number;
  remaining: number;
  progressPercentage?: number;
  buildMode: string;
  runStatus: string;
  effectiveMode: string;
  nextTopic: { id: string; name: string; categoryName: string } | null;
  lastJob: { id: string; status: string; completedAt: string | null } | null;
  stats: {
    candidatesToday: number;
    approvedToday: number;
    publishedToday: number;
    rejectedToday: number;
    jobsStartedToday?: number;
    jobsCompletedToday?: number;
    jobsFailedToday?: number;
  };
  overall?: {
    duplicatesBlocked: number;
    rejectedCandidates: number;
    failedJobs: number;
    activeJobs: number;
  };
  coverage: Array<{
    id: string;
    name: string;
    categoryName: string;
    approvedCourseCount: number;
    publishedCourseCount?: number;
    coveragePercentage?: number;
    coverageStatus: string;
  }>;
};

type ActivityRow = { id: string; kind: string; message: string; created_at: string };

export function LibraryBuildPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<LibraryBuildStatus | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [target, setTarget] = useState("300");
  const [discoveryRate, setDiscoveryRate] = useState("12");
  const [qualityThreshold, setQualityThreshold] = useState("60");
  const [maintenanceMax, setMaintenanceMax] = useState("20");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/content-factory/library-build");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load library build status");
      setStatus(json.status ?? null);
      setActivity(json.activity ?? []);
      if (json.status) {
        setTarget(String(json.status.target ?? 300));
        const s = json.status.settings ?? {};
        setDiscoveryRate(String(s.discovery_jobs_per_day ?? 12));
        setQualityThreshold(String(s.quality_threshold ?? 60));
        setMaintenanceMax(String(s.maintenance_max_per_week ?? 20));
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Load failed", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/content-factory/library-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      setStatus(json.status ?? null);
      toast("Library build status refreshed.");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    await act("update_settings", {
      targetPublishedCount: Number(target),
      discoveryJobsPerDay: Number(discoveryRate),
      qualityThreshold: Number(qualityThreshold),
      maintenanceMaxPerWeek: Number(maintenanceMax),
    });
  }

  if (loading && !status) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Library Build</h2>
        <p className="mt-2 text-sm text-muted">Loading automated library build engine…</p>
      </section>
    );
  }

  if (!status) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Library Build</h2>
        <p className="mt-2 text-sm text-muted">
          Library Build tables are not available yet. Apply migration{" "}
          <code className="rounded bg-neutral-100 px-1">0051_library_build_engine.sql</code> first.
        </p>
      </section>
    );
  }

  const running = status.runStatus === "running";
  const paused = status.runStatus === "paused";

  return (
    <section className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Library Build</h2>
        <p className="mt-1 text-sm text-muted">
          Automated discovery → quality verification → course creation → publishing until your target is
          reached, then weekly gap-based maintenance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Published" value={`${status.publishedCount} / ${status.target}`} />
        <Stat label="Remaining" value={String(status.remaining)} />
        <Stat label="Progress" value={`${status.progressPercentage ?? 0}%`} />
        <Stat label="Mode" value={status.effectiveMode} />
        <Stat label="Status" value={status.runStatus} />
      </div>

      {status.nextTopic ? (
        <p className="text-sm">
          <span className="font-medium">Next priority:</span> {status.nextTopic.categoryName} →{" "}
          {status.nextTopic.name}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Candidates today" value={String(status.stats.candidatesToday)} small />
        <Stat label="Approved today" value={String(status.stats.approvedToday)} small />
        <Stat label="Published today" value={String(status.stats.publishedToday)} small />
        <Stat label="Rejected today" value={String(status.stats.rejectedToday)} small />
        <Stat label="Jobs started" value={String(status.stats.jobsStartedToday ?? 0)} small />
        <Stat label="Jobs completed" value={String(status.stats.jobsCompletedToday ?? 0)} small />
        <Stat label="Jobs failed" value={String(status.stats.jobsFailedToday ?? 0)} small />
      </div>

      {status.overall ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Duplicates blocked" value={String(status.overall.duplicatesBlocked)} small />
          <Stat label="Rejected candidates" value={String(status.overall.rejectedCandidates)} small />
          <Stat label="Failed jobs (total)" value={String(status.overall.failedJobs)} small />
          <Stat label="Active jobs" value={String(status.overall.activeJobs)} small />
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          Target course count
          <Input className="mt-1" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <label className="text-sm">
          Discovery rate (jobs/day)
          <Input className="mt-1" value={discoveryRate} onChange={(e) => setDiscoveryRate(e.target.value)} />
        </label>
        <label className="text-sm">
          Quality threshold
          <Input
            className="mt-1"
            value={qualityThreshold}
            onChange={(e) => setQualityThreshold(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Max maintenance additions/week
          <Input className="mt-1" value={maintenanceMax} onChange={(e) => setMaintenanceMax(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || running} onClick={() => act("start")}>
          Start Library Build
        </Button>
        <Button variant="outline" disabled={busy || !running} onClick={() => act("pause")}>
          Pause Build
        </Button>
        <Button variant="outline" disabled={busy || (!paused && !running)} onClick={() => act("resume")}>
          Resume Build
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Stop library build? Queues and published courses are preserved.")) {
              void act("stop");
            }
          }}
        >
          Stop Build
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => saveSettings()}>
          Save settings
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => load()}>
          Refresh
        </Button>
      </div>

      <details className="rounded-lg border border-neutral-100 p-4">
        <summary className="cursor-pointer text-sm font-medium">Coverage map</summary>
        <div className="mt-3 max-h-64 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-1 pr-2">Category</th>
                <th className="py-1 pr-2">Topic</th>
                <th className="py-1 pr-2">Courses</th>
                <th className="py-1 pr-2">Target</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {status.coverage.slice(0, 40).map((row) => (
                <tr key={row.id} className="border-b border-neutral-50">
                  <td className="py-1 pr-2">{row.categoryName}</td>
                  <td className="py-1 pr-2">{row.name}</td>
                  <td className="py-1 pr-2">{row.publishedCourseCount ?? row.approvedCourseCount}</td>
                  <td className="py-1 pr-2">{row.coveragePercentage != null ? `${row.coveragePercentage}%` : "—"}</td>
                  <td className="py-1">{row.coverageStatus.replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="rounded-lg border border-neutral-100 p-4">
        <summary className="cursor-pointer text-sm font-medium">Activity log</summary>
        <ul className="mt-3 space-y-2 text-xs text-muted">
          {activity.length ? (
            activity.map((row) => (
              <li key={row.id}>
                <span className="font-medium text-foreground">{row.kind}</span> — {row.message}
              </li>
            ))
          ) : (
            <li>No activity yet.</li>
          )}
        </ul>
      </details>
    </section>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className={`rounded-lg bg-neutral-50 ${small ? "p-3" : "p-4"}`}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={small ? "mt-1 text-lg font-semibold" : "mt-1 text-2xl font-semibold"}>{value}</div>
    </div>
  );
}
