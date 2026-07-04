"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
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

function GuestEmailModal({
  onClose,
  onSubmit,
  loading,
  error,
}: {
  onClose: () => void;
  onSubmit: (email: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-labelledby="guest-enroll-title"
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded p-1 text-neutral-400 hover:text-neutral-700"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 id="guest-enroll-title" className="text-lg font-bold text-neutral-900">
          Get course access
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Enter your email and we&apos;ll send your login details and course access right away.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(email.trim());
          }}
        >
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none ring-brand focus:ring-2"
          />
          {error ? <p className="text-sm text-brand">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand font-bold text-white hover:bg-brand-700 disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enroll free
          </button>
        </form>
      </div>
    </div>
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
  const [showEmailModal, setShowEmailModal] = useState(false);

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

  async function startCheckout(guestEmail?: string) {
    setLoading(true);
    setError(null);
    try {
      const payload: { courseId: string; currency: "NGN"; email?: string } = {
        courseId,
        currency: "NGN",
      };
      if (guestEmail) payload.email = guestEmail;

      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let json: {
        error?: string;
        enrolled?: boolean;
        authorizationUrl?: string;
        buyerEmail?: string;
        isNewAccount?: boolean;
      } = {};

      if (text) {
        try {
          json = JSON.parse(text) as typeof json;
        } catch {
          throw new Error(
            res.ok
              ? "Server returned an invalid response. Please try again."
              : `Enrollment failed (${res.status}). Please try again or contact support.`,
          );
        }
      } else if (!res.ok) {
        throw new Error(`Enrollment failed (${res.status}). Please try again or contact support.`);
      }

      if (!res.ok) throw new Error(json.error ?? "Payment could not start");
      if (json.enrolled) {
        setShowEmailModal(false);
        router.push(`/course/${courseId}?enrolled=1`);
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

  async function handleClick() {
    if (isEnrolled) {
      router.push(`/courses/${courseId}`);
      return;
    }

    if (isFree && !isLoggedIn) {
      setShowEmailModal(true);
      setError(null);
      return;
    }

    await startCheckout();
  }

  return (
    <div className={className}>
      {showEmailModal ? (
        <GuestEmailModal
          onClose={() => {
            if (!loading) setShowEmailModal(false);
          }}
          onSubmit={(email) => void startCheckout(email)}
          loading={loading}
          error={error}
        />
      ) : null}
      <button
        type="button"
        onClick={() => void handleClick()}
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
      {error && !showEmailModal ? <p className="mt-2 text-sm text-brand">{error}</p> : null}
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
