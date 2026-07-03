import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { authQueryErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string };
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_suspended")
      .eq("id", user.id)
      .maybeSingle();
    if (profile && !profile.is_suspended) {
      const destination =
        profile.role === "admin" ? "/admin/dashboard" : next;
      redirect(destination);
    }
  }

  const authError = authQueryErrorMessage(searchParams?.error);
  return <LoginForm next={next} authError={authError} />;
}
