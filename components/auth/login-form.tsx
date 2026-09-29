"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";
import { signInWithMagicLink, type AuthState } from "@/app/(auth)/actions";
import { StudentPasswordLoginForm } from "@/components/auth/student-password-login-form";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";

const initial: AuthState = {};

export function LoginForm({
  next,
  authError,
  registered,
}: {
  next: string;
  authError?: string;
  registered?: boolean;
}) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [magicState, magicAction] = useFormState(signInWithMagicLink, initial);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          Log in at{" "}
          <a
            href="https://www.digitalskillx.com/login"
            className="font-medium text-brand underline"
          >
            www.digitalskillx.com/login
          </a>
          .
        </p>
      </div>

      <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
        Can&apos;t sign in?{" "}
        <Link href="/forgot-password" className="font-semibold text-brand underline">
          Forgot password — reset it here
        </Link>
        . Use the same email from your course-access message.
      </p>

      {registered ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Account created. Log in to continue.
        </p>
      ) : null}

      {mode === "password" ? (
        <StudentPasswordLoginForm next={next} authError={authError} />
      ) : (
        <form action={magicAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
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
        <Link
          href={
            next && next !== "/dashboard"
              ? `/register?next=${encodeURIComponent(next)}`
              : "/register"
          }
          className="font-medium text-brand hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
