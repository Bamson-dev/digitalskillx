import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleKeyConfigured } from "@/lib/env-service-role";
import { formatDate } from "@/lib/utils";
import { loadStudentOverviewStats } from "@/lib/admin-student-overview";
import { searchCustomers } from "@/lib/customer-crm";
import { listTagCatalog } from "@/lib/tag-catalog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StudentCreate } from "@/components/admin/student-create";
import { StudentsTable, type StudentRow } from "@/components/admin/students-table";

export const metadata: Metadata = { title: "Customers" };

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    status?: string;
    tag?: string;
    audience?: string;
    courseId?: string;
    page?: string;
  };
}) {
  await requireAdmin();
  const supabase = await getAdminSupabase();
  const session = createClient();

  const serviceRoleReady = await serviceRoleKeyConfigured(session);

  const [{ data: publishedCourses }, catalogTags, search] = await Promise.all([
    supabase.from("courses").select("id, title").order("title"),
    listTagCatalog(supabase),
    searchCustomers(supabase, {
      q: searchParams.q,
      status: (searchParams.status as "active" | "suspended" | "") || "",
      tag: searchParams.tag,
      audience: searchParams.audience,
      courseId: searchParams.courseId,
      page: Number(searchParams.page ?? 1) || 1,
      pageSize: 25,
    }),
  ]);

  const overview = await loadStudentOverviewStats(
    supabase,
    search.rows.map((s) => ({
      id: String(s.id),
      email: String(s.email),
      last_active_at: (s.last_active_at as string | null) ?? null,
    })),
  );

  const tableRows: StudentRow[] = search.rows.map((s) => {
    const id = String(s.id);
    const stats = overview.get(id);
    const lastAccessLabel = !stats?.hasLoggedIn
      ? "Never logged in"
      : stats.lastActiveAt
        ? formatDate(stats.lastActiveAt, { dateStyle: "medium", timeStyle: "short" })
        : "Never logged in";

    return {
      id,
      full_name: (s.full_name as string | null) ?? null,
      email: String(s.email),
      is_suspended: Boolean(s.is_suspended),
      tags: (s.tags as string[]) ?? [],
      created_at: String(s.created_at),
      course_count: stats?.courseCount ?? 0,
      last_access_label: lastAccessLabel,
      avg_progress_pct: stats?.avgProgressPct ?? null,
      has_logged_in: stats?.hasLoggedIn ?? false,
    };
  });

  const totalPages = Math.max(1, Math.ceil(search.total / search.pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="mt-1 text-sm text-muted">
          Student accounts, purchases, enrollments, and learning activity — same profiles as before,
          with business filters. Click a row to open the customer profile.
        </p>
      </div>

      <StudentCreate courses={publishedCourses ?? []} serviceRoleReady={serviceRoleReady} />

      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative min-w-[200px] sm:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              name="q"
              defaultValue={searchParams.q ?? ""}
              placeholder="Search name or email…"
              className="pl-9"
            />
          </div>
          <select
            name="status"
            defaultValue={searchParams.status ?? ""}
            className="h-10 rounded-lg border border-app bg-card px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            name="audience"
            defaultValue={searchParams.audience ?? ""}
            className="h-10 rounded-lg border border-app bg-card px-3 text-sm"
          >
            <option value="">All customers</option>
            <option value="new">New (7d)</option>
            <option value="inactive">Inactive (14d)</option>
            <option value="purchased">With purchases</option>
            <option value="never_purchased">No purchases</option>
            <option value="recent_purchase">Purchased (30d)</option>
            <option value="high_value">High value (≥₦100k)</option>
            <option value="completed">Completed a course</option>
            <option value="incomplete">Incomplete courses</option>
            <option value="certificates">Has certificate</option>
          </select>
          <select
            name="tag"
            defaultValue={searchParams.tag ?? ""}
            className="h-10 rounded-lg border border-app bg-card px-3 text-sm"
          >
            <option value="">All tags</option>
            {catalogTags.map((t) => (
              <option key={t.id} value={t.label}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            name="courseId"
            defaultValue={searchParams.courseId ?? ""}
            className="h-10 rounded-lg border border-app bg-card px-3 text-sm"
          >
            <option value="">Any course</option>
            {(publishedCourses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button type="submit" className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white">
            Filter
          </button>
        </form>

        <StudentsTable students={tableRows} />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span>
            Page {search.page} of {totalPages} · {search.total.toLocaleString()} matched
          </span>
          <div className="flex gap-2">
            {search.page > 1 ? (
              <Link
                href={`/admin/students?${new URLSearchParams({
                  ...Object.fromEntries(
                    Object.entries(searchParams).filter(([, v]) => v != null && v !== ""),
                  ),
                  page: String(search.page - 1),
                } as Record<string, string>).toString()}`}
                className="rounded-lg border border-app px-3 py-1.5 font-medium text-ink"
              >
                Previous
              </Link>
            ) : null}
            {search.page < totalPages ? (
              <Link
                href={`/admin/students?${new URLSearchParams({
                  ...Object.fromEntries(
                    Object.entries(searchParams).filter(([, v]) => v != null && v !== ""),
                  ),
                  page: String(search.page + 1),
                } as Record<string, string>).toString()}`}
                className="rounded-lg border border-app px-3 py-1.5 font-medium text-ink"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
