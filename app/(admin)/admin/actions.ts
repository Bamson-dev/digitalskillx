"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AuthState } from "@/app/(auth)/actions";
import { isAdminLoginBlocked, recordAdminLoginFailure } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { logAudit } from "@/lib/audit";
import { isAdminMfaRequired } from "@/lib/admin-mfa";

export type AdminLoginState = AuthState & {
  needsMfa?: boolean;
  factorId?: string;
  challengeId?: string;
};

/**
 * Admin sign-in step 1: email + password. On success, starts TOTP challenge when enrolled.
 */
export async function signInAdmin(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const ip = clientIpFromHeaders();
  const blocked = await isAdminLoginBlocked(ip, email);
  if (!blocked.ok) {
    return {
      error: `Too many failed attempts. Try again in ${blocked.retryAfterSec ?? 900} seconds.`,
    };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await recordAdminLoginFailure(ip, email);
    await logAudit({ action: "admin_login_failed", metadata: { email, ip } });
    const hint =
      error.message === "Invalid login credentials"
        ? " Password in Supabase Auth may not match ADMIN_PASSWORD on the server. Set ADMIN_PASSWORD_SYNC=true in Vercel/Coolify and redeploy, or run: curl -X POST -H \"Authorization: Bearer YOUR_CRON_SECRET\" https://www.digitalskillx.com/api/admin/sync-password"
        : error.message === "Email not confirmed"
          ? " In Supabase → Authentication → Users → open this user → turn on Auto Confirm, or run: update auth.users set email_confirmed_at = now() where email = 'admin@digitalskillx.com';"
          : "";
    return { error: `${error.message}${hint}` };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_suspended")
    .eq("id", data.user.id)
    .single();

  if (profile?.role !== "admin" || profile?.is_suspended) {
    await supabase.auth.signOut();
    await logAudit({ action: "admin_login_forbidden", metadata: { email, ip } });
    return { error: "This account does not have admin access." };
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === "verified");

  if (!totp) {
    await logAudit({ action: "admin_login_password_ok", metadata: { email } });
    if (!isAdminMfaRequired()) {
      redirect("/admin/dashboard");
    }
    redirect("/admin/mfa/enroll");
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: totp.id,
  });
  if (challengeError || !challenge) {
    return { error: challengeError?.message ?? "Could not start authenticator challenge." };
  }

  return {
    needsMfa: true,
    factorId: totp.id,
    challengeId: challenge.id,
    message: "Enter the 6-digit code from your authenticator app.",
  };
}

/** Admin sign-in step 2: verify TOTP code. */
export async function verifyAdminMfa(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const factorId = String(formData.get("factor_id") ?? "");
  const challengeId = String(formData.get("challenge_id") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!factorId || !challengeId || !code) {
    return { error: "Authenticator code is required." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
  if (error) {
    await logAudit({ action: "admin_mfa_failed", metadata: { factorId } });
    return { error: error.message };
  }

  await logAudit({ action: "admin_login_success" });
  redirect("/admin/dashboard");
}

export async function enrollAdminMfa(): Promise<
  { error: string } | { factorId: string; qrCode: string; secret: string; uri: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const existing = factors?.totp?.find((f) => f.status === "verified");
  if (existing) return { error: "Authenticator is already enrolled." };

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "DigitalSkillX Admin" });
  if (error || !data) return { error: error?.message ?? "Enrollment failed." };

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export async function confirmAdminMfaEnrollment(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const factorId = String(formData.get("factor_id") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!factorId || !code) return { error: "Enter the verification code." };

  const supabase = createClient();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (challengeError || !challenge) {
    return { error: challengeError?.message ?? "Challenge failed." };
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (error) return { error: error.message };

  await logAudit({ action: "admin_mfa_enrolled" });
  redirect("/admin/dashboard");
}

export async function signOutAdmin() {
  const supabase = createClient();
  await logAudit({ action: "admin_logout" });
  await supabase.auth.signOut();
  redirect("/admin/login");
}
