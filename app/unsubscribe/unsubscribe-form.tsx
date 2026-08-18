"use client";

import { useFormState } from "react-dom";
import { SubmitButton } from "@/components/auth/submit-button";
import { confirmUnsubscribe, type UnsubscribeState } from "@/app/unsubscribe/actions";

const initial: UnsubscribeState = {};

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action] = useFormState(confirmUnsubscribe, initial);
  if (state.ok) {
    return (
      <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        You are unsubscribed from this campaign. You will not receive further sequence emails.
      </p>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <SubmitButton>Unsubscribe from these emails</SubmitButton>
    </form>
  );
}
