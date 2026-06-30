"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { runAutomations } from "@/lib/automation";
import { issueCertificate } from "@/lib/certificates";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://digitalskillx.com").replace(
    /\/$/,
    "",
  );
}

function generatePassword() {
  return (
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).toUpperCase().slice(2, 5) +
    "!" +
    Math.floor(Math.random() * 90 + 10)
  );
}

export type StudentActionState = { error?: string; message?: string };

/** Create a single student account + send welcome email (PRD §5.1). */
export async function createStudent(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  await requireAdmin();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  let password = String(formData.get("password") ?? "");
  const autoPassword = !password;
  if (autoPassword) password = generatePassword();
  if (!fullName || !email) return { error: "Name and email are required." };

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) return { error: error.message };

  await admin.from("profiles").update({ full_name: fullName }).eq("id", created.user.id);

  await runAutomations("account_created", { studentId: created.user.id });

  const tpl = emailTemplates.welcome({
    name: fullName,
    email,
    password: autoPassword ? password : undefined,
    loginUrl: `${siteUrl()}/login`,
  });
  await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });

  await logAudit({ action: "student_created", targetType: "profile", targetId: created.user.id });
  revalidatePath("/admin/students");
  return { message: `Student ${fullName} created.` };
}

/** CSV bulk upload (PRD §5.3): first_name,last_name,email,course_id(optional). */
export async function bulkUploadStudents(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  await requireAdmin();
  const csv = String(formData.get("csv") ?? "").trim();
  if (!csv) return { error: "Paste CSV rows first." };

  const admin = createAdminClient();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  // Skip header if present.
  const start = /first_name/i.test(lines[0] ?? "") ? 1 : 0;
  let created = 0;
  const errors: string[] = [];

  for (let i = start; i < lines.length; i++) {
    const [firstName, lastName, email, courseId] = lines[i].split(",").map((s) => s.trim());
    if (!email) continue;
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || email;
    const password = generatePassword();

    const { data: c, error } = await admin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      errors.push(`${email}: ${error.message}`);
      continue;
    }
    await admin.from("profiles").update({ full_name: fullName }).eq("id", c.user.id);
    if (courseId) {
      await admin.from("enrollments").insert({
        student_id: c.user.id,
        course_id: courseId,
        source: "admin",
      });
    }
    const tpl = emailTemplates.welcome({ name: fullName, email, password, loginUrl: `${siteUrl()}/login` });
    await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
    created++;
  }

  await logAudit({ action: "students_bulk_created", metadata: { created, errors } });
  revalidatePath("/admin/students");
  return {
    message: `Created ${created} student(s).${errors.length ? ` ${errors.length} failed.` : ""}`,
  };
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
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  await admin.auth.admin.deleteUser(id);
  await logAudit({ action: "student_deleted", targetType: "profile", targetId: id });
  revalidatePath("/admin/students");
}

export async function resetStudentPassword(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const email = String(formData.get("email"));
  const newPassword = generatePassword();
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
  const admin = await requireAdmin();
  const supabase = createClient();
  const studentId = String(formData.get("student_id"));
  const courseId = String(formData.get("course_id"));
  if (!courseId) return;

  const { error } = await supabase.from("enrollments").insert({
    student_id: studentId,
    course_id: courseId,
    enrolled_by: admin.id,
    source: "admin",
  });
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);

  await runAutomations("course_enrolled", { studentId, courseId });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", studentId)
    .single();
  const { data: course } = await supabase.from("courses").select("title").eq("id", courseId).single();

  await notify({
    studentId,
    type: "enrollment",
    title: "New course",
    message: `You've been enrolled in "${course?.title ?? "a course"}".`,
    linkUrl: `/courses/${courseId}`,
  });
  if (profile?.email && course) {
    const tpl = emailTemplates.enrollment({
      name: profile.full_name ?? "there",
      courseTitle: course.title,
      url: `${siteUrl()}/courses/${courseId}`,
    });
    await sendEmail({ to: profile.email, subject: tpl.subject, html: tpl.html });
  }

  await logAudit({ action: "student_enrolled", targetType: "enrollment", metadata: { studentId, courseId } });
  revalidatePath(`/admin/students/${studentId}`);
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
