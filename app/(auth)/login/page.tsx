import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { authQueryErrorMessage } from "@/lib/auth-errors";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string };
}) {
  const next =
    typeof searchParams?.next === "string" && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/dashboard";
  const authError = authQueryErrorMessage(searchParams?.error);
  return <LoginForm next={next} authError={authError} />;
}
