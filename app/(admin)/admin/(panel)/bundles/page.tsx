import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { listCourseBundles } from "@/lib/course-bundles";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteBundleAction, saveBundleAction, enrollBundleAction } from "../customers/actions";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";

export const metadata: Metadata = { title: "Bundles" };

export default async function AdminBundlesPage() {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const [bundles, courses] = await Promise.all([
    listCourseBundles(admin),
    admin.from("courses").select("id, title").order("title").then((r) => r.data ?? []),
  ]);
  const titleById = new Map(courses.map((c) => [c.id, c.title]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bundles</h1>
        <p className="mt-1 text-sm text-muted">
          Packages that reference existing courses — no duplicate product records. Admin enrollment
          uses the existing enrollments table.
        </p>
      </div>

      <section className="rounded-xl border border-app bg-surface p-4">
        <h2 className="font-semibold">Create bundle</h2>
        <form action={saveBundleAction} className="mt-3 grid max-w-xl gap-3">
          <div>
            <Label>Title</Label>
            <Input name="title" required placeholder="Digital Marketing Bundle" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea name="description" rows={2} />
          </div>
          <div>
            <Label>Display price (NGN, kobo/naira integer as stored for course prices)</Label>
            <Input name="priceNgn" type="number" min={0} defaultValue={0} />
            <p className="mt-1 text-xs text-muted">
              Checkout for bundles is not a second Paystack path in this phase — use admin grant or
              future checkout wiring. Price is catalog metadata only for now.
            </p>
          </div>
          <div>
            <Label>Course IDs (comma-separated)</Label>
            <Textarea
              name="courseIds"
              rows={3}
              placeholder={courses
                .slice(0, 3)
                .map((c) => c.id)
                .join(",")}
              required
            />
            <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-muted">
              {courses.slice(0, 40).map((c) => (
                <li key={c.id}>
                  {c.title} — <code>{c.id}</code>
                </li>
              ))}
            </ul>
          </div>
          <Button type="submit">Save bundle</Button>
        </form>
      </section>

      <section className="rounded-xl border border-app bg-surface p-4">
        <h2 className="font-semibold">Bundles</h2>
        {bundles.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No bundles yet.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {bundles.map((b) => (
              <li key={b.id} className="rounded-lg border border-app p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{b.title}</p>
                    {b.description ? <p className="text-muted">{b.description}</p> : null}
                    <p className="mt-1 text-xs text-muted">
                      ₦{b.price_ngn.toLocaleString()} · {b.is_active ? "Active" : "Paused"}
                    </p>
                    <ul className="mt-2 list-disc pl-5">
                      {b.courseIds.map((id) => (
                        <li key={id}>{titleById.get(id) ?? id}</li>
                      ))}
                    </ul>
                  </div>
                  <form action={deleteBundleAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmSubmitButton
                      message="Delete this bundle? Courses themselves will not be deleted."
                      className="inline-flex h-8 items-center rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </div>
                <form action={enrollBundleAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-app pt-3">
                  <input type="hidden" name="bundleId" value={b.id} />
                  <div className="min-w-[240px] flex-1">
                    <Label>Grant to student ID</Label>
                    <Input name="studentId" required placeholder="Customer ID from their profile" />
                  </div>
                  <Button type="submit" size="sm">
                    Enroll via existing system
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
