import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "green" | "amber" | "red";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-brand-50 text-brand-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
