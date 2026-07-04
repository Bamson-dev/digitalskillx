import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { getEmailSenderConfig, getPlatformSettingsAdmin } from "@/lib/platform-settings";
import { studentWelcomeEmail } from "@/lib/email/student-welcome";
import {
  courseCompletionCertificateEmail,
  courseEnrollmentEmail,
  idleReminderEmail,
  paymentReceiptEmail,
} from "@/lib/email/system-templates";
import { sendSystemEmail } from "@/lib/system-email";
import { studentFirstName } from "@/lib/student-name";
import { siteUrl } from "@/lib/org";
import { courseCompletionPct } from "@/lib/progress";

function parseCourseIdFromNext(next: string | null | undefined) {
  if (!next) return null;
  const match = next.match(/\/course\/([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

async function loadStudentCourseNames(studentId: string, extraCourseId?: string | null) {
  const admin = await createAdminClientAsync();
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("course:courses(title)")
    .eq("student_id", studentId);

  const names = (enrollments ?? [])
    .map((row) => {
      const course = row.course as { title: string } | { title: string }[] | null;
      if (Array.isArray(course)) return course[0]?.title;
      return course?.title;
    })
    .filter((title): title is string => Boolean(title));

  if (extraCourseId && !names.length) {
    const { data: course } = await admin
      .from("courses")
      .select("title")
      .eq("id", extraCourseId)
      .maybeSingle();
    if (course?.title) names.push(course.title);
  }

  return [...new Set(names)];
}

/** Welcome email — once per student account. */
export async function sendWelcomeEmailIfNeeded(params: {
  studentId: string;
  fullName: string;
  email: string;
  password?: string;
  checkoutCourseId?: string | null;
  /** Admin onboarding: use known course titles when DB join is not ready yet. */
  courseNamesOverride?: string[];
}) {
  const admin = await createAdminClientAsync();

  const { data: profile } = await admin
    .from("profiles")
    .select("welcome_email_sent_at, role")
    .eq("id", params.studentId)
    .maybeSingle();

  if (!profile || profile.role !== "student" || profile.welcome_email_sent_at) {
    return { sent: false as const, reason: "already_sent_or_not_student" as const };
  }

  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();
  const baseUrl = siteUrl();
  const courseNames =
    params.courseNamesOverride?.filter(Boolean).length
      ? [...new Set(params.courseNamesOverride.filter(Boolean))]
      : await loadStudentCourseNames(params.studentId, params.checkoutCourseId);

  const tpl = studentWelcomeEmail({
    firstName: studentFirstName(params.fullName),
    email: params.email,
    password: params.password,
    courseNames,
    loginUrl: `${baseUrl}/login`,
    settingsUrl: `${baseUrl}/settings`,
    supportEmail: sender.replyTo ?? sender.fromAddress,
    brandColor: settings.primary_color,
  });

  const result = await sendSystemEmail({
    type: "welcome",
    to: params.email,
    subject: tpl.subject,
    html: tpl.html,
    replyTo: sender.replyTo,
    payload: { studentId: params.studentId },
  });

  if (result.sent) {
    await admin
      .from("profiles")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("id", params.studentId);
  }

  return result;
}

/** Admin enrollment email — sent each time a student is enrolled in a course. */
export async function sendCourseEnrollmentEmail(params: {
  studentId: string;
  courseId: string;
  fullName: string;
  email: string;
}) {
  const admin = await createAdminClientAsync();

  const { data: course } = await admin
    .from("courses")
    .select("title")
    .eq("id", params.courseId)
    .maybeSingle();

  if (!course?.title) {
    return { sent: false as const, reason: "missing_course" as const };
  }

  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();
  const baseUrl = siteUrl();

  const tpl = courseEnrollmentEmail({
    firstName: studentFirstName(params.fullName),
    courseTitle: course.title,
    courseUrl: `${baseUrl}/courses/${params.courseId}`,
    loginUrl: `${baseUrl}/login`,
    supportEmail: sender.replyTo ?? sender.fromAddress,
    brandColor: settings.primary_color,
  });

  return sendSystemEmail({
    type: "welcome",
    to: params.email,
    subject: tpl.subject,
    html: tpl.html,
    replyTo: sender.replyTo,
    payload: { studentId: params.studentId, courseId: params.courseId },
  });
}

/** Payment receipt — once per successful transaction reference. */
export async function sendPaymentReceiptEmail(params: {
  studentId: string;
  courseId: string;
  reference: string;
}) {
  const admin = await createAdminClientAsync();

  const { data: tx } = await admin
    .from("transactions")
    .select("amount, currency, receipt_email_sent_at, updated_at, created_at")
    .eq("reference", params.reference)
    .maybeSingle();

  if (!tx || tx.receipt_email_sent_at) {
    return { sent: false as const, reason: "already_sent_or_missing_tx" as const };
  }

  const [{ data: profile }, { data: course }] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", params.studentId).single(),
    admin.from("courses").select("title").eq("id", params.courseId).single(),
  ]);

  if (!profile?.email || !course) return { sent: false as const, reason: "missing_profile_or_course" as const };

  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();
  const baseUrl = siteUrl();

  const tpl = paymentReceiptEmail({
    firstName: studentFirstName(profile.full_name ?? "there"),
    courseTitle: course.title,
    amountMinor: tx.amount,
    currency: tx.currency,
    reference: params.reference,
    paidAt: tx.updated_at ?? tx.created_at,
    courseUrl: `${baseUrl}/courses/${params.courseId}`,
    supportEmail: sender.replyTo ?? sender.fromAddress,
    brandColor: settings.primary_color,
  });

  const result = await sendSystemEmail({
    type: "payment_receipt",
    to: profile.email,
    subject: tpl.subject,
    html: tpl.html,
    replyTo: sender.replyTo,
    payload: { studentId: params.studentId, reference: params.reference },
  });

  if (result.sent) {
    await admin
      .from("transactions")
      .update({ receipt_email_sent_at: new Date().toISOString() })
      .eq("reference", params.reference);
  }

  return result;
}

/** Course completion + certificate email — once per enrollment after auto-issue. */
export async function sendCourseCompletionCertificateEmail(params: {
  studentId: string;
  courseId: string;
  certificateId: string;
  certificateNumber: string;
}) {
  const admin = await createAdminClientAsync();

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("completion_email_sent_at")
    .eq("student_id", params.studentId)
    .eq("course_id", params.courseId)
    .maybeSingle();

  if (!enrollment || enrollment.completion_email_sent_at) {
    return { sent: false as const, reason: "already_sent" as const };
  }

  const [{ data: profile }, { data: course }] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", params.studentId).single(),
    admin.from("courses").select("title").eq("id", params.courseId).single(),
  ]);

  if (!profile?.email || !course) return { sent: false as const, reason: "missing_data" as const };

  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();
  const baseUrl = siteUrl();

  const tpl = courseCompletionCertificateEmail({
    firstName: studentFirstName(profile.full_name ?? "there"),
    courseTitle: course.title,
    certificateNumber: params.certificateNumber,
    certificateUrl: `${baseUrl}/certificates/${params.certificateId}`,
    supportEmail: sender.replyTo ?? sender.fromAddress,
    brandColor: settings.primary_color,
  });

  const result = await sendSystemEmail({
    type: "course_completion_certificate",
    to: profile.email,
    subject: tpl.subject,
    html: tpl.html,
    replyTo: sender.replyTo,
    payload: {
      studentId: params.studentId,
      courseId: params.courseId,
      certificateId: params.certificateId,
    },
  });

  if (result.sent) {
    await admin
      .from("enrollments")
      .update({ completion_email_sent_at: new Date().toISOString() })
      .eq("student_id", params.studentId)
      .eq("course_id", params.courseId);
  }

  return result;
}

/** Resolve the lesson URL where the student should resume a course. */
export async function resumeLessonUrl(studentId: string, courseId: string) {
  const admin = await createAdminClientAsync();
  const baseUrl = siteUrl();

  const { data: modules } = await admin
    .from("modules")
    .select("id, position, lessons(id, position)")
    .eq("course_id", courseId)
    .order("position");

  const orderedLessonIds: string[] = [];
  for (const mod of modules ?? []) {
    const lessons = (mod.lessons ?? []) as { id: string; position: number }[];
    lessons.sort((a, b) => a.position - b.position);
    for (const lesson of lessons) orderedLessonIds.push(lesson.id);
  }

  if (orderedLessonIds.length === 0) {
    return `${baseUrl}/courses/${courseId}`;
  }

  const { data: progressRows } = await admin
    .from("lesson_progress")
    .select("lesson_id, completed, updated_at")
    .eq("student_id", studentId)
    .in("lesson_id", orderedLessonIds);

  const progressByLesson = new Map(
    (progressRows ?? []).map((row) => [row.lesson_id, row]),
  );

  let resumeId = orderedLessonIds[0];
  for (const lessonId of orderedLessonIds) {
    const row = progressByLesson.get(lessonId);
    if (!row?.completed) {
      resumeId = lessonId;
      break;
    }
  }

  const lastTouched = [...(progressRows ?? [])].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )[0];
  if (lastTouched && !progressByLesson.get(resumeId)?.completed) {
    resumeId = lastTouched.lesson_id;
  }

  return `${baseUrl}/lessons/${resumeId}`;
}

/** Daily cron: send idle reminders once per enrollment idle period. */
export async function processIdleReminderEmails(inactivityDays = 5) {
  const admin = await createAdminClientAsync();
  const cutoff = new Date(Date.now() - inactivityDays * 86400000).toISOString();
  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();

  const { data: enrollments } = await admin
    .from("enrollments")
    .select(
      "id, student_id, course_id, enrolled_at, idle_reminder_sent_at, student:profiles(full_name, email, last_active_at, role, is_suspended), course:courses(title)",
    )
    .is("completed_at", null)
    .is("idle_reminder_sent_at", null);

  let sent = 0;
  let skipped = 0;

  for (const row of enrollments ?? []) {
    const student = row.student as {
      full_name: string | null;
      email: string;
      last_active_at: string | null;
      role: string;
      is_suspended: boolean;
    } | null;
    const course = row.course as { title: string } | null;

    if (!student || student.role !== "student" || student.is_suspended || !student.email || !course) {
      skipped++;
      continue;
    }

    const lastLogin = student.last_active_at ?? row.enrolled_at;
    if (lastLogin >= cutoff) {
      skipped++;
      continue;
    }

    const { data: modules } = await admin
      .from("modules")
      .select("id")
      .eq("course_id", row.course_id);
    const moduleIds = (modules ?? []).map((m) => m.id);
    if (moduleIds.length === 0) {
      skipped++;
      continue;
    }

    const { data: lessons } = await admin
      .from("lessons")
      .select("id")
      .in("module_id", moduleIds);
    const lessonIds = (lessons ?? []).map((l) => l.id);

    let lastCourseActivity = row.enrolled_at;
    if (lessonIds.length > 0) {
      const { data: progressRows } = await admin
        .from("lesson_progress")
        .select("updated_at")
        .eq("student_id", row.student_id)
        .in("lesson_id", lessonIds)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (progressRows?.[0]?.updated_at) {
        lastCourseActivity = progressRows[0].updated_at;
      }
    }

    if (lastCourseActivity >= cutoff) {
      skipped++;
      continue;
    }

    const progressPct = await courseCompletionPct(row.student_id, row.course_id);
    const resumeUrl = await resumeLessonUrl(row.student_id, row.course_id);

    const tpl = idleReminderEmail({
      firstName: studentFirstName(student.full_name ?? "there"),
      courseTitle: course.title,
      progressPct,
      resumeUrl,
      supportEmail: sender.replyTo ?? sender.fromAddress,
      brandColor: settings.primary_color,
    });

    const result = await sendSystemEmail({
      type: "idle_reminder",
      to: student.email,
      subject: tpl.subject,
      html: tpl.html,
      replyTo: sender.replyTo,
      payload: {
        studentId: row.student_id,
        courseId: row.course_id,
        enrollmentId: row.id,
      },
    });

    if (result.sent) {
      await admin
        .from("enrollments")
        .update({ idle_reminder_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped };
}

export { parseCourseIdFromNext };
