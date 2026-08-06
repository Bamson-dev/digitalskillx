"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type FormStateLike = { error?: string; message?: string };

/**
 * Watches server-action form state and applies the standard admin save UX:
 * toast on success/error, temporary "Saved" label, scroll to invalid on error.
 */
export function useFormStateSaveUx(
  state: FormStateLike,
  options: { successToast: string; idleLabel?: string },
) {
  const { toast } = useToast();
  const idleLabel = options.idleLabel ?? "Save Changes";
  const [label, setLabel] = useState(idleLabel);
  const lastMessage = useRef<string | undefined>();
  const lastError = useRef<string | undefined>();

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast(options.successToast, "success");
      setLabel("Saved");
      const t = window.setTimeout(() => setLabel(idleLabel), 2000);
      return () => window.clearTimeout(t);
    }
    if (state.error && state.error !== lastError.current) {
      lastError.current = state.error;
      toast(state.error, "error");
      setLabel(idleLabel);
      const firstInvalid = document.querySelector<HTMLElement>(
        "input:invalid, textarea:invalid, select:invalid, [aria-invalid='true']",
      );
      firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
      firstInvalid?.focus();
    }
  }, [state.message, state.error, toast, options.successToast, idleLabel]);

  return { label };
}

/** Submit button that shows Saving… (pending) or Saved / idle label. */
export function AdminSaveButton({
  label,
  pendingText = "Saving…",
  children,
  ...props
}: ButtonProps & { label: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingText : (children ?? label)}
    </Button>
  );
}

export function AdminInlineFeedback({ state }: { state: FormStateLike }) {
  if (state.error) {
    return (
      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
    );
  }
  if (state.message) {
    return (
      <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
    );
  }
  return null as ReactNode;
}
