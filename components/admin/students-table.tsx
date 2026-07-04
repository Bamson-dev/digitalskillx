import Link from "next/link";
import { Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export type StudentRow = {
  id: string;
  full_name: string | null;
  email: string;
  is_suspended: boolean;
  tags: string[] | null;
  created_at: string;
  course_count: number;
  last_access_label: string;
  avg_progress_pct: number | null;
  has_logged_in: boolean;
};

export function StudentsTable({ students }: { students: StudentRow[] }) {
  if (students.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No students found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app text-left text-xs uppercase text-muted">
            <th className="px-3 py-2.5">Student</th>
            <th className="px-3 py-2.5">Courses</th>
            <th className="px-3 py-2.5">Progress</th>
            <th className="px-3 py-2.5">Last access</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Joined</th>
            <th className="px-3 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id} className="border-b border-app/60 hover:bg-brand-50/30">
              <td className="px-3 py-3">
                <Link href={`/admin/students/${s.id}`} className="group block">
                  <p className="font-medium text-neutral-900 group-hover:text-brand">
                    {s.full_name ?? "—"}
                  </p>
                  <p className="text-xs text-muted">{s.email}</p>
                </Link>
              </td>
              <td className="px-3 py-3">
                <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700">
                  {s.course_count}
                </span>
              </td>
              <td className="px-3 py-3">
                {s.avg_progress_pct != null ? (
                  <div className="min-w-[88px]">
                    <div className="mb-1 text-xs font-medium text-neutral-700">{s.avg_progress_pct}%</div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${s.avg_progress_pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
              </td>
              <td className="px-3 py-3">
                <span
                  className={`text-xs ${s.has_logged_in ? "text-neutral-600" : "font-medium text-amber-700"}`}
                >
                  {s.last_access_label}
                </span>
              </td>
              <td className="px-3 py-3">
                {s.is_suspended ? (
                  <Badge tone="red">Suspended</Badge>
                ) : (
                  <Badge tone="green">Active</Badge>
                )}
              </td>
              <td className="px-3 py-3 text-muted">{formatDate(s.created_at)}</td>
              <td className="px-3 py-3 text-right">
                <Link
                  href={`/admin/students/${s.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-app bg-transparent px-3 text-sm font-semibold transition hover:bg-brand-50"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Manage
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
