"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { sendPasswordReset, type AuthState } from "@/app/(auth)/actions";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";

const initial: AuthState = {};

export function ForgotPasswordForm() {
  const [state, action] = useFormState(sendPasswordReset, initial);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Forgot your password?</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <SubmitButton className="w-full" pendingText="Sending…">
          Send reset link
        </SubmitButton>
      </form>

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {state.message}
        </p>
      ) : null}

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
