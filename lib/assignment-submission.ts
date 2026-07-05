import "server-only";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { syncStudentCourseAccess } from "@/lib/admin-student-onboarding";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SubmitAssignmentInput = {
  studentId: string;
  studentEmail: string | null;
  assignmentId: string;
  content: string | null;
  linkUrl: string | null;
  fileUrl: string | null;
};

export async function submitStudentAssignment(input: SubmitAssignmentInput) {
  const assignmentId = input.assignmentId.trim();
  if (!assignmentId) {
    return { error: "Assignment id is required." as const };
  }

  const hasPayload =
    Boolean(input.content?.trim()) ||
    Boolean(input.linkUrl?.trim()) ||
    Boolean(input.fileUrl?.trim());
  if (!hasPayload) {
    return { error: "Add a written response, link, or file URL before submitting." as const };
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync(createClient());

  const targetStudentId = await syncStudentCourseAccess(admin, {
    authUserId: input.studentId,
    profileEmail: input.studentEmail,
  });

  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id, status, course_id")
    .eq("id", assignmentId)
    .single();

  if (assignmentError || !assignment) {
    return { error: "Assignment not found." as const };
  }
  if (assignment.status !== "published") {
    return { error: "This assignment is not available yet." as const };
  }

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", targetStudentId)
    .eq("course_id", assignment.course_id)
    .maybeSingle();

  if (!enrollment) {
    return { error: "You must be enrolled in this course to submit." as const };
  }

  const { data: existing } = await admin
    .from("assignment_submissions")
    .select("id, status")
    .eq("assignment_id", assignmentId)
    .eq("student_id", targetStudentId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && existing.status !== "revision_requested") {
    return { error: "You have already submitted this assignment." as const };
  }

  const { error: insertError } = await admin.from("assignment_submissions").insert({
    assignment_id: assignmentId,
    student_id: targetStudentId,
    content: input.content?.trim() || null,
    link_url: input.linkUrl?.trim() || null,
    file_url: input.fileUrl?.trim() || null,
    status: "pending",
  });

  if (insertError) {
    return { error: insertError.message } as const;
  }

  return { ok: true as const, studentId: targetStudentId };
}

export async function loadStudentSubmissions(params: {
  studentId: string;
  studentEmail: string | null;
  assignmentId: string;
}) {
  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync(createClient());

  const targetStudentId = await syncStudentCourseAccess(admin, {
    authUserId: params.studentId,
    profileEmail: params.studentEmail,
  });

  const { data, error } = await admin
    .from("assignment_submissions")
    .select("id, content, link_url, file_url, status, grade, feedback, submitted_at")
    .eq("assignment_id", params.assignmentId)
    .eq("student_id", targetStudentId)
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
