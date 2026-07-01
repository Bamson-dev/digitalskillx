"use client";

import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
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

export function YoutubeImport({
  courseId,
  modules,
}: {
  courseId: string;
  modules: { id: string; title: string }[];
}) {
  const [source, setSource] = useState<LessonImportSource>("youtube_playlist");
  const [url, setUrl] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeholder = useMemo(() => PLACEHOLDERS[source], [source]);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/lesson-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, url, moduleId: moduleId || undefined, source }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      setResult(`Imported ${json.imported}, skipped ${json.skipped} of ${json.total}. Refresh to see lessons.`);
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Import lessons"
        description="Import videos from YouTube, Vimeo, Wistia, or Loom as course lessons."
      />
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <Select
          value={source}
          onChange={(e) => setSource(e.target.value as LessonImportSource)}
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
        <Button onClick={run} disabled={loading || !url.trim()} className="shrink-0">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Import
        </Button>
      </div>
      {result ? <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{result}</p> : null}
      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </Card>
  );
}
