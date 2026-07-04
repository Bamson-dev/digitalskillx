"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { Megaphone, Search, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { RichText } from "@/components/ui/rich-text";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  sendAnnouncement,
  type AnnouncementState,
} from "@/app/(admin)/admin/(panel)/announcements/actions";

const initial: AnnouncementState = {};

type CourseOption = { id: string; title: string };

function CourseAudiencePicker({ courses }: { courses: CourseOption[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return courses;
    return courses.filter((course) => course.title.toLowerCase().includes(term));
  }, [courses, query]);

  const countLabel =
    selected.size === 1 ? "1 course selected" : `${selected.size} courses selected`;

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
        No courses yet. Create a course first, then target enrolled students.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-app bg-surface-muted/20 p-3">
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

      <div className="max-h-52 overflow-y-auto rounded-lg border border-app bg-white">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">No courses match your search.</p>
        ) : (
          <ul className="divide-y divide-app">
            {filtered.map((course) => {
              const checked = selected.has(course.id);
              return (
                <li key={course.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-3 hover:bg-surface-muted/40">
                    <input
                      type="checkbox"
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
      <p className="text-xs text-muted">
        Only students enrolled in the selected course(s) receive this announcement by email and on
        their dashboard.
      </p>
    </div>
  );
}

export function AnnouncementForm({ courses }: { courses: CourseOption[] }) {
  const [state, action] = useFormState(sendAnnouncement, initial);
  const [audience, setAudience] = useState<"all" | "courses">("all");

  return (
    <Card>
      <form action={action} className="space-y-5">
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" name="subject" required placeholder="e.g. New module available this week" />
        </div>

        <div className="space-y-3">
          <Label>Audience</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                audience === "all"
                  ? "border-brand bg-brand/5 ring-1 ring-brand/30"
                  : "border-app hover:bg-surface-muted/30"
              }`}
            >
              <input
                type="radio"
                name="audience"
                value="all"
                checked={audience === "all"}
                onChange={() => setAudience("all")}
                className="mt-1 text-brand focus:ring-brand"
              />
              <span>
                <span className="block text-sm font-semibold text-neutral-900">All students</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Every active student on the platform
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
                audience === "courses"
                  ? "border-brand bg-brand/5 ring-1 ring-brand/30"
                  : "border-app hover:bg-surface-muted/30"
              }`}
            >
              <input
                type="radio"
                name="audience"
                value="courses"
                checked={audience === "courses"}
                onChange={() => setAudience("courses")}
                className="mt-1 text-brand focus:ring-brand"
              />
              <span>
                <span className="block text-sm font-semibold text-neutral-900">Specific courses</span>
                <span className="mt-0.5 block text-xs text-muted">
                  Only students enrolled in your selection
                </span>
              </span>
            </label>
          </div>

          {audience === "courses" ? <CourseAudiencePicker courses={courses} /> : null}
        </div>

        <div>
          <Label>Message</Label>
          <RichText name="body" placeholder="Write your announcement…" />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SubmitButton pendingText="Sending…">
            <Send className="h-4 w-4" /> Send announcement
          </SubmitButton>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Megaphone className="h-3.5 w-3.5" />
            Delivered by email and on the student dashboard
          </p>
        </div>

        {state.error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        ) : null}
        {state.message ? (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
        ) : null}
      </form>
    </Card>
  );
}
