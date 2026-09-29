"use client";

import Link from "next/link";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";

export function ForgotPasswordForm({
  sent,
  error,
}: {
  sent?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Forgot your password?</h1>
        <p className="mt-1 text-sm text-muted">
          Enter the email you used to buy or enroll. We will send a link so you can set a new
          password and open your program.
        </p>
      </div>

      <form action="/api/auth/forgot-password" method="POST" className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <SubmitButton className="w-full" pendingText="Sending…">
          Send reset link
        </SubmitButton>
      </form>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {sent ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          If that email has a DigitalSkillX account or purchase, a password reset link is on its
          way. Check inbox and spam, then use the link to set a new password.
        </p>
      ) : null}

      <p className="text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
