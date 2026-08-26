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
import { StudentProfileForm } from "@/components/admin/student-profile-form";
import {
  StudentAdminToolbar,
  StudentDeviceAccessPanel,
  StudentEnrollmentList,
} from "@/components/admin/student-manage-panel";
import { AdminCertificatePanel } from "@/components/admin/admin-certificate-panel";
import { certificateRecipientName } from "@/lib/certificates";
import {
  suspendStudent,
  deleteStudent,
  resetStudentPassword,
  resetStudentDevices,
  updateStudentMaxDevices,
  enrollStudent,
  unenrollStudent,
  setStudentTags,
  addAdminNote,
} from "../actions";
import { getCustomerTimeline, getCustomerValue } from "@/lib/customer-crm";
import { listTagCatalog } from "@/lib/tag-catalog";
import { logAudit } from "@/lib/audit";
import {
  countActiveDevices,
  DEFAULT_PAID_MAX_DEVICES,
  getStudentMaxDevices,
  studentHasPaidProgramAccess,
} from "@/lib/device-login-limit";
import { listAccountSessions } from "@/lib/account-sessions";

export const metadata: Metadata = { title: "Customer" };

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    enrolled?: string;
    already_enrolled?: string;
    cert_issued?: string;
    devices_reset?: string;
    max_devices_updated?: string;
  };
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

  let lastSignInAt: string | null = null;
  let authUserId: string | null = null;
  try {
    const { data: authData } = await supabase.auth.admin.getUserById(params.id);
    lastSignInAt = authData.user?.last_sign_in_at ?? null;
    authUserId = authData.user?.id ?? null;
  } catch (err) {
    console.error("[StudentDetailPage] getUserById failed", err);
  }
  const lastAccessAt = student.last_active_at ?? lastSignInAt;
  const hasLoggedIn = Boolean(lastSignInAt || student.last_active_at);
  const enrollmentStudentIds = [...new Set([params.id, authUserId].filter(Boolean))] as string[];

  let paidProgramAccess = false;
  let maxDevices = DEFAULT_PAID_MAX_DEVICES;
  let activeDeviceCount = 0;
  let deviceSessions: Awaited<ReturnType<typeof listAccountSessions>> = [];
  try {
    paidProgramAccess = await studentHasPaidProgramAccess(supabase, params.id);
    maxDevices = await getStudentMaxDevices(supabase, params.id);
    activeDeviceCount = await countActiveDevices(supabase, params.id);
    deviceSessions = await listAccountSessions(supabase, params.id);
  } catch (err) {
    console.error("[StudentDetailPage] device access load failed", err);
  }

  const [{ data: enrollments }, { data: allCourses }, { data: notes }, { data: certs }, value, timeline, catalogTags, { data: purchases }, { data: auditRows }] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("id, completed_at, enrolled_at, course_id, student_id, course:courses(id, title, visibility)")
        .in("student_id", enrollmentStudentIds)
        .order("enrolled_at", { ascending: false }),
      supabase.from("courses").select("id, title, visibility").order("title"),
      supabase
        .from("admin_notes")
        .select("id, content, created_at, admin_id")
        .eq("student_id", params.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("certificates")
        .select("id, certificate_number, recipient_name, student_id, course:courses(title)")
        .in("student_id", enrollmentStudentIds),
      getCustomerValue(supabase, params.id),
      getCustomerTimeline(supabase, params.id, 60),
      listTagCatalog(supabase),
      supabase
        .from("transactions")
        .select("id, amount, currency, status, reference, created_at, course:courses(title)")
        .eq("student_id", params.id)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("audit_logs")
        .select("id, action, created_at, metadata")
        .eq("target_id", params.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  void logAudit({
    action: "customer_viewed",
    targetType: "profile",
    targetId: params.id,
  });

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
        <ArrowLeft className="h-4 w-4" /> All customers
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
          {searchParams.devices_reset === "1" ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Device logins reset. The student can sign in again on new devices (up to their max).
            </p>
          ) : null}
          {searchParams.max_devices_updated === "1" ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Max device limit updated for this student.
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total spent</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            ₦{Math.round(value.totalSpentNgn).toLocaleString()}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Purchases</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value.purchaseCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Avg order</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            ₦{Math.round(value.averageOrderValueNgn).toLocaleString()}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Last purchase</p>
          <p className="mt-1 text-sm font-semibold">
            {value.lastPurchaseAt ? formatDate(value.lastPurchaseAt) : "—"}
          </p>
        </Card>
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

      <Card>
        <CardHeader
          title="Device login protection"
          description="Paid programs are capped at 4 devices by default. Raise the limit or reset devices when a student needs help."
        />
        <div className="px-6 pb-6">
          <StudentDeviceAccessPanel
            studentId={student.id}
            paidProgramAccess={paidProgramAccess}
            activeDeviceCount={activeDeviceCount}
            maxDevices={maxDevices}
            sessions={deviceSessions.map((s) => ({
              id: s.id,
              browser: s.browser,
              os: s.os,
              device: s.device,
              city: s.city,
              country: s.country,
              lastActiveAt: s.last_active_at,
              isCurrent: s.is_current,
            }))}
            resetDevicesAction={resetStudentDevices}
            updateMaxDevicesAction={updateStudentMaxDevices}
          />
        </div>
      </Card>

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
          <CardHeader title="Tags" description="Group customers. Catalog tags appear as suggestions." />
          <form action={setStudentTags} className="flex gap-2">
            <input type="hidden" name="id" value={student.id} />
            <Input
              name="tags"
              defaultValue={(student.tags ?? []).join(", ")}
              placeholder="Batch 1, Facebook Ads"
              list="tag-catalog-suggestions"
            />
            <datalist id="tag-catalog-suggestions">
              {catalogTags.map((t) => (
                <option key={t.id} value={t.label} />
              ))}
            </datalist>
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
          <CardHeader title="Internal notes" description="Visible to admins only — never shown to students." />
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Purchase history" description="Successful transactions only." />
          {(purchases ?? []).length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted">No successful purchases.</p>
          ) : (
            <ul className="divide-y divide-app px-4 pb-4 text-sm">
              {(purchases ?? []).map((p) => {
                const course = Array.isArray(p.course) ? p.course[0] : p.course;
                const naira =
                  String(p.currency).toUpperCase() === "NGN" ? Number(p.amount) / 100 : Number(p.amount);
                return (
                  <li key={p.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {(course as { title?: string } | null)?.title ?? "Course"}
                      <span className="block text-xs text-muted">{p.reference}</span>
                    </span>
                    <span className="tabular-nums font-medium">
                      ₦{Math.round(naira).toLocaleString()}
                      <span className="block text-xs font-normal text-muted">
                        {formatDate(p.created_at)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Communication / audit"
            description="Recent admin actions targeting this customer."
          />
          {(auditRows ?? []).length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted">No audit events linked to this profile yet.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto px-4 pb-4 text-sm">
              {(auditRows ?? []).map((a) => (
                <li key={a.id} className="border-b border-app/50 pb-2">
                  <p className="font-medium">{a.action}</p>
                  <p className="text-xs text-muted">
                    {formatDate(a.created_at, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Customer timeline" description="Chronological events from real system data." />
        {timeline.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">No timeline events yet.</p>
        ) : (
          <ol className="max-h-[480px] space-y-3 overflow-y-auto px-4 pb-4">
            {timeline.map((ev) => (
              <li key={ev.id} className="border-l-2 border-brand/30 pl-3 text-sm">
                <p className="text-xs text-muted">
                  {formatDate(ev.at, { dateStyle: "medium", timeStyle: "short" })}
                </p>
                <p className="font-medium">{ev.title}</p>
                {ev.detail ? <p className="text-muted">{ev.detail}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
