"use server";

import { redirect } from "next/navigation";
import { runStudentLogin } from "@/lib/auth/run-student-login";
import { createClient } from "@/lib/supabase/server";

/** Native form POST — no client JS. Redirects on success or back to login with error. */
export async function submitStudentPasswordLogin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/dashboard");
  const next = nextRaw.startsWith("/") ? nextRaw : "/dashboard";

  const result = await runStudentLogin({ email, password });
  if (!result.ok) {
    redirect(`/login?auth_error=${encodeURIComponent(result.error)}`);
  }
  const supabase = createClient();
  const { error } = await supabase.auth.setSession(result.session);
  if (error) {
    redirect(`/login?auth_error=${encodeURIComponent("We couldn't start your session. Please try again.")}`);
  }
  redirect(next);
}
