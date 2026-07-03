"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";
import { signInWithMagicLink, type AuthState } from "@/app/(auth)/actions";
import { StudentPasswordLoginForm } from "@/components/auth/student-password-login-form";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";

const initial: AuthState = {};

export function LoginForm({ next, authError }: { next: string; authError?: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [magicState, magicAction] = useFormState(signInWithMagicLink, initial);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          Log in to continue your learning.
        </p>
      </div>

      {mode === "password" ? (
        <StudentPasswordLoginForm next={next} authError={authError} />
      ) : (
        <form action={magicAction} className="space-y-4">
          <div>
            <Label htmlFor="magic-email">Email</Label>
            <Input id="magic-email" name="email" type="email" required autoComplete="email" />
          </div>
          <SubmitButton className="w-full" pendingText="Sending link…">
            Send magic link
          </SubmitButton>
          {magicState.error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {magicState.error}
            </p>
          ) : null}
          {magicState.message ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {magicState.message}
            </p>
          ) : null}
        </form>
      )}

      <button
        type="button"
        onClick={() => setMode(mode === "password" ? "magic" : "password")}
        className="w-full text-center text-sm font-medium text-brand hover:underline"
      >
        {mode === "password"
          ? "Use a magic link instead"
          : "Use email and password instead"}
      </button>

      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
