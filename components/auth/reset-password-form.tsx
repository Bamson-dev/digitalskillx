"use client";

import { useState } from "react";
import { updatePassword, type AuthState } from "@/app/(auth)/actions";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/auth/submit-button";

export function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result: AuthState = await updatePassword({}, new FormData(e.currentTarget));
      if (result.error) {
        setError(result.error);
        setPending(false);
        return;
      }
      if (result.redirectTo) {
        window.location.replace(`${window.location.origin}${result.redirectTo}`);
        return;
      }
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Set a new password</h1>
        <p className="mt-1 text-sm text-muted">
          Choose a strong password you don&apos;t use elsewhere.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <SubmitButton className="w-full" pendingText="Updating…" isPending={pending}>
          Update password
        </SubmitButton>
      </form>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
