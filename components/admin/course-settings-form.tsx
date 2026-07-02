"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { Save, Sparkles } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import type { Course, CourseCategory } from "@/types/database";
import {
  updateCourseSettings,
  type CourseSettingsState,
} from "@/app/(admin)/admin/(panel)/courses/actions";
import type { CourseCopyField, CourseCopyResult } from "@/lib/ai/course-copy-shared";
import { CourseThumbnailUpload } from "@/components/admin/course-thumbnail-upload";

const courseSettingsInitial: CourseSettingsState = {};

type CopyLoading = CourseCopyField | null;

function FieldLabelWithAi({
  label,
  field,
  loading,
  disabled,
  onGenerate,
}: {
  label: string;
  field: Exclude<CourseCopyField, "all">;
  loading: boolean;
  disabled: boolean;
  onGenerate: (field: Exclude<CourseCopyField, "all">) => void;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <Label className="mb-0">{label}</Label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || loading}
        onClick={() => onGenerate(field)}
        className="shrink-0 border-brand/40 text-brand hover:bg-brand-50"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {loading ? "Generating…" : "Generate with AI"}
      </Button>
    </div>
  );
}

export function CourseSettingsForm({
  course,
  categories,
}: {
  course: Course;
  categories: Pick<CourseCategory, "id" | "name">[];
}) {
  const [state, action] = useFormState(updateCourseSettings, courseSettingsInitial);

  const [title, setTitle] = useState(course.title);
  const [shortDescription, setShortDescription] = useState(course.short_description ?? "");
  const [description, setDescription] = useState(course.description ?? "");
  const [learningOutcomes, setLearningOutcomes] = useState(
    (course.learning_outcomes ?? []).join("\n"),
  );

  const [copyLoading, setCopyLoading] = useState<CopyLoading>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const titleMissing = !title.trim();
  const isGenerating = copyLoading !== null;

  async function requestCopy(field: CourseCopyField) {
    if (titleMissing) {
      setCopyError("Enter a course title before generating copy.");
      return;
    }

    setCopyLoading(field);
    setCopyError(null);

    try {
      const res = await fetch("/api/admin/course-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          shortDescription,
          description,
          learningOutcomes,
          field,
        }),
      });

      const json = (await res.json()) as CourseCopyResult & { error?: string };

      if (!res.ok || json.error) {
        setCopyError(json.error ?? "Could not generate copy. Try again.");
        return;
      }

      if (field === "all" || field === "short_description") {
        if (json.short_description) setShortDescription(json.short_description);
      }
      if (field === "all" || field === "description") {
        if (json.description) setDescription(json.description);
      }
      if (field === "all" || field === "learning_outcomes") {
        if (json.learning_outcomes) setLearningOutcomes(json.learning_outcomes);
      }
    } catch {
      setCopyError("Network error. Check your connection and try again.");
    } finally {
      setCopyLoading(null);
    }
  }

  return (
    <Card>
      <CardHeader title="Course settings" description="Storefront listing, pricing, and completion rules." />
      <form action={action} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
        <input type="hidden" name="id" value={course.id} />

        <div className="sm:col-span-2">
          <Label htmlFor="course-title">Title</Label>
          <Input
            id="course-title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        {copyError ? (
          <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{copyError}</p>
        ) : null}

        <div className="sm:col-span-2">
          <FieldLabelWithAi
            label="Short description (storefront card)"
            field="short_description"
            loading={copyLoading === "short_description"}
            disabled={titleMissing || isGenerating}
            onGenerate={requestCopy}
          />
          <Input
            name="short_description"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            maxLength={160}
          />
        </div>

        <div className="sm:col-span-2">
          <FieldLabelWithAi
            label="Full description (sales page)"
            field="description"
            loading={copyLoading === "description"}
            disabled={titleMissing || isGenerating}
            onGenerate={requestCopy}
          />
          <Textarea
            name="description"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <Label>Price (₦ Naira)</Label>
          <Input name="price_ngn" type="number" min={0} step={1} defaultValue={course.price_ngn ?? 0} />
        </div>
        <div>
          <Label>Price ($ USD)</Label>
          <Input name="price_usd" type="number" min={0} step={1} defaultValue={course.price_usd ?? 0} />
        </div>
        <div className="sm:col-span-2">
          <Label>Promo video URL</Label>
          <Input
            name="promo_video_url"
            defaultValue={course.promo_video_url ?? ""}
            placeholder="https://youtu.be/… or YouTube embed URL"
          />
          <p className="mt-1 text-xs text-muted">Optional. Plays above the course image when set.</p>
        </div>

        <div className="sm:col-span-2">
          <Label>Course image</Label>
          <p className="mb-1.5 text-xs text-muted">
            Storefront and sales page cover — follow the size requirements below.
          </p>
          <div className="mt-1.5">
            <CourseThumbnailUpload
              key={`${course.id}-${state.thumbnail_url ?? course.thumbnail_url ?? "none"}`}
              initialUrl={state.thumbnail_url ?? course.thumbnail_url}
              courseTitle={title}
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <FieldLabelWithAi
            label="What you'll learn (one outcome per line)"
            field="learning_outcomes"
            loading={copyLoading === "learning_outcomes"}
            disabled={titleMissing || isGenerating}
            onGenerate={requestCopy}
          />
          <Textarea
            name="learning_outcomes"
            rows={4}
            value={learningOutcomes}
            onChange={(e) => setLearningOutcomes(e.target.value)}
            placeholder="Launch profitable Facebook ad campaigns&#10;Build a high-converting landing page"
          />
        </div>

        <div>
          <Label>Instructor name</Label>
          <Input name="instructor_name" defaultValue={course.instructor_name ?? ""} />
        </div>
        <div>
          <Label>Instructor bio</Label>
          <Input name="instructor_bio" defaultValue={course.instructor_bio ?? ""} />
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
          {state.error ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          ) : null}
          {state.message ? (
            <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
