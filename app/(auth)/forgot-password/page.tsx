import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: { sent?: string; error?: string };
}) {
  return (
    <ForgotPasswordForm
      sent={searchParams?.sent === "1"}
      error={typeof searchParams?.error === "string" ? searchParams.error : undefined}
    />
  );
}
