"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { rememberEnrollmentLinkUrl } from "@/lib/enrollment-links/client-url-cache";
import type { EnrollmentLinkAccess, EnrollmentLinkRedirect } from "@/types/database";

type CourseOption = { id: string; title: string };

const STEPS = ["Basic", "Courses", "Rules", "Redirect", "Review"] as const;

export function EnrollmentLinkWizard({ courses }: { courses: CourseOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ url: string; token: string } | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [accessType, setAccessType] = useState<EnrollmentLinkAccess>("public");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [redirectType, setRedirectType] = useState<EnrollmentLinkRedirect>("success_page");
  const [redirectCourseId, setRedirectCourseId] = useState("");

  function toggleCourse(id: string) {
    setCourseIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function canNext() {
    if (step === 0) return name.trim().length >= 2;
    if (step === 1) return courseIds.length > 0;
    if (step === 3 && redirectType === "specific_course") return Boolean(redirectCourseId);
    return true;
  }

  async function create() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/enrollment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          courseIds,
          accessType,
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          redirectType,
          redirectCourseId: redirectType === "specific_course" ? redirectCourseId : null,
          status: "active",
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        url?: string;
        plaintextToken?: string;
        link?: { id: string };
      };
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      setCreated({ url: json.url!, token: json.plaintextToken! });
      if (json.link?.id && json.url) {
        rememberEnrollmentLinkUrl(json.link.id, json.url);
      }
      toast("Enrollment link created");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Create failed", "error");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-xl space-y-6 rounded-xl border border-app bg-white p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Link ready</h2>
          <p className="mt-1 text-sm text-muted">
            Copy this URL now — the full token is only shown once.
          </p>
        </div>
        <div className="rounded-lg bg-surface-muted/50 p-3 font-mono text-sm break-all">
          {created.url}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(created.url);
              toast("URL copied");
            }}
          >
            <Copy className="h-4 w-4" /> Copy URL
          </Button>
          <a href={created.url} target="_blank" rel="noreferrer">
            <Button type="button" variant="outline">
              <ExternalLink className="h-4 w-4" /> Open
            </Button>
          </a>
          <Button type="button" variant="outline" onClick={() => router.push("/admin/enrollment-links")}>
            Back to list
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setCreated(null);
              setStep(0);
              setName("");
              setDescription("");
              setCourseIds([]);
            }}
          >
            Create another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/enrollment-links" className="text-sm text-muted hover:text-brand">
          ← Enrollment Links
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Create enrollment link</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i < step && setStep(i)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              i === step
                ? "bg-brand text-white"
                : i < step
                  ? "bg-brand-100 text-brand"
                  : "bg-slate-100 text-slate-500",
            )}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-app bg-white p-6 space-y-4">
        {step === 0 ? (
          <>
            <div>
              <Label htmlFor="name">Link name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {courses.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-app px-3 py-2 hover:bg-brand-50/50"
              >
                <input
                  type="checkbox"
                  checked={courseIds.includes(c.id)}
                  onChange={() => toggleCourse(c.id)}
                />
                <span className="text-sm font-medium">{c.title}</span>
              </label>
            ))}
            {courses.length === 0 ? (
              <p className="text-sm text-muted">No courses available.</p>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <div>
              <Label htmlFor="access">Access type</Label>
              <Select
                id="access"
                value={accessType}
                onChange={(e) => setAccessType(e.target.value as EnrollmentLinkAccess)}
              >
                <option value="public">Public — anyone with the link</option>
                <option value="imported_students">Imported students only</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="max">Max redemptions (optional)</Label>
              <Input
                id="max"
                type="number"
                min={1}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div>
              <Label htmlFor="expires">Expires at (optional)</Label>
              <Input
                id="expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div>
              <Label htmlFor="redirect">After enrollment</Label>
              <Select
                id="redirect"
                value={redirectType}
                onChange={(e) => setRedirectType(e.target.value as EnrollmentLinkRedirect)}
              >
                <option value="success_page">Success page (recommended)</option>
                <option value="first_course">First course</option>
                <option value="dashboard">Student dashboard</option>
                <option value="specific_course">Specific course</option>
              </Select>
            </div>
            {redirectType === "specific_course" ? (
              <div>
                <Label htmlFor="redirectCourse">Course</Label>
                <Select
                  id="redirectCourse"
                  value={redirectCourseId}
                  onChange={(e) => setRedirectCourseId(e.target.value)}
                >
                  <option value="">Select course…</option>
                  {courseIds.map((id) => {
                    const c = courses.find((x) => x.id === id);
                    return (
                      <option key={id} value={id}>
                        {c?.title ?? id}
                      </option>
                    );
                  })}
                </Select>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 4 ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted">Name</dt>
              <dd className="font-medium">{name}</dd>
            </div>
            <div>
              <dt className="text-muted">Courses</dt>
              <dd className="font-medium">{courseIds.length} selected</dd>
            </div>
            <div>
              <dt className="text-muted">Access</dt>
              <dd className="font-medium capitalize">{accessType.replace("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-muted">Limits</dt>
              <dd className="font-medium">
                {maxRedemptions || "Unlimited"} redemptions
                {expiresAt ? ` · expires ${new Date(expiresAt).toLocaleString()}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Redirect</dt>
              <dd className="font-medium">{redirectType.replace("_", " ")}</dd>
            </div>
          </dl>
        ) : null}

        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || saving}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button type="button" disabled={saving || !canNext()} onClick={() => void create()}>
              {saving ? "Creating…" : "Create link"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
