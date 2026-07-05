import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  reconcileOrphanCertificatesForEmail,
  syncStudentCourseAccess,
} from "@/lib/admin-student-onboarding";
import type { Database } from "@/types/database";

export type LoginSession = {
  access_token: string;
  refresh_token: string;
};

export async function runStudentLogin(params: {
  email: string;
  password: string;
}): Promise<{ ok: true; session: LoginSession } | { ok: false; error: string }> {
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
  if (error) return { ok: false, error: error.message };
  if (!data.session) return { ok: false, error: "No session returned from sign-in." };

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

    await admin
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", data.user.id);

    const { data: verified, error: verifyError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (verifyError) throw new Error(verifyError.message);
    if (!verified) throw new Error("Profile was not created.");

    await syncStudentCourseAccess(admin, {
      authUserId: data.user.id,
      profileEmail: email,
    });

    const { data: authUserData } = await admin.auth.admin.getUserById(data.user.id);
    const authEmail = authUserData.user?.email?.trim().toLowerCase() ?? email;
    await reconcileOrphanCertificatesForEmail(admin, {
      authUserId: data.user.id,
      email: authEmail,
    });
    if (authEmail !== email) {
      await reconcileOrphanCertificatesForEmail(admin, {
        authUserId: data.user.id,
        email,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load your profile.";
    return { ok: false, error: message };
  }

  return {
    ok: true,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  };
}
