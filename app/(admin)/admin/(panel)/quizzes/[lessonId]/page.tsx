import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { QuizAnswer, QuizQuestion } from "@/types/database";
import {
  createQuizForLesson,
  updateQuizSettings,
  deleteQuiz,
  addQuestion,
  deleteQuestion,
  addAnswer,
  toggleAnswerCorrect,
  deleteAnswer,
} from "../actions";

export const metadata: Metadata = { title: "Quiz builder" };

const QUESTION_TYPES = [
  { value: "mcq_single", label: "Multiple choice (single)" },
  { value: "mcq_multiple", label: "Multiple choice (multiple)" },
  { value: "true_false", label: "True / False" },
  { value: "short_answer", label: "Short answer (manual)" },
  { value: "essay", label: "Essay (manual)" },
  { value: "file_upload", label: "File upload (manual)" },
];

type QuestionWithAnswers = QuizQuestion & { quiz_answers: QuizAnswer[] };

export default async function QuizBuilderPage({ params }: { params: { lessonId: string } }) {
  await requireAdmin();
  const supabase = createClient();

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title, module:modules(course_id)")
    .eq("id", params.lessonId)
    .single();
  if (!lesson) notFound();
  const moduleRel = lesson.module as { course_id: string } | { course_id: string }[] | null;
  const courseId = Array.isArray(moduleRel) ? moduleRel[0]?.course_id : moduleRel?.course_id;

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("*, quiz_questions(*, quiz_answers(*))")
    .eq("lesson_id", params.lessonId)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <Link href={`/admin/courses/${courseId}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to course
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Quiz · {lesson.title}</h1>
        <p className="mt-1 text-sm text-muted">Attach an assessment to this lesson.</p>
      </div>

      {!quiz ? (
        <Card>
          <form action={createQuizForLesson} className="flex gap-2">
            <input type="hidden" name="lesson_id" value={params.lessonId} />
            <Input name="title" placeholder="Quiz title" defaultValue={`${lesson.title} quiz`} />
            <Button type="submit">
              <Plus className="h-4 w-4" /> Create quiz
            </Button>
          </form>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Quiz settings" />
            <form action={updateQuizSettings} className="grid gap-4 sm:grid-cols-3">
              <input type="hidden" name="id" value={quiz.id} />
              <input type="hidden" name="lesson_id" value={params.lessonId} />
              <div className="sm:col-span-3">
                <Label>Title</Label>
                <Input name="title" defaultValue={quiz.title} />
              </div>
              <div>
                <Label>Pass score %</Label>
                <Input name="pass_score" type="number" min={0} max={100} defaultValue={quiz.pass_score} />
              </div>
              <div>
                <Label>Time limit (mins)</Label>
                <Input name="time_limit_mins" type="number" min={0} defaultValue={quiz.time_limit_mins ?? ""} />
              </div>
              <div>
                <Label>Retakes</Label>
                <Select name="retake_rule" defaultValue={quiz.retake_rule}>
                  <option value="unlimited">Unlimited</option>
                  <option value="limited">Limited</option>
                  <option value="none">No retakes</option>
                </Select>
              </div>
              <div>
                <Label>Retake limit</Label>
                <Input name="retake_limit" type="number" min={0} defaultValue={quiz.retake_limit ?? ""} />
              </div>
              <div>
                <Label>Show answers</Label>
                <Select name="show_answers_on" defaultValue={quiz.show_answers_on}>
                  <option value="always">Always</option>
                  <option value="on_pass">Only on pass</option>
                  <option value="never">Never</option>
                </Select>
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="randomize_questions" defaultChecked={quiz.randomize_questions} /> Randomize Qs
                </label>
              </div>
              <div className="flex items-center gap-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="randomize_answers" defaultChecked={quiz.randomize_answers} /> Randomize answers
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="negative_marking" defaultChecked={quiz.negative_marking} /> Negative marking
                </label>
              </div>
              <div className="sm:col-span-3 flex items-center justify-between">
                <Button type="submit">Save settings</Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title="Questions" />
            <div className="space-y-4">
              {[...((quiz.quiz_questions as QuestionWithAnswers[]) ?? [])]
                .sort((a, b) => a.position - b.position)
                .map((q, idx) => (
                  <QuestionBlock key={q.id} index={idx} question={q} lessonId={params.lessonId} />
                ))}
            </div>

            <form action={addQuestion} className="mt-4 grid gap-2 rounded-lg border border-dashed border-app p-3 sm:grid-cols-[1fr_180px_90px_auto]">
              <input type="hidden" name="quiz_id" value={quiz.id} />
              <input type="hidden" name="lesson_id" value={params.lessonId} />
              <Input name="question_text" placeholder="New question text" />
              <Select name="question_type">
                {QUESTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Input name="points" type="number" min={0} step={0.5} defaultValue={1} title="Points" />
              <Button type="submit" variant="outline">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </form>
          </Card>

          <Card className="border-red-200">
            <CardHeader title="Delete quiz" description="Removes the quiz, its questions and attempts." />
            <form action={deleteQuiz}>
              <input type="hidden" name="id" value={quiz.id} />
              <input type="hidden" name="lesson_id" value={params.lessonId} />
              <Button variant="danger" type="submit">
                <Trash2 className="h-4 w-4" /> Delete quiz
              </Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

function QuestionBlock({
  index,
  question,
  lessonId,
}: {
  index: number;
  question: QuestionWithAnswers;
  lessonId: string;
}) {
  const choiceBased = ["mcq_single", "mcq_multiple", "true_false"].includes(question.question_type);
  const answers = [...(question.quiz_answers ?? [])].sort((a, b) => a.position - b.position);

  return (
    <div className="rounded-lg border border-app p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-sm font-medium">
            {index + 1}. {question.question_text}
          </span>
          <div className="mt-1 flex items-center gap-2">
            <Badge tone="brand">{question.question_type}</Badge>
            <span className="text-xs text-muted">{question.points} pt(s)</span>
          </div>
        </div>
        <form action={deleteQuestion}>
          <input type="hidden" name="id" value={question.id} />
          <input type="hidden" name="lesson_id" value={lessonId} />
          <button type="submit" className="rounded p-1.5 text-red-600 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </form>
      </div>

      {choiceBased ? (
        <div className="mt-3 space-y-1.5">
          {answers.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <form action={toggleAnswerCorrect}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="lesson_id" value={lessonId} />
                <input type="hidden" name="is_correct" value={(!a.is_correct).toString()} />
                <button
                  type="submit"
                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                    a.is_correct ? "border-green-600 bg-green-600 text-white" : "border-app"
                  }`}
                  title="Toggle correct"
                >
                  {a.is_correct ? <Check className="h-3 w-3" /> : null}
                </button>
              </form>
              <span className="flex-1">{a.answer_text}</span>
              <form action={deleteAnswer}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="lesson_id" value={lessonId} />
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  remove
                </button>
              </form>
            </div>
          ))}

          {question.question_type !== "true_false" ? (
            <form action={addAnswer} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="question_id" value={question.id} />
              <input type="hidden" name="lesson_id" value={lessonId} />
              <Input name="answer_text" placeholder="Add option" className="h-8" />
              <label className="flex items-center gap-1 text-xs text-muted">
                <input type="checkbox" name="is_correct" /> correct
              </label>
              <Button type="submit" size="sm" variant="ghost">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Manually graded — students submit free text or a file.</p>
      )}
    </div>
  );
}
