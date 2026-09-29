import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { authQueryErrorMessage } from "@/lib/auth-errors";
import { ensureStudentProfile } from "@/lib/ensure-student-profile";
import { safeNextPath } from "@/lib/safe-next-path";
import { isNextRedirect } from "@/lib/is-next-redirect";
import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/with-timeout";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string; auth_error?: string; registered?: string };
}) {
  const next = safeNextPath(
    typeof searchParams?.next === "string" ? searchParams.next : undefined,
  );

  try {
    const supabase = createClient();
    const user = await withTimeout(
      supabase.auth.getUser().then((res) => res.data.user),
      4_000,
      null,
    );

    if (user) {
      const profile = await ensureStudentProfile();
      if (profile && !profile.is_suspended) {
        const destination = profile.role === "admin" ? "/admin/dashboard" : next;
        redirect(destination);
      }
      await supabase.auth.signOut();
    }
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    // Always render the login form — a session lookup blip must not 500 /login.
  }

  const authError =
    (typeof searchParams?.auth_error === "string" && searchParams.auth_error) ||
    authQueryErrorMessage(searchParams?.error);
  const registered = searchParams?.registered === "1";
  return <LoginForm next={next} authError={authError} registered={registered} />;
}
