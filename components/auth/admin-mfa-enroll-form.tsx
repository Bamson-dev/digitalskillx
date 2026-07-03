"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { confirmAdminMfaEnrollment, enrollAdminMfa } from "@/app/(admin)/admin/actions";
import type { AuthState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { useAuthRedirect } from "@/components/auth/use-auth-redirect";

const initial: AuthState = {};

export function AdminMfaEnrollForm() {
  const [state, action] = useFormState(confirmAdminMfaEnrollment, initial);
  useAuthRedirect(state);
  const [enroll, setEnroll] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    enrollAdminMfa()
      .then((res) => {
        if ("error" in res) setError(res.error);
        else setEnroll({ factorId: res.factorId, qrCode: res.qrCode, secret: res.secret });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not start MFA enrollment.");
      });
  }, []);

  if (error) {
    return <p className="text-sm text-red-300">{error}</p>;
  }

  if (!enroll) {
    return <p className="text-sm text-slate-400">Preparing authenticator enrollment…</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="factor_id" value={enroll.factorId} />
      <div className="flex justify-center rounded-lg bg-white p-4">
        {/* Supabase returns a data: URI — next/image rejects those and crashes the page */}
        <img
          src={enroll.qrCode}
          alt="Authenticator QR code"
          width={200}
          height={200}
          className="h-[200px] w-[200px]"
        />
      </div>
      <p className="text-center text-xs text-slate-500">
        Manual key: <span className="font-mono text-slate-300">{enroll.secret}</span>
      </p>
      <div>
        <label htmlFor="code" className="mb-1.5 block text-sm font-medium">
          Verification code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className="h-12 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-center text-lg tracking-[0.3em]"
        />
      </div>
      <SubmitButton className="w-full" pendingText="Confirming…">
        Enable authenticator
      </SubmitButton>
      {state.error ? (
        <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{state.error}</p>
      ) : null}
    </form>
  );
}
