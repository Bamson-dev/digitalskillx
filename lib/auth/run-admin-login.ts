import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { ensureAdminProfile } from "@/lib/ensure-admin-profile";
import { isPlatformAdminEmail } from "@/lib/admin-email";
import { isAdminMfaRequired } from "@/lib/admin-mfa";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/types/database";
import type { LoginSession } from "@/lib/auth/run-student-login";

export async function runAdminLogin(params: {
  email: string;
  password: string;
}): Promise<
  { ok: true; session: LoginSession; redirectTo: string } | { ok: false; error: string }
> {
  const email = params.email.trim().toLowerCase();
  const password = params.password;
  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const authClient = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error) {
    await logAudit({ action: "admin_login_failed", metadata: { email } });
    const hint =
      error.message === "Invalid login credentials"
        ? " Set ADMIN_PASSWORD in Vercel, redeploy, then run setup-production."
        : "";
    return { ok: false, error: `${error.message}${hint}` };
  }
  if (!data.session) {
    return { ok: false, error: "No session returned from sign-in." };
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
      const message = err instanceof Error ? err.message : "Could not create admin profile.";
      return {
        ok: false,
        error: `${message} (auth user ${data.user.id}). Check /api/health → supabaseProjectRef.`,
      };
    }
  } else {
    const adminClient = await createAdminClientAsync();
    const { data: profileRow } = await adminClient
      .from("profiles")
      .select("role, is_suspended")
      .eq("id", data.user.id)
      .maybeSingle();
    profileRecord = profileRow;
  }

  if (!profileRecord) {
    return {
      ok: false,
      error: `No profile found for auth user ${data.user.id}. Run sql/fix-admin-profile.sql in production Supabase.`,
    };
  }

  if (profileRecord.role !== "admin" || profileRecord.is_suspended) {
    await logAudit({ action: "admin_login_forbidden", metadata: { email } });
    return { ok: false, error: "This account does not have admin access." };
  }

  if (isAdminMfaRequired()) {
    const { data: factors } = await authClient.auth.mfa.listFactors();
    const totp = factors?.totp?.find((f) => f.status === "verified");
    if (totp) {
      return {
        ok: false,
        error:
          "This account has authenticator MFA enabled. Remove the TOTP factor in Supabase Auth or complete MFA on a fresh browser session.",
      };
    }
    await logAudit({ action: "admin_login_password_ok", metadata: { email } });
    return {
      ok: true,
      redirectTo: "/admin/mfa/enroll",
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    };
  }

  await logAudit({ action: "admin_login_password_ok", metadata: { email } });
  return {
    ok: true,
    redirectTo: "/admin/dashboard",
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  };
}
