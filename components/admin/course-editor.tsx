"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CourseSettingsForm } from "@/components/admin/course-settings-form";
import Link from "next/link";
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, Save, HelpCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import { LessonAttachmentsPanel } from "@/components/admin/lesson-attachments-panel";
import { CourseResourcesPanel } from "@/components/admin/course-resources-panel";
import type { AttachmentDisplay } from "@/lib/lesson-attachments-shared";
import type { Course, CourseCategory, Lesson, Module } from "@/types/database";
import type { CertificateTemplateKey } from "@/lib/certificate-templates";
import { getBrokenLessonFlags } from "@/lib/broken-lessons-shared";
import { comingSoonAvailableAtInputValue } from "@/lib/lesson-coming-soon";
import {
  deleteCourse,
  createModule,
  renameModule,
  deleteModule,
  createLesson,
  updateLesson,
  reorderLessons,
} from "@/app/(admin)/admin/(panel)/courses/actions";

async function deleteLessonsViaApi(courseId: string, lessonIds: string[]) {
  const response = await fetch("/api/admin/lessons", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseId, lessonIds }),
  });
  const json = (await response.json()) as { error?: string; deleted?: number };
  if (!response.ok) {
    throw new Error(json.error ?? "Could not delete lessons.");
  }
}

type ModuleWithLessons = Module & { lessons: Lesson[] };

const LESSON_TYPES: { value: Lesson["lesson_type"]; label: string }[] = [
  { value: "video", label: "Video (YouTube/Vimeo/upload)" },
  { value: "pdf", label: "PDF" },
  { value: "text", label: "Text" },
  { value: "audio", label: "Audio" },
  { value: "slides", label: "Slides (Google/Canva)" },
  { value: "download", label: "File download" },
  { value: "embed", label: "Embedded website" },
];

export function CourseEditor({
  course,
  modules,
  categories,
  globalDefaultTemplateKey,
  lessonAttachments,
  courseResources,
}: {
  course: Course;
  modules: ModuleWithLessons[];
  categories: Pick<CourseCategory, "id" | "name" | "template_key">[];
  globalDefaultTemplateKey: CertificateTemplateKey;
  lessonAttachments: Record<string, AttachmentDisplay[]>;
  courseResources: AttachmentDisplay[];
}) {
  return (
    <div className="space-y-6">
      <CourseSettingsForm
        course={course}
        categories={categories}
        globalDefaultTemplateKey={globalDefaultTemplateKey}
      />
      <CourseResourcesPanel courseId={course.id} resources={courseResources} />
      <CurriculumCard courseId={course.id} modules={modules} lessonAttachments={lessonAttachments} />
      <DangerZone courseId={course.id} />
    </div>
  );
}

function CurriculumCard({
  courseId,
  modules,
  lessonAttachments,
}: {
  courseId: string;
  modules: ModuleWithLessons[];
  lessonAttachments: Record<string, AttachmentDisplay[]>;
}) {
  return (
    <Card id="course-curriculum">
      <CardHeader
        title="Curriculum"
        description="Remove imported videos with the trash icon, or select several and use Delete selected."
      />
      <div className="space-y-4">
        {modules.map((m) => (
          <ModuleBlock key={m.id} courseId={courseId} module={m} lessonAttachments={lessonAttachments} />
        ))}
      </div>

      <form action={createModule} className="mt-4 flex gap-2">
        <input type="hidden" name="course_id" value={courseId} />
        <Input name="title" placeholder="New module title" />
        <SubmitButton variant="outline" pendingText="Adding…">
          <Plus className="h-4 w-4" /> Module
        </SubmitButton>
      </form>
    </Card>
  );
}

function ModuleBlock({
  courseId,
  module,
  lessonAttachments,
}: {
  courseId: string;
  module: ModuleWithLessons;
  lessonAttachments: Record<string, AttachmentDisplay[]>;
}) {
  const router = useRouter();
  const initialLessons = [...(module.lessons ?? [])].sort((a, b) => a.position - b.position);
  const [lessons, setLessons] = useState(initialLessons);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLessons([...(module.lessons ?? [])].sort((a, b) => a.position - b.position));
    setSelectedIds(new Set());
  }, [module.id, module.lessons]);

  function toggleLessonSelection(lessonId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(lessonId);
      else next.delete(lessonId);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(lessons.map((lesson) => lesson.id)) : new Set());
  }

  function deleteSelectedLessons() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const label = ids.length === 1 ? "1 lesson" : `${ids.length} lessons`;
    if (!confirm(`Delete ${label} from "${module.title}"? This cannot be undone.`)) return;

    setBulkError(null);
    startTransition(async () => {
      try {
        await deleteLessonsViaApi(courseId, ids);
        setSelectedIds(new Set());
        router.refresh();
      } catch (err) {
        setBulkError(err instanceof Error ? err.message : "Could not delete lessons.");
      }
    });
  }

  function persistOrder(nextLessons: Lesson[]) {
    setLessons(nextLessons);
    startTransition(async () => {
      await reorderLessons(
        courseId,
        module.id,
        nextLessons.map((lesson) => lesson.id),
      );
    });
  }

  function moveLesson(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= lessons.length || fromIndex === toIndex) return;
    const next = [...lessons];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    persistOrder(next);
  }

  function handleDragStart(event: React.DragEvent, lessonId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", lessonId);
    setDraggingId(lessonId);
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event: React.DragEvent, targetId: string) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain");
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;

    const fromIndex = lessons.findIndex((lesson) => lesson.id === sourceId);
    const toIndex = lessons.findIndex((lesson) => lesson.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    moveLesson(fromIndex, toIndex);
  }

  return (
    <div className="rounded-lg border border-app">
      <div className="flex items-center gap-2 border-b border-app bg-brand-50/50 p-3">
        <GripVertical className="h-4 w-4 text-muted" aria-hidden />
        <form action={renameModule} method="post" className="flex min-w-0 flex-1 items-center gap-2">
          <input type="hidden" name="id" value={module.id} />
          <input type="hidden" name="course_id" value={courseId} />
          <Input name="title" defaultValue={module.title} className="h-8 min-w-0" />
          <Button size="sm" variant="ghost" type="submit">
            Rename
          </Button>
        </form>
        <DeleteModuleButton courseId={courseId} moduleId={module.id} moduleTitle={module.title} />
      </div>

      {lessons.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app bg-surface-muted/20 px-3 py-2 text-xs text-muted">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === lessons.length}
              onChange={(event) => toggleSelectAll(event.target.checked)}
              aria-label="Select all lessons in module"
            />
            Select all
          </label>
          {selectedIds.size > 0 ? (
            <Button
              size="sm"
              variant="danger"
              type="button"
              disabled={isPending}
              onClick={deleteSelectedLessons}
            >
              <Trash2 className="h-4 w-4" /> Delete selected ({selectedIds.size})
            </Button>
          ) : (
            <span>Check lessons, then delete with the red trash icon.</span>
          )}
        </div>
      ) : null}
      {bulkError ? <p className="px-3 py-2 text-xs text-red-600">{bulkError}</p> : null}

      <div className="divide-y divide-[rgb(var(--border))]">
        {lessons.map((lesson, index) => (
          <LessonRow
            key={lesson.id}
            courseId={courseId}
            lesson={lesson}
            attachments={lessonAttachments[lesson.id] ?? []}
            index={index}
            isFirst={index === 0}
            isLast={index === lessons.length - 1}
            isDragging={draggingId === lesson.id}
            isPending={isPending}
            selected={selectedIds.has(lesson.id)}
            onToggleSelect={(checked) => toggleLessonSelection(lesson.id, checked)}
            onMoveUp={() => moveLesson(index, index - 1)}
            onMoveDown={() => moveLesson(index, index + 1)}
            onDragStart={(event) => handleDragStart(event, lesson.id)}
            onDragOver={handleDragOver}
            onDrop={(event) => handleDrop(event, lesson.id)}
            onDragEnd={() => setDraggingId(null)}
          />
        ))}
      </div>

      <form action={createLesson} className="flex gap-2 p-3">
        <input type="hidden" name="module_id" value={module.id} />
        <input type="hidden" name="course_id" value={courseId} />
        <Input name="title" placeholder="New lesson title" className="h-8" />
        <Select name="lesson_type" className="h-8 w-40">
          {LESSON_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <SubmitButton size="sm" variant="outline" pendingText="…">
          <Plus className="h-4 w-4" /> Lesson
        </SubmitButton>
      </form>
    </div>
  );
}

function LessonRow({
  courseId,
  lesson,
  attachments,
  index,
  isFirst,
  isLast,
  isDragging,
  isPending,
  selected,
  onToggleSelect,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  courseId: string;
  lesson: Lesson;
  attachments: AttachmentDisplay[];
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isDragging: boolean;
  isPending: boolean;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const brokenFlags = getBrokenLessonFlags(lesson);
  const displayTitle = lesson.title?.trim() || "(no title)";

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`${isDragging ? "bg-brand-50/80" : ""} ${isPending ? "opacity-80" : ""} ${selected ? "bg-red-50/40" : ""}`}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onToggleSelect(event.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-neutral-300 text-brand focus:ring-brand"
          aria-label={`Select ${lesson.title}`}
        />

        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="cursor-grab rounded p-1 text-muted hover:bg-brand-50 active:cursor-grabbing"
          aria-label={`Drag to reorder lesson ${index + 1}`}
        >
          <GripVertical className="h-4 w-4" />
        </div>

        <div className="flex flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst || isPending}
            className="rounded p-0.5 text-muted hover:bg-brand-50 disabled:opacity-30"
            aria-label="Move lesson up"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast || isPending}
            className="rounded p-0.5 text-muted hover:bg-brand-50 disabled:opacity-30"
            aria-label="Move lesson down"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center justify-between text-left text-sm hover:text-brand"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {lesson.lesson_type}
            </span>
            <span className="truncate">{displayTitle}</span>
            {lesson.is_coming_soon ? (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                Coming soon
              </span>
            ) : null}
            {brokenFlags.length > 0 ? (
              <span
                className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
                title={brokenFlags.join(", ")}
              >
                Broken
              </span>
            ) : null}
            {lesson.youtube_video_id ? (
              <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700">
                YouTube
              </span>
            ) : null}
            {attachments.length > 0 ? (
              <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand">
                {attachments.length} file{attachments.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        <DeleteLessonButton
          courseId={courseId}
          lessonId={lesson.id}
          lessonTitle={lesson.title}
          variant="icon"
        />
      </div>

      {open ? (
        <form action={updateLesson} className="grid gap-3 border-t border-app bg-card p-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={lesson.id} />
          <input type="hidden" name="course_id" value={courseId} />
          <div className="sm:col-span-2">
            <Label>Title</Label>
            <Input name="title" defaultValue={lesson.title} />
          </div>
          <div>
            <Label>Type</Label>
            <Select name="lesson_type" defaultValue={lesson.lesson_type}>
              {LESSON_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Duration (minutes)</Label>
            <Input
              name="duration_minutes"
              type="number"
              min={0}
              step={1}
              defaultValue={lesson.duration_seconds ? Math.round(lesson.duration_seconds / 60) : ""}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Content URL (video/PDF/audio/embed)</Label>
            <Input name="content_url" defaultValue={lesson.content_url ?? ""} placeholder="https://youtube.com/watch?v=…" />
          </div>
          <div className="sm:col-span-2">
            <Label>Text content (for text lessons)</Label>
            <Textarea name="content_text" rows={3} defaultValue={lesson.content_text ?? ""} />
          </div>
          <div>
            <Label>Required watch %</Label>
            <Input name="required_watch_pct" type="number" min={0} max={100} defaultValue={lesson.required_watch_pct} />
          </div>
          <div>
            <Label>Drip (days after enrollment)</Label>
            <Input name="drip_days" type="number" min={0} defaultValue={lesson.drip_days ?? ""} />
          </div>
          <div className="flex items-center gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_free_preview" defaultChecked={lesson.is_free_preview} />
              Free preview
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_locked" defaultChecked={lesson.is_locked} />
              Locked until previous complete
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_coming_soon" defaultChecked={lesson.is_coming_soon} />
              Coming soon
            </label>
          </div>

          <div className="sm:col-span-2 rounded-xl border border-amber-200/80 bg-amber-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Coming soon</p>
            <p className="mt-1 text-sm text-neutral-700">
              Students see this lesson in the list and can open it, but content is replaced with a
              Coming Soon page until you turn this off.
            </p>
            <div className="mt-3">
              <Label htmlFor={`coming_soon_available_at_${lesson.id}`}>
                Expected availability (optional)
              </Label>
              <Input
                id={`coming_soon_available_at_${lesson.id}`}
                name="coming_soon_available_at"
                type="datetime-local"
                defaultValue={comingSoonAvailableAtInputValue(lesson.coming_soon_available_at)}
              />
              <p className="mt-1 text-xs text-muted">
                Shown to students on the Coming Soon page. Leave blank if the date is not set yet.
              </p>
            </div>
          </div>

          <LessonAttachmentsPanel
            courseId={courseId}
            lessonId={lesson.id}
            attachments={attachments}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton size="sm" pendingText="Saving…">
                <Save className="h-4 w-4" /> Save lesson
              </SubmitButton>
              <Link
                href={`/admin/quizzes/${lesson.id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                <HelpCircle className="h-4 w-4" /> Manage quiz
              </Link>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function DeleteModuleButton({
  courseId,
  moduleId,
  moduleTitle,
}: {
  courseId: string;
  moduleId: string;
  moduleTitle: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    const label = moduleTitle.trim() || "this module";
    if (!confirm(`Delete "${label}" and all its lessons? This cannot be undone.`)) return;

    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("id", moduleId);
        formData.set("course_id", courseId);
        await deleteModule(formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete module.");
      }
    });
  }

  return (
    <div className="relative z-10 flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={onDelete}
        aria-label="Delete module"
        className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {error ? <p className="max-w-[12rem] text-right text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function DeleteLessonButton({
  courseId,
  lessonId,
  lessonTitle,
  variant = "button",
}: {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  variant?: "button" | "icon";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    const label = lessonTitle.trim() || "this lesson";
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;

    setError(null);
    startTransition(async () => {
      try {
        await deleteLessonsViaApi(courseId, [lessonId]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete lesson.");
      }
    });
  }

  if (variant === "icon") {
    return (
      <div className="relative z-10 flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          disabled={isPending}
          onClick={onDelete}
          aria-label={`Delete ${lessonTitle}`}
          title={`Delete "${lessonTitle}"`}
          className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">Delete</span>
        </button>
        {error ? <p className="max-w-[12rem] text-right text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="danger" type="button" disabled={isPending} onClick={onDelete}>
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function DangerZone({ courseId }: { courseId: string }) {
  return (
    <Card className="border-red-200">
      <CardHeader title="Danger zone" description="Deleting a course removes all its modules, lessons and progress." />
      <form action={deleteCourse}>
        <input type="hidden" name="id" value={courseId} />
        <Button variant="danger" type="submit">
          <Trash2 className="h-4 w-4" /> Delete course
        </Button>
      </form>
    </Card>
  );
}
