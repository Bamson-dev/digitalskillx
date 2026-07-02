"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Search, UserPlus, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  createStudent,
  bulkUploadStudents,
  type StudentActionState,
} from "@/app/(admin)/admin/(panel)/students/actions";

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
        No published courses yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
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
                      name="course_ids"
                      value={course.id}
                      checked={checked}
                      onChange={(event) => toggleCourse(course.id, event.target.checked)}
                      className="h-5 w-5 shrink-0 rounded border-neutral-300 text-brand focus:ring-brand"
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

function Feedback({ state }: { state: StudentActionState }) {
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
            <li>Skipped (duplicate email): {state.bulkSummary.skipped}</li>
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

export function StudentCreate({ courses }: { courses: PublishedCourse[] }) {
  const [tab, setTab] = useState<"single" | "csv">("single");
  const [createState, createAction] = useFormState(createStudent, initial);
  const [csvState, csvAction] = useFormState(bulkUploadStudents, initial);
  const state = tab === "single" ? createState : csvState;

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

      {tab === "single" ? (
        <form action={createAction} className="space-y-4">
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
            <div className="mt-1.5">
              <CourseCheckboxList courses={courses} />
            </div>
          </div>

          <div className="max-w-md">
            <Label htmlFor="password">Password</Label>
            <PasswordInput id="password" name="password" placeholder="Leave blank to auto-generate" />
          </div>

          <SubmitButton pendingText="Creating…">
            <UserPlus className="h-4 w-4" /> Create student
          </SubmitButton>
        </form>
      ) : (
        <form action={csvAction} className="space-y-4" encType="multipart/form-data">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <Label htmlFor="csv_file">CSV file</Label>
              <Input id="csv_file" name="csv_file" type="file" accept=".csv,text/csv" />
            </div>
            <div>
              <Label htmlFor="default_course_id">Course for this upload</Label>
              <Select id="default_course_id" name="default_course_id" defaultValue="">
                <option value="">— None —</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted">
                Used when a CSV row has no course column. Row course values override this default.
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
              Columns: <code>full_name</code>, <code>email</code>, optional <code>course</code> (course title or
              id). Duplicates are skipped. Failed rows do not stop the batch.
            </p>
          </div>

          <SubmitButton pendingText="Uploading…">
            <Upload className="h-4 w-4" /> Import students
          </SubmitButton>
        </form>
      )}

      <div className="mt-4 space-y-3">
        <Feedback state={state} />
      </div>
    </Card>
  );
}
