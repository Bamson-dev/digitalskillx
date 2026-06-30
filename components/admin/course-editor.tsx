"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, ChevronDown, GripVertical, Save, HelpCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import type { Course, CourseCategory, Lesson, Module } from "@/types/database";
import {
  updateCourseSettings,
  deleteCourse,
  createModule,
  renameModule,
  deleteModule,
  createLesson,
  updateLesson,
  deleteLesson,
} from "@/app/(admin)/admin/(panel)/courses/actions";

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
}: {
  course: Course;
  modules: ModuleWithLessons[];
  categories: Pick<CourseCategory, "id" | "name">[];
}) {
  return (
    <div className="space-y-6">
      <SettingsCard course={course} categories={categories} />
      <CurriculumCard courseId={course.id} modules={modules} />
      <DangerZone courseId={course.id} />
    </div>
  );
}

function SettingsCard({
  course,
  categories,
}: {
  course: Course;
  categories: Pick<CourseCategory, "id" | "name">[];
}) {
  return (
    <Card>
      <CardHeader title="Course settings" description="Title, visibility, completion & certificate rules." />
      <form action={updateCourseSettings} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={course.id} />
        <div className="sm:col-span-2">
          <Label>Title</Label>
          <Input name="title" defaultValue={course.title} required />
        </div>
        <div className="sm:col-span-2">
          <Label>Description</Label>
          <Textarea name="description" rows={3} defaultValue={course.description ?? ""} />
        </div>
        <div>
          <Label>Thumbnail URL</Label>
          <Input name="thumbnail_url" defaultValue={course.thumbnail_url ?? ""} placeholder="https://…" />
        </div>
        <div>
          <Label>Category</Label>
          <Select name="category_id" defaultValue={course.category_id ?? ""}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Visibility</Label>
          <Select name="visibility" defaultValue={course.visibility}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
        <div>
          <Label>Enrollment</Label>
          <Select name="enrollment_type" defaultValue={course.enrollment_type}>
            <option value="manual">Manual (admin assigns)</option>
            <option value="open">Open (self-enroll)</option>
          </Select>
        </div>
        <div>
          <Label>Required completion %</Label>
          <Input
            name="required_completion_pct"
            type="number"
            min={0}
            max={100}
            defaultValue={course.required_completion_pct}
          />
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="certificate_enabled" defaultChecked={course.certificate_enabled} />
            Certificate
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="drip_enabled" defaultChecked={course.drip_enabled} />
            Drip
          </label>
        </div>
        <div className="sm:col-span-2">
          <SubmitButton pendingText="Saving…">
            <Save className="h-4 w-4" /> Save settings
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

function CurriculumCard({
  courseId,
  modules,
}: {
  courseId: string;
  modules: ModuleWithLessons[];
}) {
  return (
    <Card>
      <CardHeader title="Curriculum" description="Organise modules and lessons." />
      <div className="space-y-4">
        {modules.map((m) => (
          <ModuleBlock key={m.id} courseId={courseId} module={m} />
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
}: {
  courseId: string;
  module: ModuleWithLessons;
}) {
  const lessons = [...(module.lessons ?? [])].sort((a, b) => a.position - b.position);

  return (
    <div className="rounded-lg border border-app">
      <div className="flex items-center gap-2 border-b border-app bg-brand-50/50 p-3">
        <GripVertical className="h-4 w-4 text-muted" />
        <form action={renameModule} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="id" value={module.id} />
          <input type="hidden" name="course_id" value={courseId} />
          <Input name="title" defaultValue={module.title} className="h-8" />
          <Button size="sm" variant="ghost" type="submit">
            Rename
          </Button>
        </form>
        <form action={deleteModule}>
          <input type="hidden" name="id" value={module.id} />
          <input type="hidden" name="course_id" value={courseId} />
          <button type="submit" aria-label="Delete module" className="rounded p-1.5 text-red-600 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </form>
      </div>

      <div className="divide-y divide-[rgb(var(--border))]">
        {lessons.map((l) => (
          <LessonRow key={l.id} courseId={courseId} lesson={l} />
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

function LessonRow({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-50/40"
      >
        <span className="flex items-center gap-2">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
            {lesson.lesson_type}
          </span>
          {lesson.title}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

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
          </div>
          <div className="flex items-center justify-between sm:col-span-2">
            <div className="flex items-center gap-3">
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
            <DeleteLessonButton courseId={courseId} lessonId={lesson.id} />
          </div>
        </form>
      ) : null}
    </div>
  );
}

function DeleteLessonButton({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  return (
    <form action={deleteLesson}>
      <input type="hidden" name="id" value={lessonId} />
      <input type="hidden" name="course_id" value={courseId} />
      <Button size="sm" variant="danger" type="submit">
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
    </form>
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
