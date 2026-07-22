"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { sendMagicLinkEmail, sendPasswordResetEmail } from "@/lib/auth-email";
import { serviceRoleKeyMissingMessage, serviceRoleKeyMissingMessageAsync } from "@/lib/env-service-role";
import { formatErrorMessage } from "@/lib/format-error-message";
import { verifyAccessToken } from "@/lib/verify-access-token";
import { runStudentLogin } from "@/lib/auth/run-student-login";
import { runStudentSignUp } from "@/lib/auth/run-student-signup";
import { safeNextPath } from "@/lib/safe-next-path";

export type AuthState = { error?: string; message?: string; redirectTo?: string };

/** Server-side student login — sets session cookies and ensures profile exists. */
export async function completeStudentLogin(input: {
  email: string;
  password: string;
  next: string;
}): Promise<AuthState> {
  const next = safeNextPath(input.next);
  const result = await runStudentLogin({ email: input.email, password: input.password });
  if (!result.ok) return { error: result.error };
  redirect(next);
}

/** @deprecated Use completeStudentLogin — kept for form actions. */
export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  return completeStudentLogin({ email, password, next });
}

/** Self-registration for students — creates account via service role and sends DigitalSkillX welcome email (no Supabase-branded confirm email). */
export async function signUpWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const result = await runStudentSignUp({
    fullName: String(formData.get("full_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  return { message: result.message };
}

/** Passwordless magic-link login — link sent via ZeptoMail (not Supabase Auth). */
export async function signInWithMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  try {
    const result = await sendMagicLinkEmail(email);
    if (!result.sent && !result.skipped) {
      const message = formatErrorMessage(result.error, "Could not send sign-in link.");
      if (message.includes("service role")) {
        return { error: await serviceRoleKeyMissingMessageAsync() };
      }
      return { error: message };
    }
    return { message: "If that email is registered, a sign-in link is on its way." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send sign-in link.";
    if (message.includes("service role")) {
      return { error: await serviceRoleKeyMissingMessageAsync() };
    }
    return { error: message };
  }
}

/** Forgot password — reset link sent via ZeptoMail (not Supabase Auth). */
export async function sendPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  try {
    const result = await sendPasswordResetEmail(email);
    if (!result.sent && !result.skipped) {
      const message = formatErrorMessage(result.error, "Could not send reset link.");
      if (message.includes("service role")) {
        return { error: await serviceRoleKeyMissingMessageAsync() };
      }
      return { error: message };
    }
    return { message: "If that email exists, a reset link is on its way." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send reset link.";
    if (message.includes("service role")) {
      return { error: await serviceRoleKeyMissingMessageAsync() };
    }
    return { error: message };
  }
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    try {
      const admin = await createAdminClientAsync();
      const email = user.email.trim().toLowerCase();
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (!existing) {
        await admin.from("profiles").insert({
          id: user.id,
          email,
          full_name:
            (user.user_metadata?.full_name as string | undefined) ??
            email.split("@")[0],
          role: "student",
          is_suspended: false,
        });
      } else {
        await admin
          .from("profiles")
          .update({
            email,
            full_name:
              (user.user_metadata?.full_name as string | undefined) ??
              email.split("@")[0],
          })
          .eq("id", user.id);
      }
    } catch {
      // profile upsert is best-effort; dashboard guard will retry
    }
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Legacy shim — always returns an object (never undefined) for stale cached clients. */
export async function healStudentProfileByLogin(
  email: string,
  userId: string,
  accessToken: string,
  fullName?: string,
): Promise<{ healed: boolean; error?: string }> {
  try {
    const normalized = email.trim().toLowerCase();
    const user = await verifyAccessToken(accessToken);
    if (!user || user.id !== userId || user.email?.trim().toLowerCase() !== normalized) {
      return { healed: false, error: "Session verification failed. Refresh and try again." };
    }

    const admin = await createAdminClientAsync();
    const { data: existing } = await admin
      .from("profiles")
      .select("id, is_suspended")
      .eq("id", userId)
      .maybeSingle();
    if (existing?.is_suspended) {
      return { healed: false, error: "This account has been suspended." };
    }
    if (!existing) {
      const { error } = await admin.from("profiles").insert({
        id: userId,
        email: normalized,
        full_name:
          fullName ??
          (user.user_metadata?.full_name as string | undefined) ??
          normalized.split("@")[0],
        role: "student",
        is_suspended: false,
      });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .from("profiles")
        .update({
          email: normalized,
          full_name:
            fullName ??
            (user.user_metadata?.full_name as string | undefined) ??
            normalized.split("@")[0],
        })
        .eq("id", userId);
      if (error) throw new Error(error.message);
    }
    return { healed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create profile.";
    return { healed: false, error: message };
  }
}
