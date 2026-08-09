import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { listSegments, listSegmentMembers, normalizeSegmentDefinition } from "@/lib/customer-segments";
import { listTagCatalog } from "@/lib/tag-catalog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  deleteSegmentAction,
  saveSegmentAction,
  saveTagCatalogAction,
  deleteTagCatalogAction,
} from "../customers/actions";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";

export const metadata: Metadata = { title: "Segments" };

export default async function AdminSegmentsPage({
  searchParams,
}: {
  searchParams: { preview?: string };
}) {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const [segments, tags, courses] = await Promise.all([
    listSegments(admin),
    listTagCatalog(admin),
    admin.from("courses").select("id, title").order("title").then((r) => r.data ?? []),
  ]);

  let previewMembers: Array<{ id: string; full_name: string | null; email: string }> = [];
  if (searchParams.preview) {
    const seg = segments.find((s) => s.id === searchParams.preview);
    if (seg) {
      previewMembers = await listSegmentMembers(admin, normalizeSegmentDefinition(seg.definition), 50);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Segments</h1>
        <p className="mt-1 text-sm text-muted">
          Rule-based audiences from real purchase, enrollment, and activity data. No AI.
        </p>
      </div>

      <section className="rounded-xl border border-app bg-surface p-4">
        <h2 className="font-semibold">Tag catalog</h2>
        <p className="mt-1 text-xs text-muted">
          Managed labels. Membership still lives on each customer profile (`profiles.tags`).
        </p>
        <form action={saveTagCatalogAction} className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label>New tag</Label>
            <Input name="label" required placeholder="High Value" className="w-48" />
          </div>
          <Button type="submit" size="sm">
            Add tag
          </Button>
        </form>
        {(tags ?? []).length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {tags.map((t) => (
              <li key={t.id} className="inline-flex items-center gap-2 rounded-full border border-app px-3 py-1 text-xs">
                {t.label}
                <form action={deleteTagCatalogAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <ConfirmSubmitButton
                    message="Remove this tag from the catalog? Existing customer tags are not changed."
                    className="text-muted hover:text-red-600"
                  >
                    ×
                  </ConfirmSubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">No catalog tags yet.</p>
        )}
      </section>

      <section className="rounded-xl border border-app bg-surface p-4">
        <h2 className="font-semibold">Create segment</h2>
        <form action={saveSegmentAction} className="mt-3 grid max-w-xl gap-3">
          <div>
            <Label>Name</Label>
            <Input name="name" required placeholder="High value · 30d inactive" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea name="description" rows={2} />
          </div>
          <div>
            <Label>Definition (JSON)</Label>
            <Textarea
              name="definition"
              rows={8}
              defaultValue={JSON.stringify(
                {
                  logic: "and",
                  rules: [
                    { field: "total_spent_ngn", op: "gte", value: 100000 },
                    { field: "inactive_days", op: "gte", value: 14 },
                  ],
                },
                null,
                2,
              )}
              className="font-mono text-xs"
            />
            <p className="mt-1 text-xs text-muted">
              Fields: purchase_count, total_spent_ngn, has_tag, inactive_days, enrolled_course,
              completed_course, purchased_course, not_purchased_course, has_certificate. Logic: and |
              or.
            </p>
          </div>
          <Button type="submit">Save segment</Button>
        </form>
        {courses.length ? (
          <p className="mt-2 text-xs text-muted">
            Course IDs available for rules — open a course in Admin → Courses to copy an ID.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-app bg-surface p-4">
        <h2 className="font-semibold">Saved segments</h2>
        {segments.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No segments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-app">
            {segments.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium">{s.name}</p>
                  {s.description ? <p className="text-muted">{s.description}</p> : null}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/segments?preview=${s.id}`}
                    className="rounded-lg border border-app px-3 py-1.5 text-xs font-semibold"
                  >
                    Preview
                  </Link>
                  <form action={deleteSegmentAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <ConfirmSubmitButton
                      message="Delete this segment? Customer accounts will not be deleted."
                      className="inline-flex h-8 items-center rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {searchParams.preview ? (
        <section className="rounded-xl border border-app bg-surface p-4">
          <h2 className="font-semibold">Preview members (max 50 of 500 scanned)</h2>
          {previewMembers.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No matching customers in the sample.</p>
          ) : (
            <ul className="mt-3 divide-y divide-app text-sm">
              {previewMembers.map((m) => (
                <li key={m.id} className="py-2">
                  <Link href={`/admin/students/${m.id}`} className="font-medium hover:text-brand">
                    {m.full_name || m.email}
                  </Link>
                  <span className="ml-2 text-muted">{m.email}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
