"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { Save, Sparkles, Users } from "lucide-react";
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
import { CertificatePreview } from "@/components/certificates/certificate-preview";
import {
  CERTIFICATE_TEMPLATE_KEYS,
  CERTIFICATE_TEMPLATE_LABELS,
  normalizeCertificateTemplateKey,
  type CertificateTemplateKey,
} from "@/lib/certificate-templates";

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
  globalDefaultTemplateKey,
}: {
  course: Course;
  categories: Pick<CourseCategory, "id" | "name" | "template_key">[];
  globalDefaultTemplateKey: CertificateTemplateKey;
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
  const [categoryId, setCategoryId] = useState(course.category_id ?? "");
  const [certificateTemplateOverride, setCertificateTemplateOverride] = useState(
    course.certificate_template_override ?? "",
  );

  const categoryDefaultKey =
    normalizeCertificateTemplateKey(
      categories.find((c) => c.id === categoryId)?.template_key,
    ) ?? globalDefaultTemplateKey;

  const previewTemplateKey: CertificateTemplateKey =
    normalizeCertificateTemplateKey(certificateTemplateOverride) ?? categoryDefaultKey;

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
          <Select
            name="category_id"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_coming_soon" defaultChecked={course.is_coming_soon} />
            Coming soon
          </label>
        </div>
        <p className="sm:col-span-2 -mt-2 text-xs text-muted">
          Coming soon courses appear in the catalog with a badge. Students can view the sales page but
          cannot enroll or open lessons until you turn this off.
        </p>

        <div className="sm:col-span-2 rounded-2xl border-2 border-brand/20 bg-gradient-to-br from-brand-50/80 via-white to-sky-50/50 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">
                Community
              </p>
              <h3 className="mt-1 font-display text-lg font-bold text-neutral-950">
                Student community links
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                Add Telegram and/or WhatsApp invite links. Enrolled students see a prominent
                Community section on their course page to join your group.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="community_telegram_url">Telegram invite link</Label>
              <Input
                id="community_telegram_url"
                name="community_telegram_url"
                type="url"
                defaultValue={course.community_telegram_url ?? ""}
                placeholder="https://t.me/your_group"
              />
              <p className="mt-1 text-xs text-muted">Public t.me or telegram.me group/channel link.</p>
            </div>
            <div>
              <Label htmlFor="community_whatsapp_url">WhatsApp invite link</Label>
              <Input
                id="community_whatsapp_url"
                name="community_whatsapp_url"
                type="url"
                defaultValue={course.community_whatsapp_url ?? ""}
                placeholder="https://chat.whatsapp.com/…"
              />
              <p className="mt-1 text-xs text-muted">WhatsApp community or group invite link.</p>
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="certificate_template_override">Certificate template</Label>
          <Select
            id="certificate_template_override"
            name="certificate_template_override"
            value={certificateTemplateOverride}
            onChange={(event) => setCertificateTemplateOverride(event.target.value)}
          >
            <option value="">Use category default</option>
            {CERTIFICATE_TEMPLATE_KEYS.map((key) => (
              <option key={key} value={key}>
                {CERTIFICATE_TEMPLATE_LABELS[key]}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted">
            Category default: {CERTIFICATE_TEMPLATE_LABELS[categoryDefaultKey]}
            {certificateTemplateOverride ? "" : " (active when saved with no override)"}
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-app bg-surface-muted/20 p-4">
            <p className="mb-3 text-sm font-medium text-neutral-800">Template preview</p>
            <CertificatePreview templateKey={previewTemplateKey} />
          </div>
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
