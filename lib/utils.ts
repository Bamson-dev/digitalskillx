import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names and resolve Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a date for display, gracefully handling null/invalid input. */
export function formatDate(
  value: string | number | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", opts).format(date);
}

/** Clamp a 0-100 percentage to a safe integer for progress bars. */
export function toPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
