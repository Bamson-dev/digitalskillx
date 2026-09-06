"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  createPlatformAnnouncement,
  deletePlatformAnnouncement,
  togglePlatformAnnouncementActive,
  updatePlatformAnnouncement,
  type AnnouncementActionState,
} from "@/app/(admin)/admin/(panel)/announcements/platform-actions";
import {
  announcementVisibilityLabel,
  type PlatformAnnouncement,
} from "@/lib/platform-announcements-shared";
import { cn } from "@/lib/utils";

const initial: AnnouncementActionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 min-h-[44px] items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function VisibilityBadge({ row }: { row: PlatformAnnouncement }) {
  const label = announcementVisibilityLabel(row);
  const styles: Record<typeof label, string> = {
    live: "bg-emerald-100 text-emerald-800",
    scheduled: "bg-sky-100 text-sky-800",
    expired: "bg-neutral-100 text-neutral-600",
    inactive: "bg-amber-100 text-amber-900",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        styles[label],
      )}
    >
      {label}
    </span>
  );
}

function AnnouncementFields({
  row,
}: {
  row?: PlatformAnnouncement;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-neutral-800" htmlFor={`title-${row?.id ?? "new"}`}>
          Title
        </label>
        <input
          id={`title-${row?.id ?? "new"}`}
          name="title"
          required
          defaultValue={row?.title}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-neutral-800" htmlFor={`message-${row?.id ?? "new"}`}>
          Message
        </label>
        <textarea
          id={`message-${row?.id ?? "new"}`}
          name="message"
          required
          rows={4}
          defaultValue={row?.message}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-800" htmlFor={`type-${row?.id ?? "new"}`}>
          Type
        </label>
        <select
          id={`type-${row?.id ?? "new"}`}
          name="type"
          defaultValue={row?.type ?? "information"}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="information">Information</option>
          <option value="important">Important</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
        </select>
      </div>
      <div className="flex flex-col justify-end gap-3 pb-1">
        <label className="inline-flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={row ? row.is_active : true}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Active (visible when in date window)
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            name="is_fixed"
            defaultChecked={row ? row.is_fixed : true}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Fixed / pinned (priority on dashboard)
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-800" htmlFor={`starts-${row?.id ?? "new"}`}>
          Start date (optional)
        </label>
        <input
          id={`starts-${row?.id ?? "new"}`}
          type="datetime-local"
          name="starts_at"
          defaultValue={toLocalInput(row?.starts_at ?? null)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-800" htmlFor={`ends-${row?.id ?? "new"}`}>
          End date (optional)
        </label>
        <input
          id={`ends-${row?.id ?? "new"}`}
          type="datetime-local"
          name="ends_at"
          defaultValue={toLocalInput(row?.ends_at ?? null)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

function CreateForm() {
  const [state, action] = useFormState(createPlatformAnnouncement, initial);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
      <div>
        <h3 className="font-display text-lg font-bold text-neutral-900">Create fixed announcement</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Students see active announcements at the top of their dashboard.
        </p>
      </div>
      <AnnouncementFields />
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>
      ) : null}
      <SubmitButton label="Create announcement" />
    </form>
  );
}

function EditForm({ row }: { row: PlatformAnnouncement }) {
  const [state, action] = useFormState(updatePlatformAnnouncement, initial);
  return (
    <form action={action} className="space-y-4 border-t border-neutral-200 pt-4">
      <input type="hidden" name="id" value={row.id} />
      <AnnouncementFields row={row} />
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton label="Save changes" />
      </div>
    </form>
  );
}

export function PlatformAnnouncementManager({
  announcements,
}: {
  announcements: PlatformAnnouncement[];
}) {
  return (
    <div className="space-y-6">
      <CreateForm />

      <section className="space-y-4">
        <div>
          <h3 className="font-display text-lg font-bold text-neutral-900">All announcements</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Live = currently shown to students. Inactive / expired never appear.
          </p>
        </div>

        {announcements.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">
            No fixed announcements yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {announcements.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <VisibilityBadge row={row} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                        {row.type}
                      </span>
                      {row.is_fixed ? (
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">
                          Fixed
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 font-display text-base font-bold text-neutral-900">
                      {row.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{row.message}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={togglePlatformAnnouncementActive}>
                      <input type="hidden" name="id" value={row.id} />
                      <input
                        type="hidden"
                        name="is_active"
                        value={row.is_active ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="inline-flex h-9 min-h-[40px] items-center rounded-lg border border-neutral-300 px-3 text-xs font-semibold text-neutral-800 hover:border-neutral-500"
                      >
                        {row.is_active ? "Unpublish" : "Publish"}
                      </button>
                    </form>
                    <form action={deletePlatformAnnouncement}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        className="inline-flex h-9 min-h-[40px] items-center rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          if (!confirm("Delete this announcement?")) e.preventDefault();
                        }}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <EditForm row={row} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
