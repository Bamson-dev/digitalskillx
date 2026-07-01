import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const next =
    typeof searchParams?.next === "string" && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/dashboard";
  return <LoginForm next={next} />;
}
