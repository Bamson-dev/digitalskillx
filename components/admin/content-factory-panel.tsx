"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { asStoredQualityReview, qualityLabel } from "@/lib/content-factory/quality-shared";

type Job = {
  id: string;
  input_type: string;
  input_value: string;
  status: string;
  phase: string;
  progress: number;
  learning_path_id: string | null;
  error_message: string | null;
  last_error?: string | null;
  attempts?: number;
  created_at: string;
  updated_at?: string;
  result_snapshot?: { slug?: string; qualityScore?: number; lessonCount?: number; qualityStatus?: string };
};

type FactoryHealth = {
  jobs: { queued: number; processing: number; review: number; published: number; failed: number };
  discovery: { queued: number; running: number; completed: number; failed: number };
  quality: { passed: number; warning: number; needs_revision: number };
  costs: {
    youtubeSearches24h: number;
    qualifyCalls: number;
    researchCalls: number;
    qualityCalls: number;
    generationJobs: number;
    retryJobs: number;
  };
  lastActivityAt: string | null;
};

type FactoryBlock = {
  id: string;
  kind: "playlist_id" | "channel_id";
  value: string;
  reason: string;
  created_at: string;
};

type DiscoveryRun = {
  id: string;
  topic: string;
  status: string;
  target_generate: number;
  discovered_count: number;
  filtered_count: number;
  qualified_count: number;
  generated_count: number;
  error_message: string | null;
};

type DiscoveryCandidate = {
  id: string;
  playlist_id: string;
  title: string;
  channel_title: string;
  item_count: number | null;
  status: string;
  rule_score: number | null;
  ai_score: number | null;
  filter_reason: string | null;
  factory_job_id: string | null;
  learning_path_id: string | null;
  score_breakdown?: { aiReason?: string | null };
};

type Detail = {
  job: Job;
  path: {
    id: string;
    title: string;
    slug: string;
    status: string;
    description: string;
    short_description: string;
    category: string;
    difficulty: string;
    quality_score: number | null;
    quality_breakdown?: unknown;
    warnings: unknown;
    artwork_public_url: string | null;
    artwork_status?: string | null;
    artwork_source?: string | null;
    artwork_error?: string | null;
    certificate_enabled?: boolean;
    certificate_price_ngn?: number | null;
    recommended_course_id?: string | null;
    source_playlist_url?: string | null;
    source_playlist_id?: string | null;
    quiz_json: unknown;
    assessment_json: unknown;
  } | null;
  creator: {
    display_name: string;
    short_bio: string;
    teaches?: string;
    youtube_channel_url: string | null;
    credentials: string;
    relevance: string;
    research_status?: string;
    updated_at?: string;
  } | null;
  creatorSources?: Array<{
    source_type: string;
    source_url: string;
    source_title: string;
    relationship: string;
    retrieved_at: string;
  }>;
  creatorQualityScore?: number | null;
  curriculum: {
    sections: Array<{ id: string; title: string; position: number }>;
    lessons: Array<{
      id: string;
      title: string;
      youtube_video_id: string;
      summary: string;
      section_id: string | null;
      position: number;
    }>;
    sources: Array<{ source_url: string; source_title: string; source_type: string }>;
  } | null;
};

export function ContentFactoryPanel() {
  const { toast } = useToast();
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [discoveryRuns, setDiscoveryRuns] = useState<DiscoveryRun[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [selectedRun, setSelectedRun] = useState<{
    run: DiscoveryRun;
    candidates: DiscoveryCandidate[];
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<FactoryHealth | null>(null);
  const [blocks, setBlocks] = useState<FactoryBlock[]>([]);
  const [blockKind, setBlockKind] = useState<"playlist_id" | "channel_id">("playlist_id");
  const [blockValue, setBlockValue] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockQuery, setBlockQuery] = useState("");
  const [filters, setFilters] = useState({
    topic: "",
    status: "",
    creator: "",
    minRuleScore: "",
    minAiScore: "",
    minVideos: "",
  });

  const loadJobs = useCallback(async () => {
    const qs = blockQuery.trim() ? `?blockQuery=${encodeURIComponent(blockQuery.trim())}` : "";
    const res = await fetch(`/api/admin/content-factory/jobs${qs}`);
    const json = (await res.json()) as {
      jobs?: Job[];
      discoveryRuns?: DiscoveryRun[];
      health?: FactoryHealth;
      blocks?: FactoryBlock[];
      error?: string;
    };
    if (!res.ok) throw new Error(json.error ?? "Failed to load jobs");
    setJobs(json.jobs ?? []);
    setDiscoveryRuns(json.discoveryRuns ?? []);
    setHealth(json.health ?? null);
    setBlocks(json.blocks ?? []);
  }, [blockQuery]);

  useEffect(() => {
    void loadJobs().catch((err) => toast(err instanceof Error ? err.message : "Load failed", "error"));
  }, [loadJobs, toast]);

  async function createJob() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/content-factory/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputType: "playlist_url", inputValue: playlistUrl }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      toast("Job queued. Cron will process it shortly.");
      setPlaylistUrl("");
      await loadJobs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Create failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function createDiscovery() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/content-factory/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputType: "topic", inputValue: topic }),
      });
      const json = (await res.json()) as {
        error?: string;
        runId?: string;
        reused?: boolean;
        topic?: string;
        status?: string;
        created?: DiscoveryRun[];
      };
      if (!res.ok) throw new Error(json.error ?? "Discovery failed");
      toast(
        json.reused
          ? "Showing today's search for this topic. Building any remaining tutorials now."
          : "Discovery started. Tutorials will appear here and on /learn as they pass quality checks.",
      );
      setTopic("");
      await loadJobs();
      const runFromList =
        (json.runId
          ? (await (async () => {
              const listRes = await fetch("/api/admin/content-factory/jobs");
              const listJson = (await listRes.json()) as { discoveryRuns?: DiscoveryRun[] };
              return (listJson.discoveryRuns ?? []).find((r) => r.id === json.runId) ?? null;
            })())
          : null) ??
        (json.created?.[0]
          ? {
              id: json.created[0].id,
              topic: json.created[0].topic ?? json.topic ?? topic,
              status: json.created[0].status ?? json.status ?? "queued",
              target_generate: json.created[0].target_generate ?? 20,
              discovered_count: json.created[0].discovered_count ?? 0,
              filtered_count: json.created[0].filtered_count ?? 0,
              qualified_count: json.created[0].qualified_count ?? 0,
              generated_count: json.created[0].generated_count ?? 0,
              error_message: json.created[0].error_message ?? null,
            }
          : null);
      if (runFromList) {
        await openRun(runFromList);
      }
      window.setTimeout(() => void loadJobs(), 8_000);
      window.setTimeout(() => {
        void loadJobs();
        if (runFromList) void openRun(runFromList);
      }, 25_000);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Discovery failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function openRun(run: DiscoveryRun) {
    setBusy(true);
    try {
      const params = new URLSearchParams({ runId: run.id });
      if (filters.topic) params.set("topic", filters.topic);
      if (filters.status) params.set("status", filters.status);
      if (filters.creator) params.set("creator", filters.creator);
      if (filters.minRuleScore) params.set("minRuleScore", filters.minRuleScore);
      if (filters.minAiScore) params.set("minAiScore", filters.minAiScore);
      if (filters.minVideos) params.set("minVideos", filters.minVideos);
      const res = await fetch(`/api/admin/content-factory/jobs?${params.toString()}`);
      const json = (await res.json()) as { candidates?: DiscoveryCandidate[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Load failed");
      setSelected(null);
      setSelectedIds([]);
      setSelectedRun({ run, candidates: json.candidates ?? [] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Load failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function candidateAction(action: "generate_candidates" | "reject_candidates" | "block_candidates") {
    if (!selectedRun) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/content-factory/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, candidateIds: selectedIds }),
      });
      const json = (await res.json()) as {
        error?: string;
        created?: unknown[];
        alreadyGenerated?: unknown[];
        skipped?: unknown[];
        failed?: unknown[];
      };
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      toast(
        action === "generate_candidates"
          ? `Created ${json.created?.length ?? 0}. Already ${json.alreadyGenerated?.length ?? 0}. Skipped ${json.skipped?.length ?? 0}.`
          : action === "reject_candidates"
            ? "Selected candidates rejected."
            : "Selected sources blocked.",
      );
      setSelectedIds([]);
      await loadJobs();
      await openRun(selectedRun.run);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function generateSelected() {
    await candidateAction("generate_candidates");
  }

  async function saveBlock() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/content-factory/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "block_source",
          kind: blockKind,
          value: blockValue,
          reason: blockReason,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Block failed");
      setBlockValue("");
      setBlockReason("");
      await loadJobs();
      toast("Block saved.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Block failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(block: FactoryBlock) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/content-factory/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unblock_source", kind: block.kind, value: block.value }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Unblock failed");
      await loadJobs();
      toast("Block removed.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unblock failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function openJob(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/content-factory/jobs/${id}`);
      const json = (await res.json()) as Detail & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Load failed");
      setSelectedRun(null);
      setSelected(json);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Load failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "approve" | "reject" | "save_draft" | "retry") {
    if (!selected?.job.id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/content-factory/jobs/${selected.job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: action === "reject" ? "Rejected by admin" : undefined,
          patch:
            action === "save_draft" && selected.path
              ? {
                  title: selected.path.title,
                  description: selected.path.description,
                  short_description: selected.path.short_description,
                }
              : undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      toast(
        action === "approve"
          ? "Published"
          : action === "reject"
            ? "Rejected"
            : action === "retry"
              ? "Job re-queued"
              : "Saved draft",
      );
      await openJob(selected.job.id);
      await loadJobs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const warnings = Array.isArray(selected?.path?.warnings)
    ? (selected?.path?.warnings as string[])
    : [];
  const qualityReview = asStoredQualityReview(selected?.path?.quality_breakdown);

  const playlistUrlForPath = selected?.path?.source_playlist_url
    || (selected?.path?.source_playlist_id
      ? `https://www.youtube.com/playlist?list=${selected.path.source_playlist_id}`
      : null);

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        {health ? (
          <div className="space-y-2 rounded-xl border border-app bg-white p-4 text-xs">
            <h2 className="text-sm font-semibold">Content Factory health</h2>
            <p>
              Queued jobs: {health.jobs.queued} · Processing: {health.jobs.processing} · Review:{" "}
              {health.jobs.review} · Published: {health.jobs.published} · Failed: {health.jobs.failed}
            </p>
            <p>
              Discovery queued: {health.discovery.queued} · Running: {health.discovery.running} · Completed:{" "}
              {health.discovery.completed} · Failed: {health.discovery.failed}
            </p>
            <p>
              Quality passed: {health.quality.passed} · Warnings: {health.quality.warning} · Needs revision:{" "}
              {health.quality.needs_revision}
            </p>
            <p className="text-muted">
              Last activity: {health.lastActivityAt ? health.lastActivityAt.slice(0, 16).replace("T", " ") : "—"}
              {" · "}
              YT searches 24h: {health.costs.youtubeSearches24h}
            </p>
          </div>
        ) : null}
        <div className="space-y-2 rounded-xl border border-app bg-white p-4">
          <label className="text-sm font-medium">YouTube playlist URL or ID</label>
          <Input
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="https://www.youtube.com/playlist?list=..."
          />
          <Button type="button" disabled={busy || !playlistUrl.trim()} onClick={() => void createJob()}>
            Start research
          </Button>
          <p className="text-xs text-muted">
            Processing runs via <code>/api/cron/content-factory</code> (CRON_SECRET).
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-app bg-white p-4">
          <label className="text-sm font-medium">Discover topics</label>
          <textarea
            className="min-h-24 w-full rounded-md border border-app px-3 py-2 text-sm"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={"Digital marketing\nPython\nExcel"}
          />
          <Button type="button" disabled={busy || !topic.trim()} onClick={() => void createDiscovery()}>
            Discover &amp; publish tutorials
          </Button>
          <p className="text-xs text-muted">
            One topic per line. Finds YouTube playlists, qualifies them, builds learning paths, and
            publishes passing ones to /learn automatically.
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-app bg-white p-4">
          <h2 className="text-sm font-semibold">Blocklist</h2>
          <select
            className="w-full rounded-md border border-app px-2 py-1 text-sm"
            value={blockKind}
            onChange={(e) => setBlockKind(e.target.value as "playlist_id" | "channel_id")}
          >
            <option value="playlist_id">Blocked playlist</option>
            <option value="channel_id">Blocked channel</option>
          </select>
          <Input value={blockValue} onChange={(e) => setBlockValue(e.target.value)} placeholder="Playlist or channel ID" />
          <Input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Reason" />
          <Button type="button" disabled={busy || !blockValue.trim()} onClick={() => void saveBlock()}>
            Add block
          </Button>
          <Input value={blockQuery} onChange={(e) => setBlockQuery(e.target.value)} placeholder="Search blocks" />
          <ul className="max-h-40 space-y-1 overflow-auto text-xs">
            {blocks.map((block) => (
              <li key={block.id} className="flex items-start justify-between gap-2">
                <span>
                  {block.kind}: {block.value}
                  {block.reason ? ` · ${block.reason}` : ""}
                  <span className="block text-muted">{block.created_at.slice(0, 10)}</span>
                </span>
                <button type="button" className="text-brand hover:underline" onClick={() => void removeBlock(block)}>
                  Remove
                </button>
              </li>
            ))}
            {!blocks.length ? <li className="text-muted">No blocks.</li> : null}
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Discovery runs</h2>
          <ul className="space-y-2">
            {discoveryRuns.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => void openRun(run)}
                  className="w-full rounded-lg border border-app bg-white px-3 py-2 text-left text-sm hover:border-brand"
                >
                  <span className="font-medium">{run.topic}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {run.status} · found {run.discovered_count} · filtered {run.filtered_count} · qualified{" "}
                    {run.qualified_count ?? 0} · generated {run.generated_count ?? 0}
                  </span>
                  {run.error_message ? (
                    <span className="mt-0.5 block text-xs text-red-600">{run.error_message}</span>
                  ) : null}
                </button>
              </li>
            ))}
            {!discoveryRuns.length ? (
              <li className="text-sm text-muted">No discovery runs yet.</li>
            ) : null}
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Jobs</h2>
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => void openJob(job.id)}
                  className="w-full rounded-lg border border-app bg-white px-3 py-2 text-left text-sm hover:border-brand"
                >
                  <span className="font-medium">{job.input_value.slice(0, 28)}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {job.status} · {job.phase} · {job.progress}%
                    {job.attempts != null ? ` · attempt ${job.attempts}` : ""}
                  </span>
                  {job.status === "failed" && job.error_message ? (
                    <span className="mt-0.5 block text-xs text-red-600">{job.error_message.slice(0, 120)}</span>
                  ) : null}
                </button>
              </li>
            ))}
            {!jobs.length ? <li className="text-sm text-muted">No jobs yet.</li> : null}
          </ul>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-app bg-white p-5">
        {selectedRun ? (
          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-bold">{selectedRun.run.topic}</h2>
              <p className="text-sm text-muted">
                {selectedRun.run.status} · qualified {selectedRun.run.qualified_count ?? 0} · generated{" "}
                {selectedRun.run.generated_count ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted">
                Qualified playlists are built and published to /learn automatically when they pass
                quality checks. You can also generate up to 3 manually below.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Input
                  value={filters.topic}
                  onChange={(e) => setFilters((prev) => ({ ...prev, topic: e.target.value }))}
                  placeholder="Filter topic"
                />
                <Input
                  value={filters.creator}
                  onChange={(e) => setFilters((prev) => ({ ...prev, creator: e.target.value }))}
                  placeholder="Filter creator"
                />
                <select
                  className="rounded-md border border-app px-2 py-1"
                  value={filters.status}
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">All statuses</option>
                  <option value="discovered">discovered</option>
                  <option value="qualified">qualified</option>
                  <option value="filtered">filtered</option>
                  <option value="generating">generating</option>
                  <option value="review">review</option>
                  <option value="published">published</option>
                  <option value="rejected">rejected</option>
                  <option value="blocked">blocked</option>
                </select>
                <Input
                  value={filters.minRuleScore}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minRuleScore: e.target.value }))}
                  placeholder="Min rule score"
                />
                <Input
                  value={filters.minAiScore}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minAiScore: e.target.value }))}
                  placeholder="Min AI score"
                />
                <Input
                  value={filters.minVideos}
                  onChange={(e) => setFilters((prev) => ({ ...prev, minVideos: e.target.value }))}
                  placeholder="Min videos"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={() => void openRun(selectedRun.run)}>
                  Apply filters
                </Button>
                <Button
                  type="button"
                  disabled={busy || selectedIds.length === 0 || selectedIds.length > 3}
                  onClick={() => void generateSelected()}
                >
                  Generate selected ({selectedIds.length}/3)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || selectedIds.length === 0}
                  onClick={() => void candidateAction("reject_candidates")}
                >
                  Reject selected
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || selectedIds.length === 0}
                  onClick={() => void candidateAction("block_candidates")}
                >
                  Block selected
                </Button>
              </div>
            </div>
            <ul className="space-y-2">
              {selectedRun.candidates.map((c) => {
                const selectable = c.status === "qualified" && (c.ai_score ?? 0) >= 60;
                return (
                <li key={c.id} className="rounded-lg border border-app px-3 py-2 text-sm">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={!selectable || busy}
                      checked={selectedIds.includes(c.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          if (e.target.checked) return prev.includes(c.id) ? prev : [...prev, c.id].slice(0, 3);
                          return prev.filter((id) => id !== c.id);
                        });
                      }}
                    />
                    <span>
                  <p className="font-medium">{c.title || c.playlist_id}</p>
                  <p className="text-xs text-muted">
                    {c.status} · {c.channel_title} · {c.item_count ?? "?"} videos · rule {c.rule_score ?? "—"} · AI{" "}
                    {c.ai_score ?? "—"}
                  </p>
                  <p className="text-xs text-muted">
                    job {c.factory_job_id ? c.factory_job_id.slice(0, 8) : "—"}
                    {c.learning_path_id ? " · path linked" : ""}
                  </p>
                  {c.filter_reason || c.score_breakdown?.aiReason ? (
                    <p className="mt-1 text-xs text-neutral-700">
                      {c.score_breakdown?.aiReason || c.filter_reason}
                    </p>
                  ) : null}
                    </span>
                  </label>
                </li>
                );
              })}
              {!selectedRun.candidates.length ? (
                <li className="text-sm text-muted">No candidates for this run.</li>
              ) : null}
            </ul>
          </div>
        ) : !selected ? (
          <p className="text-sm text-muted">Select a job or discovery run to review.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{selected.path?.title ?? "Generating…"}</h2>
                <p className="text-sm text-muted">
                  Job {selected.job.status} / {selected.job.phase}
                  {selected.path?.quality_score != null
                    ? ` · Quality ${selected.path.quality_score}/100`
                    : ""}
                  {selected.curriculum?.lessons?.length
                    ? ` · ${selected.curriculum.lessons.length} lessons`
                    : ""}
                  {selected.curriculum?.sections?.length
                    ? ` · ${selected.curriculum.sections.length} sections`
                    : ""}
                </p>
                <p className="text-xs text-muted">
                  Job {selected.job.id.slice(0, 8)} · attempts {selected.job.attempts ?? 0}
                  {selected.job.updated_at ? ` · updated ${selected.job.updated_at.slice(0, 16).replace("T", " ")}` : ""}
                </p>
                {playlistUrlForPath ? (
                  <a href={playlistUrlForPath} target="_blank" rel="noreferrer" className="text-sm text-brand hover:underline">
                    Open YouTube playlist
                  </a>
                ) : null}
                {selected.job.error_message ? (
                  <p className="mt-2 text-sm text-red-600">{selected.job.error_message}</p>
                ) : null}
              </div>
              {selected.path ? (
                <div className="space-y-2">
                  {qualityReview?.status === "needs_revision" ? (
                    <p className="text-sm text-red-700">
                      Needs revision. Inspect errors before approving. Approval is still a human decision.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void act("save_draft")}>
                      Save draft
                    </Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void act("reject")}>
                      Reject
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => void act("approve")}>
                      Approve & publish
                    </Button>
                  </div>
                </div>
              ) : selected.job.status === "failed" ? (
                <Button type="button" disabled={busy} onClick={() => void act("retry")}>
                  Retry job
                </Button>
              ) : null}
            </div>

            {qualityReview ? (
              <section className="space-y-2 rounded-xl border border-app p-3">
                <h3 className="font-semibold">Quality control</h3>
                <p className="text-sm font-medium">
                  QUALITY SCORE {qualityReview.overallScore}/100
                </p>
                <p className="text-xs text-muted">STATUS {qualityLabel(qualityReview.status)}</p>
                <p className="text-sm text-neutral-700">{qualityReview.summary}</p>
                <ul className="grid gap-1 text-xs sm:grid-cols-2">
                  <li>Creator {qualityReview.scores.creator}/100</li>
                  <li>Sources {qualityReview.scores.source}/100</li>
                  <li>Curriculum {qualityReview.scores.curriculum}/100</li>
                  <li>Lessons {qualityReview.scores.lesson}/100</li>
                  <li>Writing {qualityReview.scores.writing}/100</li>
                  <li>Attribution {qualityReview.scores.attribution}/100</li>
                  <li>SEO {qualityReview.scores.seo}/100</li>
                  <li>Technical {qualityReview.scores.technical}/100</li>
                </ul>
                {qualityReview.issues.length ? (
                  <ul className="space-y-1 text-sm">
                    {qualityReview.issues.map((issue) => (
                      <li
                        key={`${issue.severity}-${issue.field}-${issue.message}`}
                        className={issue.severity === "error" ? "text-red-700" : "text-amber-800"}
                      >
                        <span className="font-medium">{issue.severity.toUpperCase()}</span>
                        {" · "}
                        {issue.field}
                        {" · "}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-600">PASS. No issues flagged.</p>
                )}
              </section>
            ) : null}

            {selected.creator ? (
              <section className="space-y-1">
                <h3 className="font-semibold">Creator</h3>
                <p className="text-sm font-medium">{selected.creator.display_name}</p>
                <p className="text-xs text-muted">
                  {selected.creator.research_status === "failed"
                    ? "Research failed"
                    : selected.creator.research_status === "pending"
                      ? "Research pending"
                      : "Research complete"}
                  {selected.creatorQualityScore != null ? ` · quality ${selected.creatorQualityScore}/100` : ""}
                  {selected.creator.updated_at
                    ? ` · last researched ${selected.creator.updated_at.slice(0, 10)}`
                    : ""}
                </p>
                <p className="text-sm text-neutral-700">{selected.creator.short_bio}</p>
                {selected.creator.teaches ? (
                  <p className="text-sm text-neutral-700">Teaches: {selected.creator.teaches}</p>
                ) : null}
                {selected.creator.youtube_channel_url ? (
                  <a
                    href={selected.creator.youtube_channel_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-brand hover:underline"
                  >
                    YouTube channel
                  </a>
                ) : null}
                {selected.creatorSources?.length ? (
                  <ul className="mt-2 space-y-1 text-xs">
                    {selected.creatorSources
                      .filter((s) => s.relationship !== "quality")
                      .map((s) => (
                        <li key={`${s.source_url}-${s.source_title}`}>
                          <a href={s.source_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                            {s.relationship === "fact" ? s.source_title : s.source_title || s.source_type}
                          </a>
                          <span className="text-muted"> · {s.source_type}</span>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {selected.path ? (
              <section className="space-y-1">
                <h3 className="font-semibold">Overview</h3>
                <label className="block text-xs text-muted">Title</label>
                <Input
                  value={selected.path.title}
                  onChange={(e) =>
                    setSelected((prev) =>
                      prev?.path ? { ...prev, path: { ...prev.path, title: e.target.value } } : prev,
                    )
                  }
                />
                <label className="mt-2 block text-xs text-muted">Short description</label>
                <Input
                  value={selected.path.short_description}
                  onChange={(e) =>
                    setSelected((prev) =>
                      prev?.path
                        ? { ...prev, path: { ...prev.path, short_description: e.target.value } }
                        : prev,
                    )
                  }
                />
                <p className="text-sm text-neutral-600">{selected.path.description}</p>
                <p className="mt-3 text-xs text-muted">
                  Certificate price, recommended course, and template are configured in{" "}
                  <strong>Learning path certificates</strong> below. That save does not change
                  publication status.
                </p>
                <p className="text-xs text-muted">
                  {selected.path.category} · {selected.path.difficulty}
                  {selected.path.status === "published" ? (
                    <>
                      {" · "}
                      <Link href={`/learn/${selected.path.slug}`} className="text-brand hover:underline">
                        View public page
                      </Link>
                    </>
                  ) : null}
                </p>
                {selected.path.artwork_public_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.path.artwork_public_url}
                    alt=""
                    className="mt-3 max-h-48 rounded-lg border border-app object-cover"
                  />
                ) : (
                  <p className="mt-3 text-xs text-muted">No cover URL yet — category fallback will show on /learn.</p>
                )}
                <p className="mt-2 text-xs text-muted">
                  Artwork status:{" "}
                  {(selected.path as { artwork_status?: string | null }).artwork_status || "unknown"}
                  {(selected.path as { artwork_source?: string | null }).artwork_source
                    ? ` · source: ${(selected.path as { artwork_source?: string | null }).artwork_source}`
                    : ""}
                </p>
                {(selected.path as { artwork_error?: string | null }).artwork_error ? (
                  <p className="mt-1 text-xs text-amber-800">
                    {(selected.path as { artwork_error?: string | null }).artwork_error}
                  </p>
                ) : null}
              </section>
            ) : null}

            {selected.path?.quiz_json || selected.path?.assessment_json ? (
              <section className="space-y-1 text-sm">
                <h3 className="font-semibold">Assessments</h3>
                <p className="text-muted">
                  Quiz items: {Array.isArray(selected.path.quiz_json) ? selected.path.quiz_json.length : 0}
                  {" · "}
                  Assessment items:{" "}
                  {Array.isArray(selected.path.assessment_json)
                    ? selected.path.assessment_json.length
                    : 0}
                </p>
              </section>
            ) : null}

            {warnings.length ? (
              <section>
                <h3 className="font-semibold">Warnings</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-800">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {selected.curriculum ? (
              <section className="space-y-3">
                <h3 className="font-semibold">Curriculum</h3>
                {selected.curriculum.sections.map((section) => (
                  <div key={section.id}>
                    <p className="text-sm font-medium">{section.title}</p>
                    <ul className="mt-1 space-y-1">
                      {selected.curriculum!.lessons
                        .filter((l) => l.section_id === section.id)
                        .map((lesson) => (
                          <li key={lesson.id} className="text-sm text-neutral-700">
                            {lesson.title}
                            {lesson.summary ? (
                              <span className="block text-xs text-muted">{lesson.summary.slice(0, 140)}</span>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}

            {selected.curriculum?.sources?.length ? (
              <section>
                <h3 className="font-semibold">Sources</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {selected.curriculum.sources.map((s) => (
                    <li key={s.source_url}>
                      <a href={s.source_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                        {s.source_title || s.source_type}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
