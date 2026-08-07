"use client";

import { useCurrency } from "@/components/providers/currency-provider";
import { currencyToggleClass, type CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";

export function CurrencyToggle({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const { currency, setCurrency } = useCurrency();

  function pick(code: CurrencyCode) {
    setCurrency(code);
  }

  return (
    <div
      className={cn(
        "inline-flex items-center p-0.5",
        tone === "dark" ? "border border-neutral-700" : "border border-neutral-200",
        className,
      )}
      role="group"
      aria-label="Currency"
    >
      {(["NGN", "USD"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => pick(code)}
          className={currencyToggleClass(currency === code, tone)}
          aria-pressed={currency === code}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
