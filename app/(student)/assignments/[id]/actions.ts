"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function submitAssignment(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const assignmentId = String(formData.get("assignment_id"));
  await supabase.from("assignment_submissions").insert({
    assignment_id: assignmentId,
    student_id: user.id,
    content: String(formData.get("content") ?? "") || null,
    link_url: String(formData.get("link_url") ?? "") || null,
    file_url: String(formData.get("file_url") ?? "") || null,
    status: "pending",
  });
  revalidatePath(`/assignments/${assignmentId}`);
}
