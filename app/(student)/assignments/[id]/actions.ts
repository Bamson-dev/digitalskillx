"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { submitStudentAssignment } from "@/lib/assignment-submission";

export type AssignmentSubmitState = {
  error?: string;
};

export async function submitAssignment(
  _prev: AssignmentSubmitState,
  formData: FormData,
): Promise<AssignmentSubmitState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again to submit." };

  const result = await submitStudentAssignment({
    studentId: user.id,
    studentEmail: user.email ?? null,
    assignmentId: String(formData.get("assignment_id") ?? ""),
    content: String(formData.get("content") ?? "") || null,
    linkUrl: String(formData.get("link_url") ?? "") || null,
    fileUrl: String(formData.get("file_url") ?? "") || null,
  });

  if ("error" in result) {
    return { error: result.error };
  }

  revalidatePath(`/assignments/${String(formData.get("assignment_id"))}`);
  redirect(`/assignments/${String(formData.get("assignment_id"))}?submitted=1`);
}
