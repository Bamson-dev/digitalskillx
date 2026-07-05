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
        "relative flex h-full w-full flex-col justify-end overflow-hidden bg-neutral-100",
        className,
      )}
      aria-hidden
    >
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-1 bg-brand",
          size === "compact" && "w-0.5",
        )}
      />
      <div className={cn("relative px-4 pb-4 pt-6", size === "hero" && "px-6 pb-6 pt-10", size === "compact" && "p-2")}>
        {size !== "compact" ? (
          <p
            className={cn(
              "font-display font-bold leading-none text-neutral-300",
              size === "hero" ? "text-6xl sm:text-7xl" : "text-4xl",
            )}
          >
            {initials || "DS"}
          </p>
        ) : (
          <p className="font-display text-sm font-bold text-neutral-400">{initials || "DS"}</p>
        )}
        {size !== "compact" ? (
          <>
            <p
              className={cn(
                "mt-3 max-w-[90%] font-display font-semibold leading-tight text-neutral-800",
                size === "hero" ? "text-lg sm:text-xl" : "line-clamp-2 text-sm",
              )}
            >
              {title}
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
              DigitalSkillX
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
