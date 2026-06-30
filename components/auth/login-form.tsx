"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";
import {
  signInWithPassword,
  signInWithMagicLink,
  type AuthState,
} from "@/app/(auth)/actions";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

const initial: AuthState = {};

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [pwState, pwAction] = useFormState(signInWithPassword, initial);
  const [magicState, magicAction] = useFormState(signInWithMagicLink, initial);
  const state = mode === "password" ? pwState : magicState;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          Log in to continue your learning.
        </p>
      </div>

      <OAuthButtons />

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-[rgb(var(--border))]" />
        or
        <span className="h-px flex-1 bg-[rgb(var(--border))]" />
      </div>

      {mode === "password" ? (
        <form action={pwAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="mb-1.5 text-xs font-medium text-brand hover:underline"
              >
                Forgot?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="remember" defaultChecked className="rounded" />
            Remember me for 30 days
          </label>
          <SubmitButton className="w-full" pendingText="Signing in…">
            Log in
          </SubmitButton>
        </form>
      ) : (
        <form action={magicAction} className="space-y-4">
          <div>
            <Label htmlFor="magic-email">Email</Label>
            <Input id="magic-email" name="email" type="email" required autoComplete="email" />
          </div>
          <SubmitButton className="w-full" pendingText="Sending link…">
            Send magic link
          </SubmitButton>
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
        New here?{" "}
        <Link href="/register" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
