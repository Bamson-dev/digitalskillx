"use client";

import { CurrencyToggle } from "@/components/marketplace/currency-toggle";
import { cn } from "@/lib/utils";

export function HomepageCurrencyBar({
  className,
  sticky = false,
  compact = false,
}: {
  className?: string;
  sticky?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-3",
        compact ? "py-0" : "py-3",
        sticky &&
          "sticky top-14 z-30 -mx-4 border-b border-neutral-200 bg-neutral-50/95 px-4 backdrop-blur-sm sm:top-[60px] sm:-mx-0 sm:px-0",
        className,
      )}
    >
      {!compact ? (
        <p className="shrink-0 text-xs text-neutral-500">Prices shown in</p>
      ) : null}
      <CurrencyToggle className="shrink-0" />
    </div>
  );
}
