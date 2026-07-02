"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  Link2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Label, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  addCourseResource,
  deleteCourseResource,
  reorderCourseResources,
  type CourseResourceState,
} from "@/app/(admin)/admin/(panel)/courses/actions";
import {
  attachmentKind,
  attachmentKindLabel,
  type AttachmentDisplay,
} from "@/lib/lesson-attachments-shared";

const initial: CourseResourceState = {};

type CourseResourceItem = AttachmentDisplay;

function ResourceIcon({ kind }: { kind: ReturnType<typeof attachmentKind> }) {
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

export function CourseResourcesPanel({
  courseId,
  resources: initialResources,
}: {
  courseId: string;
  resources: CourseResourceItem[];
}) {
  const [mode, setMode] = useState<"file" | "link">("file");
  const [state, action] = useFormState(addCourseResource, initial);
  const [resources, setResources] = useState(initialResources);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setResources(initialResources);
  }, [initialResources]);

  function persistOrder(nextResources: CourseResourceItem[]) {
    setResources(nextResources);
    startTransition(async () => {
      await reorderCourseResources(
        courseId,
        nextResources.map((resource) => resource.id),
      );
    });
  }

  function moveResource(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= resources.length) return;
    const next = [...resources];
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next);
  }

  function handleDrop(targetIndex: number) {
    if (!draggingId) return;
    const fromIndex = resources.findIndex((resource) => resource.id === draggingId);
    if (fromIndex < 0 || fromIndex === targetIndex) return;
    const next = [...resources];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(targetIndex, 0, moved);
    persistOrder(next);
    setDraggingId(null);
  }

  return (
    <Card>
      <CardHeader
        title="Course resources"
        description="Downloads for the whole course — PDFs, files, or external links. Stored privately; students download via signed URLs."
      />

      {resources.length > 0 ? (
        <ul className={`mb-4 divide-y divide-[rgb(var(--border))] rounded-lg border border-app bg-white ${isPending ? "opacity-80" : ""}`}>
          {resources.map((resource, index) => {
            const kind = attachmentKind(resource.file_type, resource.file_url);
            return (
              <li
                key={resource.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(index);
                }}
                className={draggingId === resource.id ? "bg-brand-50/80" : ""}
              >
                <div className="flex items-center gap-1 px-2 py-2">
                  <div
                    draggable
                    onDragStart={() => setDraggingId(resource.id)}
                    onDragEnd={() => setDraggingId(null)}
                    className="cursor-grab rounded p-1 text-muted hover:bg-brand-50 active:cursor-grabbing"
                    aria-label={`Drag to reorder ${resource.title}`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>

                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveResource(index, -1)}
                      disabled={index === 0 || isPending}
                      className="rounded p-0.5 text-muted hover:bg-brand-50 disabled:opacity-30"
                      aria-label="Move resource up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveResource(index, 1)}
                      disabled={index === resources.length - 1 || isPending}
                      className="rounded p-0.5 text-muted hover:bg-brand-50 disabled:opacity-30"
                      aria-label="Move resource down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>

                  <ResourceIcon kind={kind} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{resource.title}</p>
                    <p className="text-xs text-muted">{attachmentKindLabel(kind)}</p>
                  </div>

                  <form action={deleteCourseResource}>
                    <input type="hidden" name="id" value={resource.id} />
                    <input type="hidden" name="course_id" value={courseId} />
                    <button
                      type="submit"
                      className="rounded p-1.5 text-red-600 hover:bg-red-50"
                      aria-label={`Remove ${resource.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">No course resources yet.</p>
      )}

      <div className="rounded-xl border border-dashed border-app bg-surface-muted/30 p-4">
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
          <input type="hidden" name="mode" value={mode} />

          <div className="sm:col-span-2">
            <Label htmlFor="course-resource-title">Title</Label>
            <Input
              id="course-resource-title"
              name="title"
              placeholder={mode === "file" ? "e.g. Course workbook PDF" : "e.g. Bonus templates"}
              required
            />
          </div>

          {mode === "file" ? (
            <div className="sm:col-span-2">
              <Label htmlFor="course-resource-file">File</Label>
              <Input
                id="course-resource-file"
                name="file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,application/pdf"
                required
              />
              <p className="mt-1 text-xs text-muted">
                PDF, Word, Excel, PowerPoint, TXT, or ZIP · max 10 MB
              </p>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Label htmlFor="course-resource-link">URL</Label>
              <Input
                id="course-resource-link"
                name="link_url"
                type="url"
                placeholder="https://drive.google.com/..."
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
    </Card>
  );
}
