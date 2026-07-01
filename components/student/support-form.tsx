"use client";

import { useFormState } from "react-dom";
import { submitSupportRequest, type SupportState } from "@/app/(student)/support/actions";
import { SubmitButton } from "@/components/auth/submit-button";

const initial: SupportState = {};

export function SupportForm() {
  const [state, action] = useFormState(submitSupportRequest, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-neutral-800">
          How can we help?
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={10}
          rows={6}
          placeholder="Describe your issue or question…"
          className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>
      <SubmitButton className="h-12 w-full" pendingText="Sending…">
        Submit request
      </SubmitButton>
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
    </form>
  );
}
