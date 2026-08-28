"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type PipelineCounts = {
  totalCandidatesQueued: number;
  pendingQualification: number;
  qualifiedCandidates: number;
  generating: number;
  awaitingVerification: number;
  readyToPublish: number;
  discoveryBacklog: number;
  activeTopics: number;
};

type LibraryBuildStatus = {
  publishedCount: number;
  target: number;
  remaining: number;
  progressPercentage?: number;
  buildMode: string;
  runStatus: string;
  effectiveMode: string;
  phase: string;
  minimumLibrarySize: number;
  continuousExpansionEnabled: boolean;
  nextTopic: { id: string; name: string; categoryName: string } | null;
  activeTopics?: Array<{ id: string; name: string; categoryName: string }>;
  lastJob: { id: string; status: string; completedAt: string | null } | null;
  lastSuccessfulActivity?: string | null;
  lastError?: string | null;
  pipeline?: PipelineCounts;
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

function phaseLabel(phase: string) {
  switch (phase) {
    case "build":
      return "Build mode";
    case "continuous_expansion":
      return "Continuous expansion";
    case "maintenance":
      return "Maintenance";
    case "paused":
      return "Paused";
    case "stopped":
      return "Stopped";
    default:
      return phase;
  }
}

export function LibraryBuildPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<LibraryBuildStatus | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [target, setTarget] = useState("300");
  const [discoveryRate, setDiscoveryRate] = useState("12");
  const [qualityThreshold, setQualityThreshold] = useState("60");
  const [backlogTarget, setBacklogTarget] = useState("4");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/content-factory/library-build");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load library build status");
      setStatus(json.status ?? null);
      setActivity(json.activity ?? []);
      if (json.status) {
        setTarget(String(json.status.minimumLibrarySize ?? json.status.target ?? 300));
        const s = json.status.settings ?? {};
        setDiscoveryRate(String(s.discovery_jobs_per_day ?? 12));
        setQualityThreshold(String(s.quality_threshold ?? 60));
        setBacklogTarget(String(s.discovery_backlog_target ?? 4));
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
      toast("Library build updated.");
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
      discoveryBacklogTarget: Number(backlogTarget),
    });
  }

  if (loading && !status) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Library Build Engine</h2>
        <p className="mt-2 text-sm text-muted">Loading automated library build engine…</p>
      </section>
    );
  }

  if (!status) {
    return (
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Library Build Engine</h2>
        <p className="mt-2 text-sm text-muted">
          Library Build status could not be loaded. Apply migration{" "}
          <code className="rounded bg-neutral-100 px-1">0054_library_build_throughput.sql</code> if
          throughput settings are missing, then reload.
        </p>
      </section>
    );
  }

  const running = status.runStatus === "running";
  const paused = status.runStatus === "paused";
  const pipeline = status.pipeline;

  return (
    <section className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Library Build Engine</h2>
        <p className="mt-1 text-sm text-muted">
          Autonomous high-throughput ingestion: discover → qualify → generate → verify → publish.
          Runs until you pause or stop. Minimum target is a floor, not a stop signal.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Published courses" value={`${status.publishedCount} / ${status.minimumLibrarySize}`} />
        <Stat label="Remaining to minimum" value={String(status.remaining)} />
        <Stat label="Current mode" value={phaseLabel(status.phase)} />
        <Stat label="Engine status" value={status.runStatus} />
        <Stat label="Discovery backlog" value={String(pipeline?.discoveryBacklog ?? 0)} />
      </div>

      {status.nextTopic ? (
        <p className="text-sm">
          <span className="font-medium">Top priority topic:</span> {status.nextTopic.categoryName} →{" "}
          {status.nextTopic.name}
          {status.activeTopics && status.activeTopics.length > 1 ? (
            <span className="text-muted">
              {" "}
              (+{status.activeTopics.length - 1} concurrent topic
              {status.activeTopics.length - 1 === 1 ? "" : "s"})
            </span>
          ) : null}
        </p>
      ) : null}

      {pipeline ? (
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Queued total" value={String(pipeline.totalCandidatesQueued)} small />
          <Stat label="Pending qualification" value={String(pipeline.pendingQualification)} small />
          <Stat label="Qualified" value={String(pipeline.qualifiedCandidates)} small />
          <Stat label="Generating" value={String(pipeline.generating)} small />
          <Stat label="Awaiting verification" value={String(pipeline.awaitingVerification)} small />
          <Stat label="Ready to publish" value={String(pipeline.readyToPublish)} small />
          <Stat label="Active topics" value={String(pipeline.activeTopics)} small />
          <Stat label="Active discovery jobs" value={String(status.overall?.activeJobs ?? 0)} small />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Published today" value={String(status.stats.publishedToday)} small />
        <Stat label="Failed today" value={String(status.stats.jobsFailedToday ?? 0)} small />
        <Stat label="Candidates today" value={String(status.stats.candidatesToday)} small />
        <Stat label="Approved today" value={String(status.stats.approvedToday)} small />
        <Stat label="Rejected today" value={String(status.stats.rejectedToday)} small />
        <Stat label="Duplicates blocked" value={String(status.overall?.duplicatesBlocked ?? 0)} small />
        <Stat label="Jobs completed" value={String(status.stats.jobsCompletedToday ?? 0)} small />
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-neutral-50 p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Last successful activity</div>
          <div className="mt-1 font-medium">
            {status.lastSuccessfulActivity
              ? new Date(status.lastSuccessfulActivity).toLocaleString()
              : "—"}
          </div>
        </div>
        <div className="rounded-lg bg-neutral-50 p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Last error</div>
          <div className="mt-1 font-medium text-red-700">{status.lastError ?? "None"}</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          Minimum library size
          <Input className="mt-1" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <label className="text-sm">
          Discovery jobs / day
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
          Discovery backlog target
          <Input className="mt-1" value={backlogTarget} onChange={(e) => setBacklogTarget(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || running} onClick={() => act("start")}>
          Start Engine
        </Button>
        <Button variant="outline" disabled={busy || !running} onClick={() => act("pause")}>
          Pause Engine
        </Button>
        <Button variant="outline" disabled={busy || (!paused && !running)} onClick={() => act("resume")}>
          Resume Engine
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Stop the library build engine? Published courses are preserved.")) {
              void act("stop");
            }
          }}
        >
          Stop Engine
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
