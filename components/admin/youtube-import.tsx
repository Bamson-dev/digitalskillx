"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, Loader2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { LessonImportSource } from "@/lib/lesson-import-shared";

const SOURCE_OPTIONS: { value: LessonImportSource; label: string }[] = [
  { value: "youtube_playlist", label: "YouTube playlist" },
  { value: "youtube_video", label: "YouTube single video" },
  { value: "vimeo", label: "Vimeo video" },
  { value: "wistia", label: "Wistia video" },
  { value: "loom", label: "Loom video" },
];

const PLACEHOLDERS: Record<LessonImportSource, string> = {
  youtube_playlist: "https://www.youtube.com/playlist?list=…",
  youtube_video: "https://www.youtube.com/watch?v=…",
  vimeo: "https://vimeo.com/123456789",
  wistia: "https://yourcompany.wistia.com/medias/…",
  loom: "https://www.loom.com/share/…",
};

type PreviewVideo = {
  youtubeVideoId: string | null;
  title: string;
  durationSeconds: number | null;
  contentUrl: string;
};

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function YoutubeImport({
  courseId,
  modules,
}: {
  courseId: string;
  modules: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [source, setSource] = useState<LessonImportSource>("youtube_playlist");
  const [url, setUrl] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewVideos, setPreviewVideos] = useState<PreviewVideo[] | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(() => new Set());

  const placeholder = useMemo(() => PLACEHOLDERS[source], [source]);
  const isPlaylist = source === "youtube_playlist";

  function videoKey(video: PreviewVideo) {
    return video.youtubeVideoId ?? video.contentUrl;
  }

  async function postImport(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/lesson-import", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `Import failed (${res.status})`);
    return json as { imported: number; skipped: number; total: number; videos?: PreviewVideo[] };
  }

  async function preview() {
    setLoading(true);
    setResult(null);
    setError(null);
    setPreviewVideos(null);
    try {
      const json = await postImport({ courseId, url, source, preview: true });
      const videos = json.videos ?? [];
      setPreviewVideos(videos);
      setSelectedVideoIds(new Set(videos.map((video) => videoKey(video))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function runImport(selectedOnly = false) {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const videoIds =
        selectedOnly && previewVideos
          ? [...selectedVideoIds]
          : undefined;
      const json = await postImport({
        courseId,
        url,
        moduleId: moduleId || undefined,
        source,
        videoIds,
      });
      setResult(`Imported ${json.imported}, skipped ${json.skipped} of ${json.total}.`);
      setUrl("");
      setPreviewVideos(null);
      setSelectedVideoIds(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function toggleVideo(id: string, checked: boolean) {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllPreview(checked: boolean) {
    if (!previewVideos) return;
    setSelectedVideoIds(
      checked ? new Set(previewVideos.map((video) => videoKey(video))) : new Set(),
    );
  }

  return (
    <Card>
      <CardHeader
        title="Import lessons"
        description="Import videos from YouTube, Vimeo, Wistia, or Loom. For playlists, preview first and uncheck videos you do not want."
      />
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <Select
          value={source}
          onChange={(e) => {
            setSource(e.target.value as LessonImportSource);
            setPreviewVideos(null);
            setSelectedVideoIds(new Set());
          }}
          className="lg:w-52"
          aria-label="Import source"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1"
        />
        <Select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="sm:w-56">
          <option value="">New module</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </Select>
        {isPlaylist ? (
          <Button onClick={preview} disabled={loading || !url.trim()} variant="outline" className="shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Preview
          </Button>
        ) : null}
        <Button
          onClick={() => runImport(Boolean(previewVideos && isPlaylist))}
          disabled={loading || !url.trim() || (isPlaylist && previewVideos !== null && selectedVideoIds.size === 0)}
          className="shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Import
        </Button>
      </div>

      {previewVideos ? (
        <div className="mt-4 rounded-lg border border-app bg-surface-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app px-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedVideoIds.size > 0 && selectedVideoIds.size === previewVideos.length}
                onChange={(event) => toggleAllPreview(event.target.checked)}
              />
              Select all ({previewVideos.length} videos)
            </label>
            <span className="text-xs text-muted">{selectedVideoIds.size} selected for import</span>
          </div>
          <ul className="max-h-72 divide-y divide-app overflow-y-auto">
            {previewVideos.map((video) => {
              const key = videoKey(video);
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-white/60">
                    <input
                      type="checkbox"
                      checked={selectedVideoIds.has(key)}
                      onChange={(event) => toggleVideo(key, event.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-neutral-900">{video.title}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {formatDuration(video.durationSeconds)}
                        {video.youtubeVideoId ? ` · ${video.youtubeVideoId}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {result ? <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{result}</p> : null}
      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <p className="mt-3 text-xs text-muted">
        After import, remove unwanted videos from the Curriculum section using the trash icon or bulk delete checkboxes.
      </p>
    </Card>
  );
}
