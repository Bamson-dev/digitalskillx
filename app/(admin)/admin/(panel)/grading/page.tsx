import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { gradeAttempt } from "@/app/(student)/quizzes/[id]/actions";
import { gradeSubmission } from "@/app/(admin)/admin/(panel)/assignments/actions";

export const metadata: Metadata = { title: "Grading" };

export default async function GradingPage() {
  await requireAdmin();
  const supabase = createClient();

  const [{ data: attempts }, { data: subs }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("id, score, responses, submitted_at, student:profiles(full_name, email), quiz:quizzes(title, pass_score)")
      .is("passed", null)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("assignment_submissions")
      .select("id, content, link_url, file_url, submitted_at, student:profiles(full_name, email), assignment:assignments(title)")
      .eq("status", "pending")
      .order("submitted_at", { ascending: false }),
  ]);

  function rel<T>(v: T | T[] | null): T | undefined {
    return Array.isArray(v) ? v[0] : (v ?? undefined);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Grading queue</h1>
        <p className="mt-1 text-sm text-muted">Review quizzes and assignments awaiting manual grading.</p>
      </div>

      <section>
        <CardHeader title="Quizzes pending grading" />
        {!attempts || attempts.length === 0 ? (
          <Card className="text-sm text-muted">Nothing to grade.</Card>
        ) : (
          <div className="space-y-3">
            {attempts.map((a) => {
              const student = rel(a.student);
              const quiz = rel(a.quiz);
              return (
                <Card key={a.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{quiz?.title}</p>
                      <p className="text-xs text-muted">
                        {student?.full_name ?? student?.email} · {formatDate(a.submitted_at, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                    <span className="text-sm text-muted">Auto: {a.score ?? 0}%</span>
                  </div>
                  <form action={gradeAttempt} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="attempt_id" value={a.id} />
                    <input type="hidden" name="pass_score" value={quiz?.pass_score ?? 70} />
                    <div className="w-28">
                      <Label>Final score %</Label>
                      <Input name="score" type="number" min={0} max={100} defaultValue={a.score ?? 0} />
                    </div>
                    <Button type="submit" size="sm">
                      Save grade
                    </Button>
                  </form>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <CardHeader title="Assignments pending review" />
        {!subs || subs.length === 0 ? (
          <Card className="text-sm text-muted">Nothing to review.</Card>
        ) : (
          <div className="space-y-3">
            {subs.map((s) => {
              const student = rel(s.student);
              const assignment = rel(s.assignment);
              return (
                <Card key={s.id}>
                  <div className="mb-2">
                    <p className="font-medium">{assignment?.title}</p>
                    <p className="text-xs text-muted">
                      {student?.full_name ?? student?.email} · {formatDate(s.submitted_at, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  {s.content ? <p className="mb-2 whitespace-pre-wrap rounded bg-brand-50/40 p-2 text-sm">{s.content}</p> : null}
                  {s.link_url ? (
                    <a href={s.link_url} target="_blank" rel="noreferrer" className="mb-2 block text-sm text-brand hover:underline">
                      {s.link_url}
                    </a>
                  ) : null}
                  {s.file_url ? (
                    <a href={s.file_url} target="_blank" rel="noreferrer" className="mb-2 block text-sm text-brand hover:underline">
                      View file
                    </a>
                  ) : null}
                  <form action={gradeSubmission} className="grid gap-2 sm:grid-cols-[100px_1fr_160px_auto] sm:items-end">
                    <input type="hidden" name="id" value={s.id} />
                    <div>
                      <Label>Grade</Label>
                      <Input name="grade" type="number" min={0} />
                    </div>
                    <div>
                      <Label>Feedback</Label>
                      <Textarea name="feedback" rows={1} />
                    </div>
                    <div>
                      <Label>Action</Label>
                      <Select name="status">
                        <option value="graded">Mark graded</option>
                        <option value="revision_requested">Request revision</option>
                      </Select>
                    </div>
                    <Button type="submit" size="sm">
                      Submit
                    </Button>
                  </form>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
