"use client";

import { useState } from "react";
import { Youtube, Loader2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function YoutubeImport({
  courseId,
  modules,
}: {
  courseId: string;
  modules: { id: string; title: string }[];
}) {
  const [url, setUrl] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/youtube-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, url, moduleId: moduleId || undefined }),
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
        title="Import from YouTube"
        description="Paste a video, playlist or channel URL — lessons are created automatically."
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/playlist?list=…"
          className="flex-1"
        />
        <Select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="sm:w-56">
          <option value="">New module</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </Select>
        <Button onClick={run} disabled={loading || !url}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
          Import
        </Button>
      </div>
      {result ? <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{result}</p> : null}
      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </Card>
  );
}
