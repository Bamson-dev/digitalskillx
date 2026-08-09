"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { useCurrency } from "@/components/providers/currency-provider";
import { cn } from "@/lib/utils";
import { trackProductEvent } from "@/lib/product-analytics";
import {
  attributionToMetadata,
  attributionToPaystackStrings,
  type SalesAttribution,
} from "@/lib/sales-attribution";

export const USD_PAYMENTS_COMING_SOON = "USD payments coming soon.";

type Props = {
  courseId: string;
  priceNgn: number;
  priceUsd: number;
  isEnrolled: boolean;
  /** True when the visitor has a usable student profile (email on file). */
  isLoggedIn: boolean;
  /** Course is listed but lessons are not available yet. */
  comingSoon?: boolean;
  label?: string;
  className?: string;
  size?: "default" | "bar";
  hidden?: boolean;
  /** Optional sales attribution passed into initialize (UTM / sales_page_id). */
  attribution?: SalesAttribution | null;
  /** When true, emit sales_page_checkout_start after initialize succeeds. */
  trackCheckoutStart?: boolean;
  checkoutMeta?: Record<string, string | undefined>;
};

const CHECKOUT_TIMEOUT_MS = 45_000;

function CourseComingSoonButton({
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
        "inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-amber-200 bg-amber-50 font-semibold text-amber-800",
        size === "bar"
          ? "h-12 min-w-[140px] px-4 text-xs sm:text-sm"
          : "h-12 w-full px-4 text-xs sm:h-14 sm:min-w-[200px] sm:px-6 sm:text-sm",
        className,
      )}
    >
      Coming soon
    </button>
  );
}

function UsdCheckoutSwitch({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "bar";
}) {
  const { setCurrency } = useCurrency();
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-neutral-500 sm:text-sm">
        USD checkout is not available yet. Continue in Nigerian Naira to enroll.
      </p>
      <button
        type="button"
        onClick={() => setCurrency("NGN")}
        className={cn(
          "inline-flex items-center justify-center rounded-lg bg-brand font-semibold text-white hover:bg-brand-700",
          size === "bar"
            ? "h-12 min-w-[140px] px-4 text-xs sm:text-sm"
            : "h-12 w-full px-4 text-xs sm:h-14 sm:min-w-[200px] sm:px-6 sm:text-sm",
        )}
      >
        Continue in NGN
      </button>
    </div>
  );
}

function CheckoutDetailsModal({
  isFree,
  onClose,
  onSubmit,
  loading,
  error,
}: {
  isFree: boolean;
  onClose: () => void;
  onSubmit: (details: { email: string; fullName: string }) => void;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-labelledby="checkout-details-title"
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
        <h2 id="checkout-details-title" className="text-lg font-bold text-neutral-900">
          {isFree ? "Get course access" : "Checkout details"}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          {isFree
            ? "Enter your details and we'll send your login and course access right away."
            : "Enter your details to continue. After payment we'll email your login and unlock the course on your account."}
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ email: email.trim(), fullName: fullName.trim() });
          }}
        >
          <input
            type="text"
            required
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            autoComplete="name"
            minLength={2}
            className="h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none ring-brand focus:ring-2"
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="email"
            className="h-11 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none ring-brand focus:ring-2"
          />
          {error ? <p className="text-sm text-brand">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || !email.trim() || fullName.trim().length < 2}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand font-bold text-white hover:bg-brand-700 disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isFree ? "Enroll free" : "Continue to payment"}
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
  comingSoon = false,
  label,
  className,
  size = "default",
  hidden = false,
  attribution = null,
  trackCheckoutStart = false,
  checkoutMeta,
}: Props) {
  const router = useRouter();
  const { currency, courseIsFree } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  const isFree = courseIsFree({ price_ngn: priceNgn, price_usd: priceUsd });
  const buttonLabel =
    label ?? (isEnrolled ? "Continue Learning" : isFree ? "Enroll Free" : "Enroll Now");

  if (hidden) return null;

  if (comingSoon) {
    return (
      <div className={className}>
        <CourseComingSoonButton size={size} />
      </div>
    );
  }

  if (currency === "USD" && !isEnrolled) {
    return <UsdCheckoutSwitch className={className} size={size} />;
  }

  async function startCheckout(guest?: { email: string; fullName: string }) {
    setLoading(true);
    setError(null);
    let redirecting = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CHECKOUT_TIMEOUT_MS);

    try {
      const attrStrings = attributionToPaystackStrings(attribution, checkoutMeta);
      const payload: {
        courseId: string;
        currency: "NGN";
        email?: string;
        fullName?: string;
        attribution?: Record<string, string>;
      } = {
        courseId,
        currency: "NGN",
      };
      if (guest) {
        payload.email = guest.email;
        payload.fullName = guest.fullName;
      }
      if (Object.keys(attrStrings).length) {
        payload.attribution = attrStrings;
      }

      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
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
        if (trackCheckoutStart) {
          void trackProductEvent({
            event: "sales_page_checkout_start",
            courseId,
            metadata: attributionToMetadata(attribution, {
              ...checkoutMeta,
              path: "free_or_existing",
            }),
          });
        }
        setShowCheckoutModal(false);
        redirecting = true;
        window.location.assign(`/courses/${courseId}`);
        return;
      }
      if (json.authorizationUrl) {
        if (trackCheckoutStart) {
          void trackProductEvent({
            event: "sales_page_checkout_start",
            courseId,
            metadata: attributionToMetadata(attribution, {
              ...checkoutMeta,
              path: "paystack",
            }),
          });
        }
        redirecting = true;
        window.location.assign(json.authorizationUrl);
        return;
      }
      throw new Error("Unexpected payment response");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setError("Checkout is taking too long. Please try again.");
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (!redirecting) setLoading(false);
    }
  }

  async function handleClick() {
    if (isEnrolled) {
      router.push(`/courses/${courseId}`);
      return;
    }

    if (!isLoggedIn) {
      setShowCheckoutModal(true);
      setError(null);
      return;
    }

    await startCheckout();
  }

  return (
    <div className={className}>
      {showCheckoutModal ? (
        <CheckoutDetailsModal
          isFree={isFree}
          onClose={() => {
            if (!loading) setShowCheckoutModal(false);
          }}
          onSubmit={(details) => void startCheckout(details)}
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
      {error && !showCheckoutModal ? <p className="mt-2 text-sm text-brand">{error}</p> : null}
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
