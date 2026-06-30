import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 w-full rounded-lg border border-app bg-card px-3 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-60",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
