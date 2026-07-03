"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { signInAdmin, verifyAdminMfa, type AdminLoginState } from "@/app/(admin)/admin/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { useAuthRedirect } from "@/components/auth/use-auth-redirect";
import { PasswordInput } from "@/components/ui/password-input";

const initial: AdminLoginState = {};

export function AdminLoginForm() {
  const [pwState, pwAction] = useFormState(signInAdmin, initial);
  const [mfaState, mfaAction] = useFormState(verifyAdminMfa, initial);
  const [mfaStep, setMfaStep] = useState<{
    factorId: string;
    challengeId: string;
  } | null>(null);

  useEffect(() => {
    if (pwState.needsMfa && pwState.factorId && pwState.challengeId) {
      setMfaStep({ factorId: pwState.factorId, challengeId: pwState.challengeId });
    }
  }, [pwState.needsMfa, pwState.factorId, pwState.challengeId]);

  const state = mfaStep ? mfaState : pwState;
  useAuthRedirect(pwState);
  useAuthRedirect(mfaState);

  if (mfaStep) {
    return (
      <form action={mfaAction} className="space-y-4">
        <input type="hidden" name="factor_id" value={mfaStep.factorId} />
        <input type="hidden" name="challenge_id" value={mfaStep.challengeId} />
        <p className="text-sm text-slate-300">
          {pwState.message ?? "Enter the 6-digit code from your authenticator app."}
        </p>
        <div>
          <label htmlFor="code" className="mb-1.5 block text-sm font-medium">
            Authenticator code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className="h-12 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-center text-lg tracking-[0.3em] outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30"
          />
        </div>
        <SubmitButton className="w-full" pendingText="Verifying…">
          Verify &amp; sign in
        </SubmitButton>
        {state.error ? (
          <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{state.error}</p>
        ) : null}
      </form>
    );
  }

  return (
    <form action={pwAction} className="space-y-4">
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
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="current-password"
          inputClassName="border-slate-700 bg-slate-800 focus:border-brand-400 focus:ring-brand-400/30"
          toggleClassName="text-slate-400 hover:text-slate-200"
        />
      </div>

      <SubmitButton className="w-full" pendingText="Verifying…">
        Sign in
      </SubmitButton>

      {state.error ? (
        <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{state.error}</p>
      ) : null}
    </form>
  );
}
