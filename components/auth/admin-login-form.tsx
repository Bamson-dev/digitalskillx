"use client";

import { useState } from "react";
import { healAdminProfileByLogin } from "@/app/(admin)/admin/actions";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/auth/submit-button";
import { PasswordInput } from "@/components/ui/password-input";

type MfaStep = {
  factorId: string;
  challengeId: string;
};

export function AdminLoginForm({ mfaRequired = true }: { mfaRequired?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mfaStep, setMfaStep] = useState<MfaStep | null>(null);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);

  async function handlePasswordLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setError("Email and password are required.");
      setPending(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setPending(false);
        return;
      }
      if (!data.session?.access_token) {
        setError("Sign-in succeeded but no session was returned. Check Supabase configuration.");
        setPending(false);
        return;
      }

      const heal = await healAdminProfileByLogin(email, data.user.id, data.session.access_token);
      if (!heal.healed) {
        await supabase.auth.signOut();
        setError(heal.error ?? "Could not verify admin profile.");
        setPending(false);
        return;
      }

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find((f) => f.status === "verified");

      if (totp) {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: totp.id,
        });
        if (challengeError || !challenge) {
          setError(challengeError?.message ?? "Could not start authenticator challenge.");
          setPending(false);
          return;
        }
        setMfaStep({ factorId: totp.id, challengeId: challenge.id });
        setMfaMessage("Enter the 6-digit code from your authenticator app.");
        setPending(false);
        return;
      }

      if (mfaRequired) {
        window.location.replace("/admin/mfa/enroll");
        return;
      }

      window.location.replace("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setPending(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!mfaStep) return;
    setError(null);
    setPending(true);

    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    if (!code) {
      setError("Authenticator code is required.");
      setPending(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaStep.factorId,
        challengeId: mfaStep.challengeId,
        code,
      });
      if (verifyError) {
        setError(verifyError.message);
        setPending(false);
        return;
      }
      window.location.replace("/admin/dashboard");
    } catch (err) {
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
