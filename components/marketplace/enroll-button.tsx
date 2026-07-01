"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useCurrency } from "@/components/providers/currency-provider";
import { cn } from "@/lib/utils";

export const USD_PAYMENTS_COMING_SOON = "USD payments coming soon.";

type Props = {
  courseId: string;
  priceNgn: number;
  priceUsd: number;
  isEnrolled: boolean;
  isLoggedIn: boolean;
  label?: string;
  className?: string;
  size?: "default" | "bar";
};

function UsdComingSoonButton({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "bar";
}) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      className={cn(
        "inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 font-semibold text-neutral-500",
        size === "bar"
          ? "h-12 min-w-[140px] px-4 text-xs sm:text-sm"
          : "h-12 w-full px-4 text-xs sm:h-14 sm:min-w-[200px] sm:px-6 sm:text-sm",
        className,
      )}
    >
      {USD_PAYMENTS_COMING_SOON}
    </button>
  );
}

export function EnrollButton({
  courseId,
  priceNgn,
  priceUsd,
  isEnrolled,
  isLoggedIn,
  label,
  className,
  size = "default",
}: Props) {
  const router = useRouter();
  const { currency, courseIsFree } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFree = courseIsFree({ price_ngn: priceNgn, price_usd: priceUsd });
  const buttonLabel =
    label ?? (isEnrolled ? "Continue Learning" : isFree ? "Enroll Free" : "Enroll Now");

  if (currency === "USD" && !isEnrolled) {
    return (
      <div className={className}>
        <UsdComingSoonButton size={size} />
      </div>
    );
  }

  async function handleClick() {
    if (isEnrolled) {
      router.push(`/courses/${courseId}`);
      return;
    }

    if (!isLoggedIn) {
      router.push(`/register?next=${encodeURIComponent(`/course/${courseId}?enroll=1`)}`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, currency: "NGN" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Payment could not start");
      if (json.enrolled) {
        router.push(`/courses/${courseId}`);
        return;
      }
      if (json.authorizationUrl) {
        window.location.href = json.authorizationUrl;
        return;
      }
      throw new Error("Unexpected payment response");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg bg-brand font-bold text-white transition hover:bg-brand-700 disabled:opacity-70",
          size === "bar"
            ? "h-12 min-w-[140px] px-6 text-sm"
            : "h-12 w-full px-8 text-sm sm:h-14 sm:min-w-[200px] sm:text-base",
        )}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {buttonLabel}
      </button>
      {error ? <p className="mt-2 text-sm text-brand">{error}</p> : null}
    </div>
  );
}

/** Text link variant for upsell rows (e.g. student dashboard). */
export function EnrollLink({ courseId, className }: { courseId: string; className?: string }) {
  const { currency } = useCurrency();

  if (currency === "USD") {
    return (
      <span
        className={cn("cursor-not-allowed text-sm font-semibold text-neutral-400", className)}
        aria-disabled="true"
      >
        {USD_PAYMENTS_COMING_SOON}
      </span>
    );
  }

  return (
    <a
      href={`/course/${courseId}`}
      className={cn("text-sm font-semibold text-brand hover:text-brand-700", className)}
    >
      Enroll →
    </a>
  );
}
