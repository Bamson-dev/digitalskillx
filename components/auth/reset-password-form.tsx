"use client";

import { useFormState } from "react-dom";
import { updatePassword, type AuthState } from "@/app/(auth)/actions";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { useAuthRedirect } from "@/components/auth/use-auth-redirect";

const initial: AuthState = {};

export function ResetPasswordForm() {
  const [state, action] = useFormState(updatePassword, initial);
  useAuthRedirect(state);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Set a new password</h1>
        <p className="mt-1 text-sm text-muted">
          Choose a strong password you don&apos;t use elsewhere.
        </p>
      </div>

      <form action={action} className="space-y-4">
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
        <SubmitButton className="w-full" pendingText="Updating…">
          Update password
        </SubmitButton>
      </form>

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
