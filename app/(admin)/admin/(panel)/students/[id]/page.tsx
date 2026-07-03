import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, KeyRound, Ban, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  suspendStudent,
  deleteStudent,
  resetStudentPassword,
  enrollStudent,
  unenrollStudent,
  setStudentTags,
  addAdminNote,
  issueCertificateManual,
} from "../actions";

export const metadata: Metadata = { title: "Student" };

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { enrolled?: string };
}) {
  await requireAdmin();
  const supabase = createClient();

  const { data: student } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .eq("role", "student")
    .single();
  if (!student) notFound();

  const [{ data: enrollments }, { data: allCourses }, { data: notes }, { data: certs }] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("id, completed_at, enrolled_at, course:courses(id, title)")
        .eq("student_id", params.id),
      supabase.from("courses").select("id, title").order("title"),
      supabase
        .from("admin_notes")
        .select("id, content, created_at")
        .eq("student_id", params.id)
        .order("created_at", { ascending: false }),
      supabase.from("certificates").select("id, certificate_number, course:courses(title)").eq("student_id", params.id),
    ]);

  const enrolledCourseIds = new Set(
    (enrollments ?? []).map((e) => {
      const c = Array.isArray(e.course) ? e.course[0] : e.course;
      return c?.id;
    }),
  );
  const availableCourses = (allCourses ?? []).filter((c) => !enrolledCourseIds.has(c.id));

  return (
    <div className="space-y-6">
      <Link href="/admin/students" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All students
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{student.full_name ?? student.email}</h1>
          <p className="text-sm text-muted">{student.email}</p>
          {searchParams.enrolled === "1" ? (
            <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Course enrolled and notification email sent.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={suspendStudent}>
            <input type="hidden" name="id" value={student.id} />
            <input type="hidden" name="suspend" value={(!student.is_suspended).toString()} />
            <Button variant="outline" size="sm" type="submit">
              {student.is_suspended ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Unsuspend
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" /> Suspend
                </>
              )}
            </Button>
          </form>
          <form action={resetStudentPassword}>
            <input type="hidden" name="id" value={student.id} />
            <input type="hidden" name="email" value={student.email} />
            <input type="hidden" name="full_name" value={student.full_name ?? ""} />
            <Button variant="outline" size="sm" type="submit">
              <KeyRound className="h-4 w-4" /> Reset password
            </Button>
          </form>
          <form action={deleteStudent}>
            <input type="hidden" name="id" value={student.id} />
            <Button variant="danger" size="sm" type="submit">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Enrolled courses" />
          <div className="space-y-2">
            {(enrollments ?? []).length === 0 ? (
              <p className="text-sm text-muted">Not enrolled in any course.</p>
            ) : (
              (enrollments ?? []).map((e) => {
                const c = Array.isArray(e.course) ? e.course[0] : e.course;
                if (!c) return null;
                return (
                  <div key={e.id} className="flex items-center justify-between rounded-lg border border-app px-3 py-2 text-sm">
                    <span>
                      {c.title}{" "}
                      {e.completed_at ? <Badge tone="green">Completed</Badge> : <Badge tone="amber">In progress</Badge>}
                    </span>
                    <form action={unenrollStudent}>
                      <input type="hidden" name="student_id" value={student.id} />
                      <input type="hidden" name="course_id" value={c.id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    </form>
                  </div>
                );
              })
            )}
          </div>
          <form action={enrollStudent} className="mt-3 flex gap-2">
            <input type="hidden" name="student_id" value={student.id} />
            <Select name="course_id" className="flex-1">
              <option value="">Select a course to enroll…</option>
              {availableCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm">
              Enroll
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Tags" description="Group students (e.g. Batch 1)." />
          <form action={setStudentTags} className="flex gap-2">
            <input type="hidden" name="id" value={student.id} />
            <Input name="tags" defaultValue={(student.tags ?? []).join(", ")} placeholder="Batch 1, Facebook Ads" />
            <Button type="submit" size="sm">
              Save
            </Button>
          </form>

          <div className="mt-6">
            <h4 className="mb-2 text-sm font-semibold">Certificates</h4>
            <form action={issueCertificateManual} className="mb-3 flex gap-2">
              <input type="hidden" name="student_id" value={student.id} />
              <Select name="course_id" className="flex-1">
                <option value="">Issue certificate for…</option>
                {(enrollments ?? []).map((e) => {
                  const c = Array.isArray(e.course) ? e.course[0] : e.course;
                  if (!c) return null;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  );
                })}
              </Select>
              <Button type="submit" size="sm">
                Issue
              </Button>
            </form>
            {(certs ?? []).length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(certs ?? []).map((c) => {
                  const course = Array.isArray(c.course) ? c.course[0] : c.course;
                  return (
                    <li key={c.id} className="text-muted">
                      {course?.title} · #{c.certificate_number}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Internal notes" description="Visible to admins only." />
        <form action={addAdminNote} className="mb-4 flex gap-2">
          <input type="hidden" name="student_id" value={student.id} />
          <Textarea name="content" rows={2} placeholder="Add a private note…" className="flex-1" />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
        <div className="space-y-2">
          {(notes ?? []).map((n) => (
            <div key={n.id} className="rounded-lg bg-brand-50/40 px-3 py-2 text-sm">
              <p>{n.content}</p>
              <p className="mt-1 text-xs text-muted">{formatDate(n.created_at, { dateStyle: "medium", timeStyle: "short" })}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
