"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { signUpWithPassword, type AuthState } from "@/app/(auth)/actions";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

const initial: AuthState = {};

export function RegisterForm() {
  const [state, action] = useFormState(signUpWithPassword, initial);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">
          Start learning with DigitalSkillX.
        </p>
      </div>

      <OAuthButtons />

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-[rgb(var(--border))]" />
        or
        <span className="h-px flex-1 bg-[rgb(var(--border))]" />
      </div>

      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" required autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
        </div>
        <SubmitButton className="w-full" pendingText="Creating account…">
          Create account
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
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
