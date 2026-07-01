"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const PasswordInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    inputClassName?: string;
    toggleClassName?: string;
  }
>(({ className, inputClassName, toggleClassName, ...props }, ref) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn("pr-10", inputClassName)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:text-foreground",
          toggleClassName,
        )}
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
