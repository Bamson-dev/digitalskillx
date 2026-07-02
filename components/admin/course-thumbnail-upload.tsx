"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp";

const IMAGE_REQUIREMENTS = [
  { label: "Size", value: "1280 × 720 pixels (16:9 landscape)" },
  { label: "Max file size", value: "2 MB" },
  { label: "Formats", value: "JPG, PNG, or WebP" },
  { label: "Tip", value: "Use a sharp image with minimal text — it appears on cards and the sales page" },
] as const;

function ImageRequirementsNote() {
  return (
    <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2.5">
      <p className="text-xs font-semibold text-amber-950">Image requirements</p>
      <ul className="mt-1.5 space-y-1 text-xs text-amber-900/90">
        {IMAGE_REQUIREMENTS.map((item) => (
          <li key={item.label} className="flex gap-2">
            <span className="shrink-0 font-medium">{item.label}:</span>
            <span>{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Props = {
  initialUrl: string | null;
  courseTitle: string;
};

export function CourseThumbnailUpload({ initialUrl, courseTitle }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [persistedUrl, setPersistedUrl] = useState(initialUrl ?? "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayUrl = cleared ? null : previewUrl ?? (persistedUrl || null);

  useEffect(() => {
    setPersistedUrl(initialUrl ?? "");
  }, [initialUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const validateFile = useCallback((file: File) => {
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      return "Upload a JPG, PNG, or WebP image.";
    }
    if (file.size > MAX_BYTES) {
      return "Image must be 2 MB or smaller.";
    }
    return null;
  }, []);

  const applyFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setCleared(false);
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));

      const input = inputRef.current;
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
      }
    },
    [previewUrl, validateFile],
  );

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    applyFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    applyFile(event.dataTransfer.files?.[0] ?? null);
  }

  function handleRemove() {
    setCleared(true);
    setError(null);
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleUndoClear() {
    setCleared(false);
  }

  return (
    <div className="space-y-3">
      <ImageRequirementsNote />

      <input type="hidden" name="thumbnail_url" value={cleared ? "" : persistedUrl} />
      <input type="hidden" name="clear_thumbnail" value={cleared ? "1" : "0"} />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "relative overflow-hidden rounded-xl border-2 border-dashed transition-colors",
          dragging ? "border-brand bg-brand-50/50" : "border-app bg-surface-muted/30",
        )}
      >
        {displayUrl ? (
          <div className="group relative aspect-[16/9] w-full bg-neutral-100">
            <Image
              src={displayUrl}
              alt={courseTitle ? `${courseTitle} course image` : "Course image preview"}
              fill
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow"
              >
                <Upload className="h-4 w-4" />
                Replace image
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-red-600 shadow"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-3 px-6 py-10 text-center transition hover:bg-brand-50/40"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
              <ImagePlus className="h-7 w-7 text-brand" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">Upload course image</p>
              <p className="mt-1 text-xs text-muted">Drag and drop, or click to browse</p>
              <p className="mt-2 text-xs font-medium text-neutral-700">
                Use 1280×720 px · max 2 MB · JPG, PNG, or WebP
              </p>
            </div>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        name="thumbnail"
        accept={ACCEPT}
        className="sr-only"
        onChange={handleInputChange}
      />

      {cleared && persistedUrl ? (
        <button
          type="button"
          onClick={handleUndoClear}
          className="text-xs font-medium text-brand hover:underline"
        >
          Undo remove — keep current saved image
        </button>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
