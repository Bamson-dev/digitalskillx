import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { loadStudentSubmissions } from "@/lib/assignment-submission";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { AssignmentSubmitForm } from "@/components/student/assignment-submit-form";

export const metadata: Metadata = { title: "Assignment" };

export default async function AssignmentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { submitted?: string };
}) {
  const profile = await requireStudent();
  const supabase = createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, instructions, due_date, submission_types_allowed, status")
    .eq("id", params.id)
    .single();
  if (!assignment || assignment.status === "draft") notFound();

  const submissions = await loadStudentSubmissions({
    studentId: profile.id,
    studentEmail: profile.email,
    assignmentId: params.id,
  });

  const allowed = assignment.submission_types_allowed ?? [];
  const latest = submissions[0];
  const canResubmit = !latest || latest.status === "revision_requested";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{assignment.title}</h1>
        {assignment.due_date ? (
          <p className="mt-1 text-sm text-muted">
            Due {formatDate(assignment.due_date, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        ) : null}
      </div>

      {assignment.instructions ? (
        <Card>
          <p className="whitespace-pre-wrap text-sm">{assignment.instructions}</p>
        </Card>
      ) : null}

      {searchParams.submitted === "1" ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Submission received. Your work is now pending review.
        </p>
      ) : null}

      {canResubmit ? (
        <Card>
          <AssignmentSubmitForm assignmentId={assignment.id} allowed={allowed} />
        </Card>
      ) : null}

      <Card>
        <div className="mb-3">
          <h2 className="font-semibold">Your submissions</h2>
        </div>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted">No submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => (
              <div key={s.id} className="rounded-lg border border-app p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">
                    {formatDate(s.submitted_at, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  {s.status === "graded" ? (
                    <Badge tone="green">Graded{s.grade != null ? ` · ${s.grade}` : ""}</Badge>
                  ) : s.status === "revision_requested" ? (
                    <Badge tone="amber">Revision requested</Badge>
                  ) : (
                    <Badge tone="neutral">Pending</Badge>
                  )}
                </div>
                {s.content ? <p className="mt-2 whitespace-pre-wrap">{s.content}</p> : null}
                {s.link_url ? (
                  <a
                    href={s.link_url}
                    className="mt-1 block text-brand hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.link_url}
                  </a>
                ) : null}
                {s.file_url ? (
                  <a
                    href={s.file_url}
                    className="mt-1 block text-brand hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.file_url}
                  </a>
                ) : null}
                {s.feedback ? (
                  <div className="mt-2 rounded bg-brand-50/50 p-2">
                    <p className="text-xs font-semibold text-muted">Feedback</p>
                    <p>{s.feedback}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
