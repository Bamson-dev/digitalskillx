import { cn } from "@/lib/utils";

export function CourseThumbnailPlaceholder({
  title,
  className,
  size = "default",
}: {
  title: string;
  className?: string;
  size?: "default" | "compact" | "hero";
}) {
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-50 via-white to-brand-50",
        className,
      )}
      aria-hidden
    >
      <div className="absolute inset-0 opacity-[0.07]">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand" />
        <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-neutral-900" />
      </div>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-xl border border-brand/20 bg-white/80 font-display font-bold text-brand shadow-sm backdrop-blur-sm",
          size === "hero" && "h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl",
          size === "default" && "h-12 w-12 text-lg",
          size === "compact" && "h-8 w-8 text-xs",
        )}
      >
        {initials || "DS"}
      </div>
      <p
        className={cn(
          "relative mt-3 max-w-[85%] text-center font-medium leading-snug text-neutral-700",
          size === "hero" && "text-sm sm:text-base",
          size === "default" && "line-clamp-2 px-3 text-xs",
          size === "compact" && "hidden",
        )}
      >
        {title}
      </p>
      <p className="relative mt-1 text-[10px] font-semibold uppercase tracking-widest text-brand/70">
        DigitalSkillX
      </p>
    </div>
  );
}
