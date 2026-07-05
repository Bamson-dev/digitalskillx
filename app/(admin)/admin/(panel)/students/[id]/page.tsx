import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Award, Clock } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { courseCompletionPct } from "@/lib/progress";
import { loadAuthEmailIndex } from "@/lib/admin-student-overview";
import { StudentProfileForm } from "@/components/admin/student-profile-form";
import { StudentAdminToolbar, StudentEnrollmentList } from "@/components/admin/student-manage-panel";
import { AdminCertificatePanel } from "@/components/admin/admin-certificate-panel";
import { certificateRecipientName } from "@/lib/certificates";
import {
  suspendStudent,
  deleteStudent,
  resetStudentPassword,
  enrollStudent,
  unenrollStudent,
  setStudentTags,
  addAdminNote,
} from "../actions";

export const metadata: Metadata = { title: "Student" };

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { enrolled?: string; already_enrolled?: string; cert_issued?: string };
}) {
  await requireAdmin();
  const supabase = await getAdminSupabase();

  const { data: student } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .eq("role", "student")
    .single();
  if (!student) notFound();

  const authIndex = await loadAuthEmailIndex(supabase);
  const authMeta = authIndex.get(student.email.trim().toLowerCase());
  const lastSignInAt = authMeta?.lastSignInAt ?? null;
  const lastAccessAt = student.last_active_at ?? lastSignInAt;
  const hasLoggedIn = Boolean(lastSignInAt || student.last_active_at);
  const enrollmentStudentIds = [...new Set([params.id, authMeta?.id].filter(Boolean))] as string[];

  const [{ data: enrollments }, { data: allCourses }, { data: notes }, { data: certs }] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("id, completed_at, enrolled_at, course_id, student_id, course:courses(id, title, visibility)")
        .in("student_id", enrollmentStudentIds)
        .order("enrolled_at", { ascending: false }),
      supabase.from("courses").select("id, title, visibility").order("title"),
      supabase
        .from("admin_notes")
        .select("id, content, created_at")
        .eq("student_id", params.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("certificates")
        .select("id, certificate_number, recipient_name, student_id, course:courses(title)")
        .in("student_id", enrollmentStudentIds),
    ]);

  const enrollmentRows = await Promise.all(
    (enrollments ?? []).map(async (e) => {
      const c = Array.isArray(e.course) ? e.course[0] : e.course;
      const courseId = e.course_id;
      const progressStudentId = e.student_id ?? params.id;
      const progressPct = courseId ? await courseCompletionPct(progressStudentId, courseId) : 0;
      return {
        enrollmentId: e.id,
        courseId,
        courseTitle: c?.title ?? "Unknown course",
        completedAt: e.completed_at,
        enrolledAt: e.enrolled_at,
        visibility: c?.visibility ?? null,
        progressPct,
      };
    }),
  );
  const enrollmentRowsFiltered = enrollmentRows
    .filter((row) => Boolean(row.courseId))
    .filter((row, index, rows) => rows.findIndex((item) => item.courseId === row.courseId) === index);

  const enrolledCourseIds = new Set(enrollmentRowsFiltered.map((row) => row.courseId));
  const availableCourses = (allCourses ?? []).filter((c) => !enrolledCourseIds.has(c.id));

  const certificateRows = (certs ?? [])
    .map((c) => {
      const course = Array.isArray(c.course) ? c.course[0] : c.course;
      return {
        id: c.id,
        certificateNumber: c.certificate_number,
        courseTitle: course?.title ?? null,
        recipientName: certificateRecipientName({
          recipientName: c.recipient_name,
          profileFullName: student.full_name,
          email: student.email,
        }),
      };
    })
    .filter((row, index, rows) => rows.findIndex((item) => item.id === row.id) === index);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/students"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All students
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{student.full_name ?? student.email}</h1>
            {student.is_suspended ? (
              <Badge tone="red">Suspended</Badge>
            ) : (
              <Badge tone="green">Active</Badge>
            )}
          </div>
          <p className="text-sm text-muted">{student.email}</p>
          <div className="flex flex-wrap gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Joined {formatDate(student.created_at)}
            </span>
            {hasLoggedIn && lastAccessAt ? (
              <span>
                Last access {formatDate(lastAccessAt, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            ) : (
              <span className="font-medium text-amber-700">Never logged in — invite email sent, awaiting first login</span>
            )}
            {lastSignInAt && student.last_active_at ? (
              <span>
                Last sign-in {formatDate(lastSignInAt, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            ) : null}
          </div>
          {searchParams.enrolled === "1" ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Course enrolled and notification email sent.
            </p>
          ) : null}
          {searchParams.already_enrolled === "1" ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Student is already enrolled in that course.
            </p>
          ) : null}
          {searchParams.cert_issued === "1" ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Certificate issued. The student was emailed a PDF copy and can view it under Certificates.
            </p>
          ) : null}
        </div>
        <StudentAdminToolbar
          studentId={student.id}
          email={student.email}
          fullName={student.full_name}
          isSuspended={student.is_suspended}
          suspendAction={suspendStudent}
          resetPasswordAction={resetStudentPassword}
          deleteAction={deleteStudent}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{enrollmentRowsFiltered.length}</p>
              <p className="text-xs text-muted">Enrolled courses</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{certificateRows.length}</p>
              <p className="text-xs text-muted">Certificates</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{(student.tags ?? []).length}</p>
              <p className="text-xs text-muted">Tags</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account profile" description="Update name and login email." />
          <StudentProfileForm
            studentId={student.id}
            fullName={student.full_name}
            email={student.email}
          />
        </Card>

        <Card>
          <CardHeader title="Course access" description="Grant or revoke course enrollments." />
          <StudentEnrollmentList
            studentId={student.id}
            enrollments={enrollmentRowsFiltered.map((row) => ({
              enrollmentId: row.enrollmentId,
              courseId: row.courseId,
              courseTitle: row.courseTitle,
              completedAt: row.completedAt,
              progressPct: row.progressPct,
            }))}
            unenrollAction={unenrollStudent}
          />
          <form action={enrollStudent} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="student_id" value={student.id} />
            <Select name="course_id" className="flex-1" required defaultValue="">
              <option value="" disabled>
                Select a course to grant access…
              </option>
              {availableCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.visibility !== "published" ? " (draft)" : ""}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" className="shrink-0">
              Grant access
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Tags" description="Group students (e.g. Batch 1)." />
          <form action={setStudentTags} className="flex gap-2">
            <input type="hidden" name="id" value={student.id} />
            <Input
              name="tags"
              defaultValue={(student.tags ?? []).join(", ")}
              placeholder="Batch 1, Facebook Ads"
            />
            <Button type="submit" size="sm">
              Save
            </Button>
          </form>

          <AdminCertificatePanel
            studentId={student.id}
            fullName={student.full_name}
            enrolledCourses={enrollmentRowsFiltered.map((row) => ({
              courseId: row.courseId,
              courseTitle: row.courseTitle,
            }))}
            certificates={certificateRows}
          />
        </Card>

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
            {(notes ?? []).length === 0 ? (
              <p className="text-sm text-muted">No notes yet.</p>
            ) : (
              (notes ?? []).map((n) => (
                <div key={n.id} className="rounded-lg bg-brand-50/40 px-3 py-2 text-sm">
                  <p>{n.content}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatDate(n.created_at, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
