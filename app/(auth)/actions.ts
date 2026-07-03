"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { sendWelcomeEmailIfNeeded } from "@/lib/system-email-triggers";
import { sendMagicLinkEmail, sendPasswordResetEmail } from "@/lib/auth-email";
import { serviceRoleKeyMissingMessage, serviceRoleKeyMissingMessageAsync } from "@/lib/env-service-role";
import { formatErrorMessage } from "@/lib/format-error-message";
import { verifyAccessToken } from "@/lib/verify-access-token";

export type AuthState = { error?: string; message?: string; redirectTo?: string };

/** Server-side student login — sets session cookies and ensures profile exists. */
export async function completeStudentLogin(input: {
  email: string;
  password: string;
  next: string;
}): Promise<AuthState> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const next = input.next.startsWith("/") ? input.next : "/dashboard";
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  try {
    const admin = await createAdminClientAsync();
    const fullName =
      (data.user.user_metadata?.full_name as string | undefined) ??
      (data.user.user_metadata?.name as string | undefined) ??
      email.split("@")[0];

    const { error: upsertError } = await admin.from("profiles").upsert(
      {
        id: data.user.id,
        email,
        full_name: fullName,
        role: "student",
        is_suspended: false,
      },
      { onConflict: "id" },
    );
    if (upsertError) throw new Error(upsertError.message);
  } catch (err) {
    await supabase.auth.signOut();
    const message = err instanceof Error ? err.message : "Could not load your profile.";
    return { error: message };
  }

  return { redirectTo: next };
}

/** Self-registration for students — creates account via service role and sends DigitalSkillX welcome email (no Supabase-branded confirm email). */
export async function signUpWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password || !fullName)
    return { error: "Name, email and password are required." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  try {
    const admin = await createAdminClientAsync();

    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existing) {
      return { error: "An account with this email already exists. Try logging in." };
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        return { error: "An account with this email already exists. Try logging in." };
      }
      return { error: error.message };
    }

    await admin.from("profiles").update({ full_name: fullName }).eq("id", created.user.id);

    const welcome = await sendWelcomeEmailIfNeeded({
      studentId: created.user.id,
      fullName,
      email,
      password,
    });

    if (!welcome.sent) {
      return {
        message:
          "Account created — you can log in now. Welcome email could not be sent yet; ask support if you need help.",
      };
    }

    return {
      message:
        "Account created! Check your inbox for a welcome email from DigitalSkillX, then log in.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create account.";
    if (message.includes("service role")) {
      return { error: await serviceRoleKeyMissingMessageAsync() };
    }
    return { error: message };
  }
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
      await admin.from("profiles").upsert(
        {
          id: user.id,
          email,
          full_name:
            (user.user_metadata?.full_name as string | undefined) ??
            email.split("@")[0],
          role: "student",
          is_suspended: false,
        },
        { onConflict: "id" },
      );
    } catch {
      // profile upsert is best-effort; dashboard guard will retry
    }
  }

  return { redirectTo: "/dashboard" };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** @deprecated Legacy shim — cached clients may still call this after browser sign-in. */
export async function healStudentProfileByLogin(
  email: string,
  userId: string,
  accessToken: string,
  fullName?: string,
): Promise<{ healed: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase();
  const user = await verifyAccessToken(accessToken);
  if (!user || user.id !== userId || user.email?.trim().toLowerCase() !== normalized) {
    return { healed: false, error: "Session verification failed. Refresh and try again." };
  }

  try {
    const admin = await createAdminClientAsync();
    const { error } = await admin.from("profiles").upsert(
      {
        id: userId,
        email: normalized,
        full_name:
          fullName ??
          (user.user_metadata?.full_name as string | undefined) ??
          normalized.split("@")[0],
        role: "student",
        is_suspended: false,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { healed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create profile.";
    return { healed: false, error: message };
  }
}
