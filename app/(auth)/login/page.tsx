import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { authQueryErrorMessage } from "@/lib/auth-errors";
import { ensureStudentProfile } from "@/lib/ensure-student-profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string; auth_error?: string; registered?: string };
}) {
  const next =
    typeof searchParams?.next === "string" && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/dashboard";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await ensureStudentProfile();
    if (profile && !profile.is_suspended) {
      const destination =
        profile.role === "admin" ? "/admin/dashboard" : next;
      redirect(destination);
    }
    await supabase.auth.signOut();
  }

  const authError =
    (typeof searchParams?.auth_error === "string" && searchParams.auth_error) ||
    authQueryErrorMessage(searchParams?.error);
  const registered = searchParams?.registered === "1";
  return <LoginForm next={next} authError={authError} registered={registered} />;
}
