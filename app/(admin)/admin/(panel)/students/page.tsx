import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { createClient } from "@/lib/supabase/server";
import { serviceRoleKeyConfigured } from "@/lib/env-service-role";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StudentCreate } from "@/components/admin/student-create";
import { formatDate } from "@/lib/utils";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Students</h1>
        <p className="mt-1 text-sm text-muted">Manage every learner on the platform.</p>
      </div>

      <StudentCreate courses={publishedCourses ?? []} serviceRoleReady={serviceRoleReady} />

      <Card>
        <form className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={searchParams.q ?? ""} placeholder="Search name or email…" className="pl-9" />
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

        {!students || students.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No students found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app text-left text-xs uppercase text-muted">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Tags</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-app/60 hover:bg-brand-50/30">
                    <td className="px-2 py-2 font-medium">
                      <Link href={`/admin/students/${s.id}`} className="hover:text-brand hover:underline">
                        {s.full_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-muted">{s.email}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(s.tags ?? []).map((t) => (
                          <Badge key={t} tone="brand">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {s.is_suspended ? <Badge tone="red">Suspended</Badge> : <Badge tone="green">Active</Badge>}
                    </td>
                    <td className="px-2 py-2 text-muted">{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
