"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";

/**
 * Shared admin save UX: Saving… → Saved (2s) → idle, with green toast on success
 * and scroll-to-invalid on failure. Does not clear form state.
 */
export function useAdminSaveFeedback(options?: {
  successMessage?: string;
  idleLabel?: string;
  savedLabel?: string;
}) {
  const { toast } = useToast();
  const successMessage = options?.successMessage ?? "Saved successfully.";
  const idleLabel = options?.idleLabel ?? "Save Changes";
  const savedLabel = options?.savedLabel ?? "Saved";
  const [label, setLabel] = useState(idleLabel);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const onSuccess = useCallback(
    (message?: string) => {
      setSaving(false);
      setLabel(savedLabel);
      toast(message ?? successMessage, "success");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLabel(idleLabel), 2000);
    },
    [idleLabel, savedLabel, successMessage, toast],
  );

  const onError = useCallback(
    (message: string) => {
      setSaving(false);
      setLabel(idleLabel);
      toast(message, "error");
      const firstInvalid = document.querySelector<HTMLElement>(
        "input:invalid, textarea:invalid, select:invalid, [aria-invalid='true']",
      );
      firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
      firstInvalid?.focus();
    },
    [idleLabel, toast],
  );

  const beginSave = useCallback(() => {
    setSaving(true);
    setLabel("Saving…");
  }, []);

  return { label, saving, beginSave, onSuccess, onError, setLabel, idleLabel };
}
