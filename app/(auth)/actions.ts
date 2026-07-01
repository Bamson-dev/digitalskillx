"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

function siteOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/** Email + password sign-in (PRD §4.1). */
export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(next);
}

/** Self-registration for students (PRD §4.1). */
export async function signUpWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password || !fullName)
    return { error: "Name, email and password are required." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${siteOrigin()}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  return {
    message:
      "Account created. Check your inbox to confirm your email, then log in.",
  };
}

/** Passwordless magic-link login (PRD §4.1). */
export async function signInWithMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteOrigin()}/auth/callback` },
  });
  if (error) return { error: error.message };
  return { message: "Magic link sent. Check your email to sign in." };
}

/** Forgot password — sends reset email (PRD §4.1). */
export async function sendPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error) return { error: error.message };
  return { message: "If that email exists, a reset link is on its way." };
}

/** Set a new password after following the reset link. */
export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
