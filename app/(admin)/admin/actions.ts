"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { ensureAdminProfile } from "@/lib/ensure-admin-profile";
import { isPlatformAdminEmail } from "@/lib/admin-email";
import { verifyAccessToken } from "@/lib/verify-access-token";
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
        ? " Set ADMIN_PASSWORD in Vercel to match this password, redeploy, then run: curl -X POST -H \"Authorization: Bearer YOUR_CRON_SECRET\" https://www.digitalskillx.com/api/admin/setup-production"
        : error.message === "Email not confirmed"
          ? " In Supabase → Authentication → Users → open this user → turn on Auto Confirm, or run: update auth.users set email_confirmed_at = now() where email = 'admin@digitalskillx.com';"
          : "";
    return { error: `${error.message}${hint}` };
  }

  let profileRecord: { role: string; is_suspended: boolean } | null = null;

  if (isPlatformAdminEmail(email)) {
    try {
      const adminClient = await createAdminClientAsync();
      await ensureAdminProfile(adminClient, {
        userId: data.user.id,
        email,
        fullName:
          (data.user.user_metadata?.full_name as string | undefined) ?? "Platform Admin",
      });
      const { data: verified, error: verifyError } = await adminClient
        .from("profiles")
        .select("role, is_suspended")
        .eq("id", data.user.id)
        .maybeSingle();
      if (verifyError) throw new Error(verifyError.message);
      profileRecord = verified;
    } catch (err) {
      await supabase.auth.signOut();
      const message = err instanceof Error ? err.message : "Could not create admin profile.";
      return {
        error: `${message} (auth user ${data.user.id}). Confirm Vercel NEXT_PUBLIC_SUPABASE_URL matches the Supabase project where you ran the SQL — see /api/health → supabaseProjectRef.`,
      };
    }
  } else {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role, is_suspended")
      .eq("id", data.user.id)
      .maybeSingle();
    profileRecord = profileRow;
  }

  if (!profileRecord) {
    await supabase.auth.signOut();
    return {
      error: `No profile found for auth user ${data.user.id}. Run sql/fix-admin-profile.sql in the Supabase project matching /api/health → supabaseProjectRef.`,
    };
  }

  if (profileRecord.role !== "admin" || profileRecord.is_suspended) {
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

  if (!isAdminMfaRequired()) {
    await logAudit({ action: "admin_login_password_ok", metadata: { email } });
    redirect("/admin/dashboard");
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

/** @deprecated Legacy shim — cached clients may still call this after browser sign-in. */
export async function healAdminProfileByLogin(
  email: string,
  userId: string,
  accessToken: string,
): Promise<{ healed: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase();
  if (!isPlatformAdminEmail(normalized)) {
    return { healed: false, error: "This account is not authorized for admin access." };
  }

  const user = await verifyAccessToken(accessToken);
  if (!user || user.id !== userId || user.email?.trim().toLowerCase() !== normalized) {
    return { healed: false, error: "Session verification failed. Refresh and try again." };
  }

  try {
    const admin = await createAdminClientAsync();
    await ensureAdminProfile(admin, {
      userId,
      email: normalized,
      fullName: (user.user_metadata?.full_name as string | undefined) ?? "Platform Admin",
    });
    return { healed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create admin profile.";
    return { healed: false, error: message };
  }
}
