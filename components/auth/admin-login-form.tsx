"use client";

import { useFormState } from "react-dom";
import { signInAdmin } from "@/app/(admin)/admin/actions";
import type { AuthState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";

const initial: AuthState = {};

export function AdminLoginForm() {
  const [state, action] = useFormState(signInAdmin, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30"
        />
      </div>

      <SubmitButton className="w-full" pendingText="Verifying…">
        Sign in
      </SubmitButton>

      {state.error ? (
        <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
