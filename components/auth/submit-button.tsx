"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingText,
  isPending,
  disabled,
  ...props
}: ButtonProps & { pendingText?: string; isPending?: boolean }) {
  const { pending: formPending } = useFormStatus();
  const pending = isPending ?? formPending;
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? (pendingText ?? "Please wait…") : children}
    </Button>
  );
}
