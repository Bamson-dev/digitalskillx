"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";

export type SupportState = { error?: string; message?: string };

export async function submitSupportRequest(
  _prev: SupportState,
  formData: FormData,
): Promise<SupportState> {
  const profile = await requireStudent();
  const message = String(formData.get("message") ?? "").trim();
  if (message.length < 10) {
    return { error: "Please enter at least 10 characters describing your issue." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("support_requests").insert({
    student_id: profile.id,
    email: profile.email,
    message,
    status: "open",
  });
  if (error) return { error: error.message };

  redirect("/support?sent=1");
}
