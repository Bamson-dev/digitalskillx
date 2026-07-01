import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function exportStudentData(studentId: string) {
  const admin = createAdminClient();

  const [
    { data: profile },
    { data: enrollments },
    { data: progress },
    { data: certificates },
    { data: transactions },
    { data: support },
  ] = await Promise.all([
    admin.from("profiles").select("*").eq("id", studentId).single(),
    admin.from("enrollments").select("*, course:courses(id, title)").eq("student_id", studentId),
    admin.from("lesson_progress").select("*").eq("student_id", studentId),
    admin.from("certificates").select("*").eq("student_id", studentId),
    admin
      .from("transactions")
      .select("id, course_id, amount, currency, status, reference, created_at, anonymized")
      .eq("student_id", studentId),
    admin.from("support_requests").select("*").eq("student_id", studentId),
  ]);

  return {
    exported_at: new Date().toISOString(),
    profile,
    enrollments,
    lesson_progress: progress,
    certificates,
    transactions,
    support_requests: support,
  };
}

/** Delete personal data; retain anonymized transaction rows for accounting. */
export async function deleteStudentAccount(studentId: string) {
  const admin = createAdminClient();

  await admin
    .from("transactions")
    .update({ student_id: null, anonymized: true })
    .eq("student_id", studentId);

  await admin.from("lesson_progress").delete().eq("student_id", studentId);
  await admin.from("student_notes").delete().eq("student_id", studentId);
  await admin.from("bookmarks").delete().eq("student_id", studentId);
  await admin.from("notifications").delete().eq("student_id", studentId);
  await admin.from("quiz_attempts").delete().eq("student_id", studentId);
  await admin.from("assignment_submissions").delete().eq("student_id", studentId);
  await admin.from("enrollments").delete().eq("student_id", studentId);
  await admin.from("certificates").delete().eq("student_id", studentId);
  await admin.from("ai_conversations").delete().eq("student_id", studentId);

  await admin.from("support_requests").update({ student_id: null }).eq("student_id", studentId);

  const { error: authError } = await admin.auth.admin.deleteUser(studentId);
  if (authError) throw new Error(authError.message);
}

export async function requireStudentApi() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile || profile.is_suspended) return null;
  return profile;
}
