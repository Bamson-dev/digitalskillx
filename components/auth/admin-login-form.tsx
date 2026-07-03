"use client";

import { useState } from "react";
import { signInAdmin, verifyAdminMfa, type AdminLoginState } from "@/app/(admin)/admin/actions";
import { isNextRedirect } from "@/lib/is-next-redirect";
import { SubmitButton } from "@/components/auth/submit-button";
import { PasswordInput } from "@/components/ui/password-input";

type MfaStep = {
  factorId: string;
  challengeId: string;
};

export function AdminLoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mfaStep, setMfaStep] = useState<MfaStep | null>(null);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);

  async function handlePasswordLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(e.currentTarget);

    try {
      const result: AdminLoginState | undefined = await signInAdmin({}, formData);
      if (!result) {
        setError("Login failed. Hard refresh the page (Cmd+Shift+R) and try again.");
        setPending(false);
        return;
      }
      if (result.error) {
        setError(result.error);
        setPending(false);
        return;
      }
      if (result.needsMfa && result.factorId && result.challengeId) {
        setMfaStep({ factorId: result.factorId, challengeId: result.challengeId });
        setMfaMessage(result.message ?? "Enter the 6-digit code from your authenticator app.");
        setPending(false);
        return;
      }
      setPending(false);
    } catch (err) {
      if (isNextRedirect(err)) return;
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setPending(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mfaStep) return;
    setError(null);
    setPending(true);

    const formData = new FormData(e.currentTarget);
    formData.set("factor_id", mfaStep.factorId);
    formData.set("challenge_id", mfaStep.challengeId);

    try {
      const result = await verifyAdminMfa({}, formData);
      if (result?.error) {
        setError(result.error);
        setPending(false);
        return;
      }
      setPending(false);
    } catch (err) {
      if (isNextRedirect(err)) return;
      setError(err instanceof Error ? err.message : "Verification failed.");
      setPending(false);
    }
  }

  if (mfaStep) {
    return (
      <form onSubmit={handleMfaVerify} className="space-y-4">
        <p className="text-sm text-slate-300">
          {mfaMessage ?? "Enter the 6-digit code from your authenticator app."}
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
        <SubmitButton className="w-full" pendingText="Verifying…" isPending={pending}>
          Verify &amp; sign in
        </SubmitButton>
        {error ? (
          <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
        ) : null}
      </form>
    );
  }

  return (
    <form onSubmit={handlePasswordLogin} className="space-y-4">
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

      <SubmitButton className="w-full" pendingText="Verifying…" isPending={pending}>
        Sign in
      </SubmitButton>

      {error ? (
        <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
      ) : null}
    </form>
  );
}
