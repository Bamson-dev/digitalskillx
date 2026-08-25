"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link2, Paperclip, Trash2, Upload } from "lucide-react";
import { Label, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  addLessonAttachment,
  deleteLessonResource,
} from "@/app/(admin)/admin/(panel)/courses/actions";
import {
  attachmentKind,
  attachmentKindLabel,
  type AttachmentDisplay,
} from "@/lib/lesson-attachments-shared";

function AttachmentIcon({ kind }: { kind: ReturnType<typeof attachmentKind> }) {
  const className = "h-5 w-5 shrink-0";
  switch (kind) {
    case "link":
      return <Link2 className={`${className} text-blue-600`} />;
    case "pdf":
      return <FileText className={`${className} text-red-600`} />;
    default:
      return <Paperclip className={`${className} text-slate-600`} />;
  }
}

export function LessonAttachmentsPanel({
  courseId,
  lessonId,
  attachments: initialAttachments,
}: {
  courseId: string;
  lessonId: string;
  attachments: AttachmentDisplay[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "link">("file");
  const [attachments, setAttachments] = useState(initialAttachments);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const attachmentKey = initialAttachments.map((row) => row.id).join("|");
  useEffect(() => {
    setAttachments(initialAttachments);
    // Sync after server refresh / lesson switch — keyed by attachment ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional key sync
  }, [lessonId, attachmentKey]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    setMessage(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("course_id", courseId);
    data.set("lesson_id", lessonId);
    data.set("mode", mode);

    if (mode === "file") {
      const picked = fileRef.current?.files?.[0];
      if (!picked || picked.size <= 0) {
        setError("Choose a PDF or document file first.");
        return;
      }
      data.set("file", picked);
    }

    setPending(true);
    try {
      const result = await addLessonAttachment({}, data);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.attachment) {
        setAttachments((prev) => {
          if (prev.some((row) => row.id === result.attachment!.id)) return prev;
          return [...prev, result.attachment!];
        });
      }
      setMessage(result.message ?? "Attachment uploaded to server storage.");
      form.reset();
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload file.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-dashed border-app bg-surface-muted/30 p-4"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-neutral-900">Lesson attachments</h4>
          <p className="mt-1 text-xs text-muted">
            Choose a file, then click <strong>Upload to server</strong> — not Save lesson. Files
            are stored on the server for student download.
          </p>
        </div>
        {attachments.length > 0 ? (
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand">
            {attachments.length} attached
          </span>
        ) : null}
      </div>

      {attachments.length > 0 ? (
        <ul className="mb-4 divide-y divide-[rgb(var(--border))] rounded-lg border border-app bg-white">
          {attachments.map((attachment) => {
            const kind = attachmentKind(attachment.file_type, attachment.file_url);
            return (
              <li key={attachment.id} className="flex items-center gap-3 px-3 py-2.5">
                <AttachmentIcon kind={kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{attachment.title}</p>
                  <p className="text-xs text-muted">{attachmentKindLabel(kind)}</p>
                </div>
                <form action={deleteLessonResource}>
                  <input type="hidden" name="id" value={attachment.id} />
                  <input type="hidden" name="course_id" value={courseId} />
                  <input type="hidden" name="lesson_id" value={lessonId} />
                  <button
                    type="submit"
                    className="rounded p-1.5 text-red-600 hover:bg-red-50"
                    aria-label={`Remove ${attachment.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">No attachments yet for this lesson.</p>
      )}

      <div className="mb-3 inline-flex rounded-lg border border-app bg-white p-1">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            mode === "file" ? "bg-brand text-white" : "text-muted hover:text-foreground"
          }`}
        >
          Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            mode === "link" ? "bg-brand text-white" : "text-muted hover:text-foreground"
          }`}
        >
          External link
        </button>
      </div>

      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="grid gap-3 sm:grid-cols-2"
        encType="multipart/form-data"
      >
        <div className="sm:col-span-2">
          <Label htmlFor={`attachment-title-${lessonId}`}>Display name</Label>
          <Input
            id={`attachment-title-${lessonId}`}
            name="title"
            placeholder={mode === "file" ? "e.g. App Idea Vault" : "e.g. Google Doc template"}
            required
          />
        </div>

        {mode === "file" ? (
          <div className="sm:col-span-2">
            <Label htmlFor={`attachment-file-${lessonId}`}>File</Label>
            <input
              ref={fileRef}
              id={`attachment-file-${lessonId}`}
              name="file"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,application/pdf"
              required
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
            />
            <p className="mt-1 text-xs text-muted">
              PDF, Word, Excel, PowerPoint, TXT, or ZIP · max 25 MB · stored on the server
            </p>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <Label htmlFor={`attachment-link-${lessonId}`}>URL</Label>
            <Input
              id={`attachment-link-${lessonId}`}
              name="link_url"
              type="url"
              placeholder="https://docs.google.com/..."
              required
            />
          </div>
        )}

        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {mode === "file" ? (
              <>
                <Upload className="h-4 w-4" /> {pending ? "Uploading to server…" : "Upload to server"}
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" /> {pending ? "Adding…" : "Add link"}
              </>
            )}
          </Button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
        </div>
      </form>
    </div>
  );
}
