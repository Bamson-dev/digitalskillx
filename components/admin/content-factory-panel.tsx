"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type Job = {
  id: string;
  input_type: string;
  input_value: string;
  status: string;
  phase: string;
  progress: number;
  learning_path_id: string | null;
  error_message: string | null;
  created_at: string;
  result_snapshot?: { slug?: string; qualityScore?: number; lessonCount?: number };
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
    warnings: unknown;
    artwork_public_url: string | null;
    quiz_json: unknown;
    assessment_json: unknown;
  } | null;
  creator: {
    display_name: string;
    short_bio: string;
    youtube_channel_url: string | null;
    credentials: string;
    relevance: string;
  } | null;
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/admin/content-factory/jobs");
    const json = (await res.json()) as { jobs?: Job[]; error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to load jobs");
    setJobs(json.jobs ?? []);
  }, []);

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

  async function openJob(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/content-factory/jobs/${id}`);
      const json = (await res.json()) as Detail & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Load failed");
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

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
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
                  </span>
                </button>
              </li>
            ))}
            {!jobs.length ? <li className="text-sm text-muted">No jobs yet.</li> : null}
          </ul>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-app bg-white p-5">
        {!selected ? (
          <p className="text-sm text-muted">Select a job to review generated output.</p>
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
                </p>
                {selected.job.error_message ? (
                  <p className="mt-2 text-sm text-red-600">{selected.job.error_message}</p>
                ) : null}
              </div>
              {selected.path ? (
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
              ) : selected.job.status === "failed" ? (
                <Button type="button" disabled={busy} onClick={() => void act("retry")}>
                  Retry job
                </Button>
              ) : null}
            </div>

            {selected.creator ? (
              <section className="space-y-1">
                <h3 className="font-semibold">Creator</h3>
                <p className="text-sm font-medium">{selected.creator.display_name}</p>
                <p className="text-sm text-neutral-700">{selected.creator.short_bio}</p>
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
