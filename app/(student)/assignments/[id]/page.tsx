import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { submitAssignment } from "./actions";

export const metadata: Metadata = { title: "Assignment" };

export default async function AssignmentPage({ params }: { params: { id: string } }) {
  const profile = await requireStudent();
  const supabase = createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, instructions, due_date, submission_types_allowed, status")
    .eq("id", params.id)
    .single();
  if (!assignment || assignment.status === "draft") notFound();

  const { data: submissions } = await supabase
    .from("assignment_submissions")
    .select("id, content, link_url, file_url, status, grade, feedback, submitted_at")
    .eq("assignment_id", params.id)
    .eq("student_id", profile.id)
    .order("submitted_at", { ascending: false });

  const allowed = assignment.submission_types_allowed ?? [];
  const latest = submissions?.[0];
  const canResubmit = !latest || latest.status === "revision_requested";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{assignment.title}</h1>
        {assignment.due_date ? (
          <p className="mt-1 text-sm text-muted">Due {formatDate(assignment.due_date, { dateStyle: "medium", timeStyle: "short" })}</p>
        ) : null}
      </div>

      {assignment.instructions ? (
        <Card>
          <p className="whitespace-pre-wrap text-sm">{assignment.instructions}</p>
        </Card>
      ) : null}

      {canResubmit ? (
        <Card>
          <CardHeader title="Submit your work" />
          <form action={submitAssignment} className="space-y-3">
            <input type="hidden" name="assignment_id" value={assignment.id} />
            {allowed.includes("text") ? (
              <div>
                <Label>Written response</Label>
                <Textarea name="content" rows={4} />
              </div>
            ) : null}
            {allowed.includes("link") || allowed.includes("video") ? (
              <div>
                <Label>Link (Google Docs / Loom / YouTube)</Label>
                <Input name="link_url" placeholder="https://…" />
              </div>
            ) : null}
            {allowed.includes("file") ? (
              <div>
                <Label>File URL</Label>
                <Input name="file_url" placeholder="Paste an uploaded file URL" />
              </div>
            ) : null}
            <Button type="submit">Submit</Button>
          </form>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Your submissions" />
        {!submissions || submissions.length === 0 ? (
          <p className="text-sm text-muted">No submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => (
              <div key={s.id} className="rounded-lg border border-app p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">{formatDate(s.submitted_at, { dateStyle: "medium", timeStyle: "short" })}</span>
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
                  <a href={s.link_url} className="mt-1 block text-brand hover:underline" target="_blank" rel="noreferrer">
                    {s.link_url}
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
