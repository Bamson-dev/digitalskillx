"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";
import { signInWithMagicLink, healStudentProfileSession, type AuthState } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/client";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/auth/submit-button";

const initial: AuthState = {};

export function LoginForm({ next, authError }: { next: string; authError?: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [magicState, magicAction] = useFormState(signInWithMagicLink, initial);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwPending, setPwPending] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwError(null);
    setPwPending(true);

    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(new FormData(form).get("password") ?? "");

    if (!email || !password) {
      setPwError("Email and password are required.");
      setPwPending(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setPwError(error.message);
        setPwPending(false);
        return;
      }

      const heal = await healStudentProfileSession();
      if (!heal.healed && heal.error) {
        setPwError(heal.error);
        setPwPending(false);
        return;
      }

      const destination = next.startsWith("/") ? next : "/dashboard";
      window.location.replace(destination);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Could not sign in.");
      setPwPending(false);
    }
  }

  const state = mode === "password" ? { error: pwError ?? undefined } : magicState;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">
          Log in to continue your learning.
        </p>
      </div>

      {mode === "password" ? (
        <form onSubmit={handlePasswordLogin} className="space-y-4">
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
            <PasswordInput
              id="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="remember" defaultChecked className="rounded" />
            Remember me for 30 days
          </label>
          <SubmitButton className="w-full" pendingText="Signing in…" isPending={pwPending}>
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

      {authError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{authError}</p>
      ) : null}

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {"message" in state && state.message ? (
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
