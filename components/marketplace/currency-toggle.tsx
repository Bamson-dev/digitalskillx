"use client";

import { useCurrency } from "@/components/providers/currency-provider";
import { currencyToggleClass, type CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";

export function CurrencyToggle({ className }: { className?: string }) {
  const { currency, setCurrency } = useCurrency();

  function pick(code: CurrencyCode) {
    setCurrency(code);
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-0.5",
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
          className={currencyToggleClass(currency === code)}
          aria-pressed={currency === code}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
