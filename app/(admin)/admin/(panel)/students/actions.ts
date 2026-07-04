"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { runAutomations } from "@/lib/automation";
import { issueCertificate } from "@/lib/certificates";
import { getPlatformSettingsAdmin } from "@/lib/platform-settings";
import { deleteStudentAccount } from "@/lib/student-data";
import {
  buildCourseResolver,
  enrollStudentInCourses,
  findProfileByEmail,
  generateStrongPassword,
  grantCourseAccessToStudent,
  isValidStudentEmail,
  parseStudentCsv,
  sendStudentWelcomeEmail,
  verifyStudentCourseAccess,
  waitForStudentProfile,
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
    enrolled: number;
    skipped: number;
    failed: BulkUploadFailure[];
  };
};

async function getAdminSupabase() {
  const session = createClient();
  return createAdminClientAsync(session);
}

async function loadEnrollableCourses(admin: Awaited<ReturnType<typeof createAdminClientAsync>>) {
  const { data, error } = await admin
    .from("courses")
    .select("id, title")
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
    const enrollableCourses = await loadEnrollableCourses(admin);
    const validCourseIds = courseIds.filter((id) => enrollableCourses.some((c) => c.id === id));

    const existing = await findProfileByEmail(admin, email);
    if (existing) {
      if (existing.is_suspended) {
        return { error: "This student account is suspended. Unsuspend them before enrolling." };
      }
      if (validCourseIds.length === 0) {
        return {
          error:
            "This email is already registered. Select one or more courses below to grant access.",
        };
      }

      const { newlyEnrolled } = await grantCourseAccessToStudent(admin, {
        studentId: existing.id,
        courseIds: validCourseIds,
        enrolledBy: adminUser.id,
        fullName: existing.full_name ?? fullName,
        email: existing.email,
      });

      await logAudit({
        action: "student_enrolled",
        targetType: "profile",
        targetId: existing.id,
        metadata: { courseIds: newlyEnrolled, existingStudent: true },
      });
      revalidatePath("/admin/students");
      revalidatePath(`/admin/students/${existing.id}`);
      revalidatePath("/admin/analytics");

      const displayName = existing.full_name ?? email;
      if (newlyEnrolled.length === 0) {
        return {
          message: `${displayName} is already enrolled in the selected course(s).`,
        };
      }
      return {
        message: `Granted ${displayName} access to ${newlyEnrolled.length} course(s). Enrollment email sent.`,
      };
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
        const authExisting = await findProfileByEmail(admin, email);
        if (authExisting && validCourseIds.length > 0) {
          const { newlyEnrolled } = await grantCourseAccessToStudent(admin, {
            studentId: authExisting.id,
            courseIds: validCourseIds,
            enrolledBy: adminUser.id,
            fullName: authExisting.full_name ?? fullName,
            email: authExisting.email,
          });
          revalidatePath("/admin/students");
          revalidatePath(`/admin/students/${authExisting.id}`);
          const displayName = authExisting.full_name ?? email;
          if (newlyEnrolled.length === 0) {
            return { message: `${displayName} is already enrolled in the selected course(s).` };
          }
          return {
            message: `Granted ${displayName} access to ${newlyEnrolled.length} course(s). Enrollment email sent.`,
          };
        }
        return {
          error:
            "This email is already registered. Select one or more courses below to grant access.",
        };
      }
      return { error: error.message };
    }

    await admin.from("profiles").update({ full_name: fullName }).eq("id", created.user.id);
    await waitForStudentProfile(admin, created.user.id);
    await runAutomations("account_created", { studentId: created.user.id });

    let enrolledCount = 0;
    if (validCourseIds.length > 0) {
      const { newlyEnrolled } = await grantCourseAccessToStudent(admin, {
        studentId: created.user.id,
        courseIds: validCourseIds,
        enrolledBy: adminUser.id,
        fullName,
        email,
        sendEnrollmentEmail: false,
      });
      enrolledCount = newlyEnrolled.length;

      const { enrolledCourseIds } = await verifyStudentCourseAccess(
        admin,
        created.user.id,
        validCourseIds,
      );
      if (enrolledCourseIds.length === 0) {
        return {
          error:
            "Account was created but course access could not be saved. Open the student profile and enroll them again.",
        };
      }
      enrolledCount = enrolledCourseIds.length;
    }

    const settings = await getPlatformSettingsAdmin();
    const emailResult = await sendStudentWelcomeEmail({
      studentId: created.user.id,
      fullName,
      email,
      password,
      courseNames: courseNamesForIds(enrollableCourses, validCourseIds),
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
    revalidatePath(`/admin/students/${created.user.id}`);
    revalidatePath("/admin/analytics");

    const courseNote =
      enrolledCount > 0 ? ` Enrolled in ${enrolledCount} course(s).` : "";
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
    const enrollableCourses = await loadEnrollableCourses(admin);
    const resolveCourse = buildCourseResolver(enrollableCourses);
    const settings = await getPlatformSettingsAdmin();
    const { rows } = parseStudentCsv(csvText);

    if (rows.length === 0) return { error: "No data rows found in the CSV." };

    let created = 0;
    let enrolled = 0;
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

      const existing = await findProfileByEmail(admin, email);
      if (existing) {
        const resolved = resolveCourse(courseRefRaw, defaultCourseId);
        if (resolved.error) {
          failed.push({ row: rowNumber, email, reason: resolved.error });
          continue;
        }
        if (!resolved.courseId) {
          skipped++;
          continue;
        }
        if (existing.is_suspended) {
          failed.push({ row: rowNumber, email, reason: "Student account is suspended" });
          continue;
        }

        const { newlyEnrolled } = await grantCourseAccessToStudent(admin, {
          studentId: existing.id,
          courseIds: [resolved.courseId],
          enrolledBy: adminUser.id,
          fullName: existing.full_name ?? fullName,
          email: existing.email,
        });
        if (newlyEnrolled.length > 0) enrolled++;
        else skipped++;
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
        await waitForStudentProfile(admin, createdUser.user.id);
        await runAutomations("account_created", { studentId: createdUser.user.id });
        const { newlyEnrolled } = await grantCourseAccessToStudent(admin, {
          studentId: createdUser.user.id,
          courseIds: [resolved.courseId],
          enrolledBy: adminUser.id,
          fullName,
          email,
          sendEnrollmentEmail: false,
        });
        const { enrolledCourseIds } = await verifyStudentCourseAccess(admin, createdUser.user.id, [
          resolved.courseId,
        ]);
        if (enrolledCourseIds.length === 0) {
          throw new Error("Course enrollment did not save");
        }
        void newlyEnrolled;
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
      metadata: { created, enrolled, skipped, failedCount: failed.length },
    });
    revalidatePath("/admin/students");
    revalidatePath("/admin/analytics");

    return {
      message: `Bulk upload finished: ${created} created, ${enrolled} existing student(s) enrolled, ${skipped} skipped, ${failed.length} failed.`,
      bulkSummary: { created, enrolled, skipped, failed },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Bulk upload failed." };
  }
}

export async function suspendStudent(formData: FormData) {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const id = String(formData.get("id"));
  const suspend = formData.get("suspend") === "true";
  const { error } = await admin.from("profiles").update({ is_suspended: suspend }).eq("id", id);
  if (error) throw new Error(error.message);
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

export async function updateStudentProfile(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  try {
    await requireAdmin();
    const admin = await getAdminSupabase();
    const id = String(formData.get("id") ?? "").trim();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    if (!id) return { error: "Student not found." };
    if (!fullName || !email) return { error: "Name and email are required." };
    if (!isValidStudentEmail(email)) return { error: "Enter a valid email address." };

    const { data: current } = await admin
      .from("profiles")
      .select("id, email, role")
      .eq("id", id)
      .eq("role", "student")
      .maybeSingle();
    if (!current) return { error: "Student not found." };

    const existing = await findProfileByEmail(admin, email);
    if (existing && existing.id !== id) {
      return { error: "That email is already used by another account." };
    }

    if (email !== current.email.toLowerCase()) {
      const { error: authError } = await admin.auth.admin.updateUserById(id, {
        email,
        user_metadata: { full_name: fullName },
      });
      if (authError) return { error: authError.message };
    } else {
      const { error: metaError } = await admin.auth.admin.updateUserById(id, {
        user_metadata: { full_name: fullName },
      });
      if (metaError) return { error: metaError.message };
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ full_name: fullName, email })
      .eq("id", id);
    if (profileError) return { error: profileError.message };

    await logAudit({
      action: "student_profile_updated",
      targetType: "profile",
      targetId: id,
      metadata: { emailChanged: email !== current.email.toLowerCase() },
    });
    revalidatePath(`/admin/students/${id}`);
    revalidatePath("/admin/students");
    return { message: "Student profile updated." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update profile." };
  }
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

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", studentId)
    .single();
  if (!profile?.email) throw new Error("Student profile not found.");

  const { newlyEnrolled } = await grantCourseAccessToStudent(admin, {
    studentId,
    courseIds: [courseId],
    enrolledBy: adminUser.id,
    fullName: profile.full_name ?? "there",
    email: profile.email,
  });

  if (newlyEnrolled.length === 0) {
    redirect(`/admin/students/${studentId}?already_enrolled=1`);
  }

  await logAudit({ action: "student_enrolled", targetType: "enrollment", metadata: { studentId, courseId } });
  revalidatePath(`/admin/students/${studentId}`);
  redirect(`/admin/students/${studentId}?enrolled=1`);
}

export async function unenrollStudent(formData: FormData) {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const studentId = String(formData.get("student_id"));
  const courseId = String(formData.get("course_id"));
  const { error } = await admin
    .from("enrollments")
    .delete()
    .eq("student_id", studentId)
    .eq("course_id", courseId);
  if (error) throw new Error(error.message);
  await logAudit({ action: "student_unenrolled", metadata: { studentId, courseId } });
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/admin/students");
}

export async function setStudentTags(formData: FormData) {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const id = String(formData.get("id"));
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const { error } = await admin.from("profiles").update({ tags }).eq("id", id);
  if (error) throw new Error(error.message);
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
  const adminUser = await requireAdmin();
  const admin = await getAdminSupabase();
  const studentId = String(formData.get("student_id"));
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  const { error } = await admin.from("admin_notes").insert({
    admin_id: adminUser.id,
    student_id: studentId,
    content,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/students/${studentId}`);
}
