import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-lg border border-app bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
