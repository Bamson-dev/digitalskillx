"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { Search, Upload, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  createStudent,
  type StudentActionState,
} from "@/app/(admin)/admin/(panel)/students/actions";
import type { BulkUploadFailure } from "@/lib/bulk-student-upload";

const initial: StudentActionState = {};

type PublishedCourse = { id: string; title: string };

function CourseCheckboxList({ courses }: { courses: PublishedCourse[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((course) => course.title.toLowerCase().includes(term));
  }, [courses, query]);

  const selectedCount = selected.size;
  const countLabel =
    selectedCount === 1 ? "1 course selected" : `${selectedCount} courses selected`;

  function toggleCourse(courseId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(courseId);
      else next.delete(courseId);
      return next;
    });
  }

  if (courses.length === 0) {
    return (
      <p className="rounded-lg border border-app bg-surface-muted/30 px-3 py-4 text-sm text-muted">
        No courses yet. Create a course under Admin → Courses first.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {Array.from(selected).map((courseId) => (
        <input key={courseId} type="hidden" name="course_ids" value={courseId} />
      ))}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search courses…"
          className="pl-9"
          aria-label="Search courses"
        />
      </div>

      <p className="text-sm font-medium text-neutral-700">{countLabel}</p>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-app bg-white">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">No courses match your search.</p>
        ) : (
          <ul className="divide-y divide-app">
            {filtered.map((course) => {
              const checked = selected.has(course.id);
              return (
                <li key={course.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-3 active:bg-surface-muted/40">
                    <input
                      type="checkbox"
                      value={course.id}
                      checked={checked}
                      onChange={(event) => toggleCourse(course.id, event.target.checked)}
                      className="h-5 w-5 shrink-0 rounded border-neutral-300 text-brand focus:ring-brand"
                      aria-label={course.title}
                    />
                    <span className="text-sm font-medium leading-snug text-neutral-900">
                      {course.title}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Feedback({
  state,
}: {
  state: StudentActionState & {
    bulkSummary?: {
      created: number;
      enrolled: number;
      skipped: number;
      failed: BulkUploadFailure[];
    };
  };
}) {
  return (
    <>
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
      ) : null}
      {state.bulkSummary ? (
        <div className="rounded-lg border border-app bg-surface-muted/30 p-4 text-sm">
          <p className="font-semibold text-neutral-900">Upload summary</p>
          <ul className="mt-2 space-y-1 text-neutral-700">
            <li>Created: {state.bulkSummary.created}</li>
            <li>Existing students enrolled: {state.bulkSummary.enrolled}</li>
            <li>Skipped: {state.bulkSummary.skipped}</li>
            <li>Failed: {state.bulkSummary.failed.length}</li>
          </ul>
          {state.bulkSummary.failed.length > 0 ? (
            <div className="mt-3 max-h-40 overflow-y-auto rounded border border-app bg-white">
              <table className="w-full text-xs">
                <thead className="bg-surface-muted/60 text-left text-muted">
                  <tr>
                    <th className="px-2 py-1.5">Row</th>
                    <th className="px-2 py-1.5">Email</th>
                    <th className="px-2 py-1.5">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {state.bulkSummary.failed.map((item) => (
                    <tr key={`${item.row}-${item.email}`} className="border-t border-app">
                      <td className="px-2 py-1.5">{item.row}</td>
                      <td className="px-2 py-1.5">{item.email}</td>
                      <td className="px-2 py-1.5 text-red-700">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function StudentCreate({
  courses,
  serviceRoleReady = true,
}: {
  courses: PublishedCourse[];
  serviceRoleReady?: boolean;
}) {
  const [tab, setTab] = useState<"single" | "csv">("single");
  const [createState, createAction] = useFormState(createStudent, initial);
  const [csvState, setCsvState] = useState<StudentActionState>(initial);
  const [csvUploading, setCsvUploading] = useState(false);
  const state = tab === "single" ? createState : csvState;

  async function handleCsvSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCsvUploading(true);
    setCsvState(initial);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const fileInput = form.querySelector<HTMLInputElement>('input[name="csv_file"]');
    if (fileInput?.files?.[0]?.size) {
      formData.delete("csv");
    }

    try {
      const res = await fetch("/api/admin/bulk-students", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const raw = await res.text();
      let json: StudentActionState & { bulkSummary?: StudentActionState["bulkSummary"] };
      try {
        json = JSON.parse(raw) as typeof json;
      } catch {
        const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 240);
        setCsvState({
          error: snippet
            ? `Server error (${res.status}): ${snippet}`
            : `Bulk upload failed (${res.status}).`,
        });
        return;
      }
      if (!res.ok) {
        setCsvState({ error: json.error ?? "Bulk upload failed." });
        return;
      }
      setCsvState({
        message: json.message,
        bulkSummary: json.bulkSummary,
      });
      form.reset();
    } catch (err) {
      setCsvState({
        error: err instanceof Error ? err.message : "Bulk upload failed.",
      });
    } finally {
      setCsvUploading(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex gap-2">
        <Button variant={tab === "single" ? "primary" : "outline"} size="sm" onClick={() => setTab("single")}>
          <UserPlus className="h-4 w-4" /> Add student
        </Button>
        <Button variant={tab === "csv" ? "primary" : "outline"} size="sm" onClick={() => setTab("csv")}>
          <Upload className="h-4 w-4" /> Bulk CSV
        </Button>
      </div>

      {!serviceRoleReady ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Student creation is not ready yet</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Run{" "}
              <code className="rounded bg-white px-1 py-0.5 text-xs">sql/platform-secrets-service-role.sql</code>{" "}
              in Supabase SQL Editor.
            </li>
            <li>
              Open{" "}
              <Link href="/admin/settings" className="font-medium text-brand hover:underline">
                Admin → Settings → Integrations
              </Link>{" "}
              and save your Supabase <strong>service_role</strong> secret.
            </li>
            <li>Redeploy Coolify from latest staging if you only set Coolify env vars.</li>
          </ol>
        </div>
      ) : null}

      <form action={createAction} className={`space-y-4 ${tab === "single" ? "" : "hidden"}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" name="full_name" required />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
          </div>

          <div>
            <Label>Courses</Label>
            <p className="mb-1.5 text-xs text-muted">
              Select courses to grant access. If the email is already registered, the student will
              be enrolled in your selection (no duplicate account).
            </p>
            <div className="mt-1.5">
              <CourseCheckboxList courses={courses} />
            </div>
          </div>

          <div className="max-w-md">
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" name="password" placeholder="Leave blank to auto-generate" />
          </div>

          <SubmitButton pendingText="Saving…">
            <UserPlus className="h-4 w-4" /> Create / enroll student
          </SubmitButton>
        </form>

      <form
        onSubmit={handleCsvSubmit}
        className={`space-y-4 ${tab === "csv" ? "" : "hidden"}`}
        encType="multipart/form-data"
      >
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <Label htmlFor="csv_file">CSV file</Label>
              <Input id="csv_file" name="csv_file" type="file" accept=".csv,text/csv" />
            </div>
            <div>
              <Label htmlFor="default_course_id">Default course for this upload</Label>
              <Select id="default_course_id" name="default_course_id" defaultValue="">
                <option value="">
                  Select a course… (optional if CSV has course column)
                </option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted">
                Applied to every row without a course column. New students receive a welcome email
                with login password and course access.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="csv">Or paste CSV rows</Label>
            <Textarea
              id="csv"
              name="csv"
              rows={6}
              placeholder={
                "full_name,email,course\nJane Akande,jane@example.com,Facebook Ad Mastery\nJohn Doe,john@example.com,"
              }
              className="font-mono text-xs"
            />
            <p className="mt-1 text-xs text-muted">
              Required columns: <code>email</code> (required) and <code>full_name</code> or{" "}
              <code>name</code> (optional — we derive a name from the email if missing). Optional{" "}
              <code>course</code> column overrides the default course. Email-only lists (one address
              per line) and Gumroad/Excel exports are supported.
            </p>
          </div>

          <Button type="submit" disabled={csvUploading || !serviceRoleReady}>
            <Upload className="h-4 w-4" /> {csvUploading ? "Uploading…" : "Import students"}
          </Button>
        </form>

      <div className="mt-4 space-y-3">
        <Feedback state={state} />
      </div>
    </Card>
  );
}
