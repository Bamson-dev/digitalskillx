"use client";

import type { ReactNode, MouseEvent } from "react";

/** Submit button that asks for confirmation before the form posts. */
export function ConfirmSubmitButton({
  message,
  className,
  children,
  title,
}: {
  message: string;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  function onClick(e: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(message)) {
      e.preventDefault();
    }
  }

  return (
    <button type="submit" className={className} title={title} onClick={onClick}>
      {children}
    </button>
  );
}
