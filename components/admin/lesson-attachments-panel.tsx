"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { FileText, Link2, Paperclip, Trash2, Upload } from "lucide-react";
import { Label, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  addLessonAttachment,
  deleteLessonResource,
  type LessonAttachmentState,
} from "@/app/(admin)/admin/(panel)/courses/actions";
import {
  attachmentKind,
  attachmentKindLabel,
  type AttachmentDisplay,
} from "@/lib/lesson-attachments-shared";

const initial: LessonAttachmentState = {};

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
  attachments,
}: {
  courseId: string;
  lessonId: string;
  attachments: AttachmentDisplay[];
}) {
  const [mode, setMode] = useState<"file" | "link">("file");
  const [state, action] = useFormState(addLessonAttachment, initial);

  return (
    <div className="sm:col-span-2 rounded-xl border border-dashed border-app bg-surface-muted/30 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-neutral-900">Lesson attachments</h4>
          <p className="mt-1 text-xs text-muted">
            Add PDFs, documents, or links students can download below the video.
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

      <form action={action} className="grid gap-3 sm:grid-cols-2" encType="multipart/form-data">
        <input type="hidden" name="course_id" value={courseId} />
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input type="hidden" name="mode" value={mode} />

        <div className="sm:col-span-2">
          <Label htmlFor={`attachment-title-${lessonId}`}>Display name</Label>
          <Input
            id={`attachment-title-${lessonId}`}
            name="title"
            placeholder={mode === "file" ? "e.g. Lesson workbook PDF" : "e.g. Google Doc template"}
            required
          />
        </div>

        {mode === "file" ? (
          <div className="sm:col-span-2">
            <Label htmlFor={`attachment-file-${lessonId}`}>File</Label>
            <Input
              id={`attachment-file-${lessonId}`}
              name="file"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,application/pdf"
              required
            />
            <p className="mt-1 text-xs text-muted">PDF, Word, Excel, PowerPoint, TXT, or ZIP · max 10 MB</p>
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

        <div className="sm:col-span-2 flex items-center gap-3">
          <SubmitButton size="sm" variant="outline" pendingText="Adding…">
            {mode === "file" ? (
              <>
                <Upload className="h-4 w-4" /> Add file
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" /> Add link
              </>
            )}
          </SubmitButton>
          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
          {state.message ? <p className="text-sm text-green-700">{state.message}</p> : null}
        </div>
      </form>
    </div>
  );
}
