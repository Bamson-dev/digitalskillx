"use server";

import { redirect } from "next/navigation";
import { runAdminLogin } from "@/lib/auth/run-admin-login";

/** Native form POST — no client JS. Redirects on success or back to login with error. */
export async function submitAdminPasswordLogin(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const result = await runAdminLogin({ email, password });
  if (!result.ok) {
    redirect(`/admin/login?auth_error=${encodeURIComponent(result.error)}`);
  }
  redirect(result.redirectTo);
}
