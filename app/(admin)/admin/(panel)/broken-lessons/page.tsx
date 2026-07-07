import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { fetchBrokenLessonsReport } from "@/lib/broken-lessons";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Broken lessons" };

export default async function BrokenLessonsPage() {
  await requireAdmin();
  const supabase = await getAdminSupabase();
  const rows = await fetchBrokenLessonsReport(supabase);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Broken or empty lessons</h1>
        <p className="mt-1 text-sm text-muted">
          Review lessons flagged from YouTube imports or missing titles. Nothing is deleted
          automatically — open the course editor and remove lessons you do not want.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted">No broken or empty lessons found.</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-app bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span className="inline-flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              {rows.length} lesson{rows.length === 1 ? "" : "s"} need review
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted/40 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Lesson</th>
                  <th className="px-4 py-2 font-semibold">Course</th>
                  <th className="px-4 py-2 font-semibold">Module</th>
                  <th className="px-4 py-2 font-semibold">Flags</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-neutral-900">{row.title}</p>
                      {row.youtubeVideoId ? (
                        <p className="mt-0.5 text-xs text-muted">YouTube · {row.youtubeVideoId}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{row.courseTitle}</td>
                    <td className="px-4 py-3 text-neutral-700">{row.moduleTitle}</td>
                    <td className="px-4 py-3">
                      <ul className="space-y-1">
                        {row.flags.map((flag) => (
                          <li
                            key={flag}
                            className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
                          >
                            {flag}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/courses/${row.courseId}`}
                        className="inline-flex items-center gap-1 text-brand hover:underline"
                      >
                        Edit course <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
