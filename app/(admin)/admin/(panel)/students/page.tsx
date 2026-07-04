import type { Metadata } from "next";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleKeyConfigured } from "@/lib/env-service-role";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StudentCreate } from "@/components/admin/student-create";
import { StudentsTable, type StudentRow } from "@/components/admin/students-table";

export const metadata: Metadata = { title: "Students" };

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; tag?: string };
}) {
  await requireAdmin();
  const supabase = await getAdminSupabase();
  const session = createClient();

  const serviceRoleReady = await serviceRoleKeyConfigured(session);

  const { data: publishedCourses } = await supabase
    .from("courses")
    .select("id, title")
    .order("title");

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, is_suspended, tags, last_active_at, created_at")
    .eq("role", "student")
    .order("created_at", { ascending: false });

  if (searchParams.q) {
    query = query.or(`full_name.ilike.%${searchParams.q}%,email.ilike.%${searchParams.q}%`);
  }
  if (searchParams.status === "suspended") query = query.eq("is_suspended", true);
  if (searchParams.status === "active") query = query.eq("is_suspended", false);
  if (searchParams.tag) query = query.contains("tags", [searchParams.tag]);

  const { data: students } = await query;

  const studentIds = (students ?? []).map((s) => s.id);
  const courseCountByStudent = new Map<string, number>();

  if (studentIds.length > 0) {
    const { data: enrollmentRows } = await supabase
      .from("enrollments")
      .select("student_id")
      .in("student_id", studentIds);

    for (const row of enrollmentRows ?? []) {
      courseCountByStudent.set(row.student_id, (courseCountByStudent.get(row.student_id) ?? 0) + 1);
    }
  }

  const tableRows: StudentRow[] = (students ?? []).map((s) => ({
    id: s.id,
    full_name: s.full_name,
    email: s.email,
    is_suspended: s.is_suspended,
    tags: s.tags,
    created_at: s.created_at,
    course_count: courseCountByStudent.get(s.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Students</h1>
        <p className="mt-1 text-sm text-muted">
          Create accounts, assign courses, and manage every learner. Click <strong>Manage</strong> to
          edit profiles, suspend access, or remove courses.
        </p>
      </div>

      <StudentCreate courses={publishedCourses ?? []} serviceRoleReady={serviceRoleReady} />

      <Card>
        <form className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
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
          <button type="submit" className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white">
            Filter
          </button>
        </form>

        <StudentsTable students={tableRows} />
      </Card>
    </div>
  );
}
