"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { runAutomations } from "@/lib/automation";
import { issueCertificate } from "@/lib/certificates";
import { getPlatformSettingsAdmin } from "@/lib/platform-settings";
import { deleteStudentAccount } from "@/lib/student-data";
import { sendCourseEnrollmentEmail } from "@/lib/system-email-triggers";
import {
  buildCourseResolver,
  enrollStudentInCourses,
  generateStrongPassword,
  isValidStudentEmail,
  parseStudentCsv,
  profileEmailExists,
  sendStudentWelcomeEmail,
  type CourseLookup,
} from "@/lib/admin-student-onboarding";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://digitalskillx.com").replace(
    /\/$/,
    "",
  );
}

export type BulkUploadFailure = {
  row: number;
  email: string;
  reason: string;
};

export type StudentActionState = {
  error?: string;
  message?: string;
  bulkSummary?: {
    created: number;
    skipped: number;
    failed: BulkUploadFailure[];
  };
};

async function getAdminSupabase() {
  const session = createClient();
  return createAdminClientAsync(session);
}

async function loadPublishedCourses(admin: Awaited<ReturnType<typeof createAdminClientAsync>>) {
  const { data, error } = await admin
    .from("courses")
    .select("id, title")
    .eq("visibility", "published")
    .order("title");
  if (error) throw new Error(error.message);
  return (data ?? []) as CourseLookup[];
}

function courseNamesForIds(courses: CourseLookup[], courseIds: string[]) {
  const byId = new Map(courses.map((c) => [c.id, c.title]));
  return courseIds.map((id) => byId.get(id)).filter((t): t is string => Boolean(t));
}

/** Create a single student account, enroll in selected courses, and send welcome email. */
export async function createStudent(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  try {
    const adminUser = await requireAdmin();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const passwordInput = String(formData.get("password") ?? "").trim();
    const courseIds = formData
      .getAll("course_ids")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (!fullName || !email) return { error: "Name and email are required." };
    if (!isValidStudentEmail(email)) return { error: "Enter a valid email address." };

    const admin = await getAdminSupabase();
    const publishedCourses = await loadPublishedCourses(admin);
    const validCourseIds = courseIds.filter((id) => publishedCourses.some((c) => c.id === id));

    if (await profileEmailExists(admin, email)) {
      return { error: "A student with this email already exists." };
    }

    const password = passwordInput || generateStrongPassword();

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        return { error: "A student with this email already exists." };
      }
      return { error: error.message };
    }

    await admin.from("profiles").update({ full_name: fullName }).eq("id", created.user.id);
    await runAutomations("account_created", { studentId: created.user.id });

    if (validCourseIds.length > 0) {
      await enrollStudentInCourses(admin, {
        studentId: created.user.id,
        courseIds: validCourseIds,
        enrolledBy: adminUser.id,
      });
    }

    const settings = await getPlatformSettingsAdmin();
    const emailResult = await sendStudentWelcomeEmail({
      studentId: created.user.id,
      fullName,
      email,
      password,
      courseNames: courseNamesForIds(publishedCourses, validCourseIds),
      siteUrl: siteUrl(),
      brandColor: settings.primary_color,
    });

    await logAudit({
      action: "student_created",
      targetType: "profile",
      targetId: created.user.id,
      metadata: { courseIds: validCourseIds },
    });
    revalidatePath("/admin/students");
    revalidatePath("/admin/analytics");

    const courseNote =
      validCourseIds.length > 0
        ? ` Enrolled in ${validCourseIds.length} course(s).`
        : "";
    if (!emailResult.sent) {
      const reason =
        "error" in emailResult
          ? emailResult.error
          : "reason" in emailResult
            ? emailResult.reason
            : "Email not configured";
      return {
        message: `Student ${fullName} created.${courseNote} Welcome email failed: ${reason}. Save ZeptoMail SMTP password under Admin → Settings → Integrations.`,
      };
    }
    return { message: `Student ${fullName} created.${courseNote} Welcome email sent.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create student." };
  }
}

/** CSV bulk upload: full_name, email, optional course (name or id). */
export async function bulkUploadStudents(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  try {
    const adminUser = await requireAdmin();
    const defaultCourseId = String(formData.get("default_course_id") ?? "").trim() || null;
    const file = formData.get("csv_file");
    const pasted = String(formData.get("csv") ?? "").trim();

    let csvText = pasted;
    if (file instanceof File && file.size > 0) {
      csvText = await file.text();
    }
    if (!csvText.trim()) return { error: "Upload a CSV file or paste CSV rows." };

    const admin = await getAdminSupabase();
    const publishedCourses = await loadPublishedCourses(admin);
    const resolveCourse = buildCourseResolver(publishedCourses);
    const settings = await getPlatformSettingsAdmin();
    const { rows } = parseStudentCsv(csvText);

    if (rows.length === 0) return { error: "No data rows found in the CSV." };

    let created = 0;
    let skipped = 0;
    const failed: BulkUploadFailure[] = [];

    for (const row of rows) {
      const rowNumber = row.rowNumber;
      const [fullNameRaw, emailRaw, courseRefRaw] = row.cells;
      const fullName = fullNameRaw?.trim() ?? "";
      const email = emailRaw?.trim().toLowerCase() ?? "";

      if (!fullName && !email) continue;
      if (!fullName || !email) {
        failed.push({
          row: rowNumber,
          email: email || "(missing)",
          reason: "full_name and email are required",
        });
        continue;
      }
      if (!isValidStudentEmail(email)) {
        failed.push({ row: rowNumber, email, reason: "Invalid email format" });
        continue;
      }

      if (await profileEmailExists(admin, email)) {
        skipped++;
        continue;
      }

      const resolved = resolveCourse(courseRefRaw, defaultCourseId);
      if (resolved.error) {
        failed.push({ row: rowNumber, email, reason: resolved.error });
        continue;
      }
      if (!resolved.courseId) {
        failed.push({
          row: rowNumber,
          email,
          reason: "No course on row and no default course selected for this upload",
        });
        continue;
      }

      const password = generateStrongPassword();

      const { data: createdUser, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (error) {
        if (error.message.toLowerCase().includes("already")) {
          skipped++;
          continue;
        }
        failed.push({ row: rowNumber, email, reason: error.message });
        continue;
      }

      try {
        await admin
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", createdUser.user.id);
        await runAutomations("account_created", { studentId: createdUser.user.id });
        await enrollStudentInCourses(admin, {
          studentId: createdUser.user.id,
          courseIds: [resolved.courseId],
          enrolledBy: adminUser.id,
        });
        await sendStudentWelcomeEmail({
          studentId: createdUser.user.id,
          fullName,
          email,
          password,
          courseNames: resolved.courseTitle ? [resolved.courseTitle] : [],
          siteUrl: siteUrl(),
          brandColor: settings.primary_color,
        });
        created++;
      } catch (rowError) {
        failed.push({
          row: rowNumber,
          email,
          reason: rowError instanceof Error ? rowError.message : "Enrollment or email failed",
        });
      }
    }

    await logAudit({
      action: "students_bulk_created",
      metadata: { created, skipped, failedCount: failed.length },
    });
    revalidatePath("/admin/students");
    revalidatePath("/admin/analytics");

    return {
      message: `Bulk upload finished: ${created} created, ${skipped} duplicate(s) skipped, ${failed.length} failed.`,
      bulkSummary: { created, skipped, failed },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Bulk upload failed." };
  }
}

export async function suspendStudent(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const suspend = formData.get("suspend") === "true";
  await supabase.from("profiles").update({ is_suspended: suspend }).eq("id", id);
  await logAudit({
    action: suspend ? "student_suspended" : "student_unsuspended",
    targetType: "profile",
    targetId: id,
  });
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
}

export async function deleteStudent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  await deleteStudentAccount(id);
  await logAudit({ action: "student_deleted", targetType: "profile", targetId: id });
  revalidatePath("/admin/students");
  redirect("/admin/students");
}

export async function resetStudentPassword(formData: FormData) {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const id = String(formData.get("id"));
  const email = String(formData.get("email"));
  const newPassword = generateStrongPassword();
  await admin.auth.admin.updateUserById(id, { password: newPassword });
  const tpl = emailTemplates.welcome({
    name: String(formData.get("full_name") ?? "there"),
    email,
    password: newPassword,
    loginUrl: `${siteUrl()}/login`,
  });
  await sendEmail({ to: email, subject: "Your password was reset", html: tpl.html });
  await logAudit({ action: "student_password_reset", targetType: "profile", targetId: id });
  revalidatePath(`/admin/students/${id}`);
}

export async function enrollStudent(formData: FormData) {
  const adminUser = await requireAdmin();
  const admin = await getAdminSupabase();
  const studentId = String(formData.get("student_id"));
  const courseId = String(formData.get("course_id"));
  if (!courseId) return;

  await enrollStudentInCourses(admin, {
    studentId,
    courseIds: [courseId],
    enrolledBy: adminUser.id,
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", studentId)
    .single();
  const { data: course } = await admin.from("courses").select("title").eq("id", courseId).single();

  await notify({
    studentId,
    type: "enrollment",
    title: "New course",
    message: `You've been enrolled in "${course?.title ?? "a course"}".`,
    linkUrl: `/courses/${courseId}`,
  });

  if (profile?.email && course) {
    const emailResult = await sendCourseEnrollmentEmail({
      studentId,
      courseId,
      fullName: profile.full_name ?? "there",
      email: profile.email,
    });
    if (!emailResult.sent) {
      const reason =
        "error" in emailResult
          ? emailResult.error
          : "reason" in emailResult
            ? emailResult.reason
            : "Email not configured";
      throw new Error(
        `Student enrolled in "${course.title}" but email failed: ${reason}. Save ZeptoMail SMTP password under Admin → Settings → Integrations.`,
      );
    }
  }

  await logAudit({ action: "student_enrolled", targetType: "enrollment", metadata: { studentId, courseId } });
  revalidatePath(`/admin/students/${studentId}`);
  redirect(`/admin/students/${studentId}?enrolled=1`);
}

export async function unenrollStudent(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const studentId = String(formData.get("student_id"));
  const courseId = String(formData.get("course_id"));
  await supabase.from("enrollments").delete().eq("student_id", studentId).eq("course_id", courseId);
  await logAudit({ action: "student_unenrolled", metadata: { studentId, courseId } });
  revalidatePath(`/admin/students/${studentId}`);
}

export async function setStudentTags(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  await supabase.from("profiles").update({ tags }).eq("id", id);
  revalidatePath(`/admin/students/${id}`);
}

export async function issueCertificateManual(formData: FormData) {
  await requireAdmin();
  const studentId = String(formData.get("student_id"));
  const courseId = String(formData.get("course_id"));
  if (!courseId) return;
  await issueCertificate({ studentId, courseId });
  await logAudit({ action: "certificate_issued_manual", metadata: { studentId, courseId } });
  revalidatePath(`/admin/students/${studentId}`);
}

export async function addAdminNote(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = createClient();
  const studentId = String(formData.get("student_id"));
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  await supabase.from("admin_notes").insert({ admin_id: admin.id, student_id: studentId, content });
  revalidatePath(`/admin/students/${studentId}`);
}
