"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import type { SubmissionStatus } from "@/types/database";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://digitalskillx.com").replace(/\/$/, "");
}

export async function createAssignment(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const types = formData.getAll("submission_types").map(String);
  await supabase.from("assignments").insert({
    module_id: String(formData.get("module_id")),
    title: String(formData.get("title") ?? "Assignment"),
    instructions: String(formData.get("instructions") ?? "") || null,
    due_date: formData.get("due_date") ? new Date(String(formData.get("due_date"))).toISOString() : null,
    submission_types_allowed: types.length ? types : ["file", "text"],
  });
  revalidatePath("/admin/assignments");
}

export async function deleteAssignment(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  await supabase.from("assignments").delete().eq("id", String(formData.get("id")));
  revalidatePath("/admin/assignments");
}

export async function gradeSubmission(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = createAdminClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status") ?? "graded") as SubmissionStatus;

  const { data: sub } = await supabase
    .from("assignment_submissions")
    .update({
      grade: formData.get("grade") ? Number(formData.get("grade")) : null,
      feedback: String(formData.get("feedback") ?? "") || null,
      status,
      graded_by: admin.id,
      graded_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("student_id, assignment:assignments(title)")
    .single();

  if (sub) {
    const assignment = Array.isArray(sub.assignment) ? sub.assignment[0] : sub.assignment;
    await notify({
      studentId: sub.student_id,
      type: "assignment_feedback",
      title: status === "revision_requested" ? "Revision requested" : "Assignment graded",
      message:
        status === "revision_requested"
          ? `Please revise your submission for "${assignment?.title ?? "an assignment"}".`
          : `Your submission for "${assignment?.title ?? "an assignment"}" was graded.`,
      linkUrl: "/dashboard",
    });

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", sub.student_id)
      .single();
    if (profile?.email) {
      const tpl = emailTemplates.assignmentFeedback({
        name: profile.full_name ?? "there",
        assignmentTitle: assignment?.title ?? "your assignment",
        url: `${siteUrl()}/dashboard`,
      });
      await sendEmail({ to: profile.email, subject: tpl.subject, html: tpl.html });
    }
  }
  revalidatePath("/admin/grading");
}
