"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AuthState } from "@/app/(auth)/actions";

/**
 * Admin sign-in (PRD §4.2): email + password only, no OAuth.
 * Verifies the `admin` role server-side; non-admins are signed back out.
 *
 * NOTE: TOTP 2FA (PRD §4.2) is enforced via Supabase Auth MFA. Enrollment and
 * challenge flows are added in a follow-up; the role guard below is the v1 gate.
 */
export async function signInAdmin(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { error: error.message };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_suspended")
    .eq("id", data.user.id)
    .single();

  if (profile?.role !== "admin" || profile?.is_suspended) {
    await supabase.auth.signOut();
    return { error: "This account does not have admin access." };
  }

  redirect("/admin/dashboard");
}

export async function signOutAdmin() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
