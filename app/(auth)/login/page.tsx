import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return <LoginForm next={searchParams.next ?? "/dashboard"} />;
}
