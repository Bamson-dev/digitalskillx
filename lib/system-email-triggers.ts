import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { getEmailSenderConfig, getPlatformSettingsAdmin } from "@/lib/platform-settings";
import { studentWelcomeEmail } from "@/lib/email/student-welcome";
import {
  checkoutAbandonReminderEmail,
  courseCompletionCertificateEmail,
  courseEnrollmentEmail,
  idleReminderEmail,
  paymentReceiptEmail,
  paystackCourseAccessReadyEmail,
  progressMilestoneEmail,
} from "@/lib/email/system-templates";
import { sendSystemEmail } from "@/lib/system-email";
import { studentFirstName } from "@/lib/student-name";
import { siteUrl } from "@/lib/org";
import { courseCompletionPct } from "@/lib/progress";
import { isMissingRelationError } from "@/lib/schema-guard";

const CHECKOUT_ABANDON_EMAIL_COOLDOWN_MS = 72 * 60 * 60 * 1000;

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
    type: "course_enrollment",
    to: params.email,
    subject: tpl.subject,
    html: tpl.html,
    replyTo: sender.replyTo,
    payload: { studentId: params.studentId, courseId: params.courseId },
  });
}

/** Paystack Payment Page access email — sent after external checkout enrollment. */
export async function sendPaystackCourseAccessEmail(params: {
  email: string;
  firstName: string;
  courseTitle: string;
  courseUrl: string;
  loginUrl: string;
  isNewAccount: boolean;
}) {
  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();
  const tpl = paystackCourseAccessReadyEmail({
    firstName: studentFirstName(params.firstName),
    courseTitle: params.courseTitle,
    courseUrl: params.courseUrl,
    loginUrl: params.loginUrl,
    isNewAccount: params.isNewAccount,
    supportEmail: sender.replyTo ?? sender.fromAddress,
    brandColor: settings.primary_color,
  });

  return sendSystemEmail({
    type: "paystack_course_access",
    to: params.email.trim().toLowerCase(),
    subject: tpl.subject,
    html: tpl.html,
    replyTo: sender.replyTo,
    payload: { courseTitle: params.courseTitle, isNewAccount: params.isNewAccount },
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

/** Certificate issued email with PDF attachment — admin manual issue or auto completion. */
export async function sendCertificateIssuedEmail(params: {
  studentId: string;
  courseId: string;
  certificateId: string;
  certificateNumber: string;
  fullName: string;
  email: string;
  courseTitle: string;
  issuedAt: string;
  kind?: "course" | "learning_path";
  creatorName?: string | null;
}) {
  const { generateCertificatePdfBuffer } = await import("@/lib/certificate-pdf");

  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();
  const baseUrl = siteUrl();
  const certificateUrl = `${baseUrl}/certificates/${params.certificateId}`;
  const verifyUrl = `${baseUrl}/verify/${params.certificateNumber}`;

  const tpl = courseCompletionCertificateEmail({
    firstName: studentFirstName(params.fullName),
    courseTitle: params.courseTitle,
    certificateNumber: params.certificateNumber,
    certificateUrl,
    supportEmail: sender.replyTo ?? sender.fromAddress,
    brandColor: settings.primary_color,
    kind: params.kind,
    verifyUrl,
  });

  const pdf = await generateCertificatePdfBuffer({
    recipientName: params.fullName,
    courseTitle: params.courseTitle,
    certificateNumber: params.certificateNumber,
    issuedAt: params.issuedAt,
    verifyUrl,
    kind: params.kind,
    creatorName: params.creatorName,
  });

  return sendSystemEmail({
    type: "course_completion_certificate",
    to: params.email,
    subject: tpl.subject,
    html: tpl.html,
    replyTo: sender.replyTo,
    attachments: [
      {
        filename: `DigitalSkillX-Certificate-${params.certificateNumber}.pdf`,
        content: pdf,
      },
    ],
    payload: {
      studentId: params.studentId,
      courseId: params.courseId,
      certificateId: params.certificateId,
    },
  });
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

/** Resolve the lesson id where the student should resume a course. */
async function resolveResumeLessonId(studentId: string, courseId: string) {
  const admin = await createAdminClientAsync();

  const { data: modules } = await admin
    .from("modules")
    .select("id, position, lessons(id, position, title)")
    .eq("course_id", courseId)
    .order("position");

  const orderedLessons: { id: string; title: string }[] = [];
  for (const mod of modules ?? []) {
    const lessons = (mod.lessons ?? []) as { id: string; position: number; title: string }[];
    lessons.sort((a, b) => a.position - b.position);
    for (const lesson of lessons) orderedLessons.push({ id: lesson.id, title: lesson.title });
  }

  if (orderedLessons.length === 0) return null;

  const orderedLessonIds = orderedLessons.map((lesson) => lesson.id);
  const { data: progressRows } = await admin
    .from("lesson_progress")
    .select("lesson_id, completed, updated_at")
    .eq("student_id", studentId)
    .in("lesson_id", orderedLessonIds);

  const progressByLesson = new Map(
    (progressRows ?? []).map((row) => [row.lesson_id, row]),
  );

  let resumeId = orderedLessons[0].id;
  for (const lesson of orderedLessons) {
    const row = progressByLesson.get(lesson.id);
    if (!row?.completed) {
      resumeId = lesson.id;
      break;
    }
  }

  const lastTouched = [...(progressRows ?? [])].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )[0];
  if (lastTouched && !progressByLesson.get(resumeId)?.completed) {
    resumeId = lastTouched.lesson_id;
  }

  const resumeLesson = orderedLessons.find((lesson) => lesson.id === resumeId) ?? orderedLessons[0];
  const nextIncomplete =
    orderedLessons.find((lesson) => !progressByLesson.get(lesson.id)?.completed) ?? resumeLesson;

  return {
    resumeLessonId: resumeLesson.id,
    nextLessonTitle: nextIncomplete.title,
  };
}

/** Path-only resume link for in-app navigation (e.g. /lessons/{id}). */
export async function resumeLessonPath(studentId: string, courseId: string) {
  const resolved = await resolveResumeLessonId(studentId, courseId);
  if (!resolved) return `/courses/${courseId}`;
  return `/lessons/${resolved.resumeLessonId}`;
}

/** Resolve the lesson URL where the student should resume a course. */
export async function resumeLessonUrl(studentId: string, courseId: string) {
  const baseUrl = siteUrl();
  return `${baseUrl}${await resumeLessonPath(studentId, courseId)}`;
}

const PROGRESS_MILESTONES = [25, 50, 75] as const;
type ProgressMilestone = (typeof PROGRESS_MILESTONES)[number];

const MILESTONE_SENT_COLUMNS: Record<
  ProgressMilestone,
  "milestone_25_email_sent_at" | "milestone_50_email_sent_at" | "milestone_75_email_sent_at"
> = {
  25: "milestone_25_email_sent_at",
  50: "milestone_50_email_sent_at",
  75: "milestone_75_email_sent_at",
};

/**
 * Send 25/50/75% milestone emails once per student per course.
 *
 * Idempotency: each milestone is gated by a nullable `milestone_*_email_sent_at`
 * column on enrollments. We read sent flags before sending, and only set the
 * timestamp after Resend reports success — so retries never duplicate mail.
 */
export async function sendProgressMilestoneEmailsIfNeeded(params: {
  studentId: string;
  courseId: string;
  pct: number;
}) {
  const admin = await createAdminClientAsync();

  const { data: enrollment, error: enrollmentError } = await admin
    .from("enrollments")
    .select(
      "id, completed_at, milestone_25_email_sent_at, milestone_50_email_sent_at, milestone_75_email_sent_at",
    )
    .eq("student_id", params.studentId)
    .eq("course_id", params.courseId)
    .maybeSingle();

  if (enrollmentError) {
    console.error("[progress] milestone enrollment lookup failed:", enrollmentError.message);
    return { sent: 0 as const, skipped: true as const };
  }

  if (!enrollment || enrollment.completed_at) {
    return { sent: 0 as const, skipped: true as const };
  }

  const pending = PROGRESS_MILESTONES.filter((milestone) => {
    const sentAt = enrollment[MILESTONE_SENT_COLUMNS[milestone]];
    return params.pct >= milestone && !sentAt;
  });

  if (pending.length === 0) {
    return { sent: 0 as const, skipped: true as const };
  }

  const [{ data: profile }, { data: course }, resume] = await Promise.all([
    admin.from("profiles").select("full_name, email, role, is_suspended").eq("id", params.studentId).maybeSingle(),
    admin.from("courses").select("title").eq("id", params.courseId).maybeSingle(),
    resolveResumeLessonId(params.studentId, params.courseId),
  ]);

  if (
    !profile?.email ||
    profile.role !== "student" ||
    profile.is_suspended ||
    !course?.title ||
    !resume
  ) {
    return { sent: 0 as const, skipped: true as const, reason: "missing_data" as const };
  }

  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();
  const baseUrl = siteUrl();
  const resumeUrl = `${baseUrl}${await resumeLessonPath(params.studentId, params.courseId)}`;
  const firstName = studentFirstName(profile.full_name ?? "there");

  let sent = 0;
  for (const milestone of pending) {
    const tpl = progressMilestoneEmail({
      firstName,
      courseTitle: course.title,
      milestonePct: milestone,
      nextLessonTitle: resume.nextLessonTitle,
      resumeUrl,
      supportEmail: sender.replyTo ?? sender.fromAddress,
      brandColor: settings.primary_color,
    });

    const result = await sendSystemEmail({
      type: "progress_milestone",
      to: profile.email,
      subject: tpl.subject,
      html: tpl.html,
      replyTo: sender.replyTo,
      payload: {
        studentId: params.studentId,
        courseId: params.courseId,
        milestone,
        enrollmentId: enrollment.id,
      },
    });

    if (result.sent) {
      const sentAt = new Date().toISOString();
      if (milestone === 25) {
        await admin
          .from("enrollments")
          .update({ milestone_25_email_sent_at: sentAt })
          .eq("id", enrollment.id)
          .is("milestone_25_email_sent_at", null);
      } else if (milestone === 50) {
        await admin
          .from("enrollments")
          .update({ milestone_50_email_sent_at: sentAt })
          .eq("id", enrollment.id)
          .is("milestone_50_email_sent_at", null);
      } else {
        await admin
          .from("enrollments")
          .update({ milestone_75_email_sent_at: sentAt })
          .eq("id", enrollment.id)
          .is("milestone_75_email_sent_at", null);
      }
      sent++;
    }
  }

  return { sent, skipped: sent === 0 };
}

/** Daily cron: send idle reminders once per enrollment idle period. */
/** Max enrollments examined per cron tick (avoids unbounded table scans at scale). */
const IDLE_REMINDER_BATCH = 200;

export async function processIdleReminderEmails(inactivityDays = 5) {
  const admin = await createAdminClientAsync();
  const cutoff = new Date(Date.now() - inactivityDays * 86400000).toISOString();
  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();

  // Prefer students idle longest: oldest enrollments without a reminder first.
  const { data: enrollments } = await admin
    .from("enrollments")
    .select(
      "id, student_id, course_id, enrolled_at, idle_reminder_sent_at, student:profiles(full_name, email, last_active_at, role, is_suspended), course:courses(title)",
    )
    .is("completed_at", null)
    .is("idle_reminder_sent_at", null)
    .lte("enrolled_at", cutoff)
    .order("enrolled_at", { ascending: true })
    .limit(IDLE_REMINDER_BATCH);

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

/**
 * One reminder per pending checkout transaction.
 * Also skips if the same email received an abandon reminder in the last 72h.
 */
export async function sendCheckoutAbandonReminderIfNeeded(params: {
  transactionId: string;
  email: string;
  fullName?: string | null;
  courseTitle?: string | null;
  resumeUrl: string;
  studentId?: string | null;
}) {
  const email = params.email.trim().toLowerCase();
  if (!email || !params.transactionId || !params.resumeUrl) {
    return { sent: false as const, reason: "invalid_input" as const };
  }

  const admin = await createAdminClientAsync();

  try {
    const { data: existing } = await admin
      .from("checkout_abandon_reminders")
      .select("id")
      .eq("transaction_id", params.transactionId)
      .maybeSingle();
    if (existing) {
      return { sent: false as const, reason: "already_sent" as const };
    }

    const cooldownSince = new Date(Date.now() - CHECKOUT_ABANDON_EMAIL_COOLDOWN_MS).toISOString();
    const { data: recentForEmail } = await admin
      .from("checkout_abandon_reminders")
      .select("id")
      .eq("email", email)
      .gte("sent_at", cooldownSince)
      .limit(1)
      .maybeSingle();
    if (recentForEmail) {
      return { sent: false as const, reason: "email_cooldown" as const };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingRelationError(message)) {
      return { sent: false as const, reason: "table_missing" as const };
    }
    throw err;
  }

  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();
  const tpl = checkoutAbandonReminderEmail({
    firstName: studentFirstName(params.fullName ?? "there"),
    courseTitle: params.courseTitle,
    resumeUrl: params.resumeUrl,
    supportEmail: sender.replyTo ?? sender.fromAddress,
    brandColor: settings.primary_color,
  });

  const result = await sendSystemEmail({
    type: "checkout_abandon_reminder",
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    replyTo: sender.replyTo,
    payload: {
      transactionId: params.transactionId,
      studentId: params.studentId ?? null,
      resumeUrl: params.resumeUrl,
    },
  });

  if (!result.sent) {
    return { sent: false as const, reason: "send_failed" as const, error: result.error };
  }

  const { error: insertError } = await admin.from("checkout_abandon_reminders").insert({
    transaction_id: params.transactionId,
    student_id: params.studentId ?? null,
    email,
  });

  if (insertError) {
    // Unique race is fine — email already went out once for this transaction.
    if (!/duplicate|unique/i.test(insertError.message)) {
      console.error("[checkout-abandon] reminder row insert failed:", insertError.message);
    }
  }

  return { sent: true as const };
}

export { parseCourseIdFromNext };
