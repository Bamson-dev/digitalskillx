import { cn } from "@/lib/utils";

export type CurrencyCode = "NGN" | "USD";

export type PricedCourse = {
  price_ngn: number;
  price_usd: number;
};

/** Format an integer Naira amount for display (e.g. ₦25,000). */
export function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format a USD amount (whole dollars or with cents). */
export function formatUsd(amount: number) {
  const hasCents = !Number.isInteger(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPrice(amount: number, currency: CurrencyCode) {
  return currency === "NGN" ? formatNaira(amount) : formatUsd(amount);
}

export function getCoursePrice(course: PricedCourse, currency: CurrencyCode) {
  return currency === "NGN" ? course.price_ngn : course.price_usd;
}

export function isCourseFree(course: PricedCourse, currency: CurrencyCode) {
  return getCoursePrice(course, currency) <= 0;
}

/** Convert Naira to Paystack kobo. */
export function nairaToKobo(naira: number) {
  return Math.round(naira * 100);
}

/** Convert USD to Paystack cents. */
export function usdToCents(usd: number) {
  return Math.round(usd * 100);
}

/** Default currency from browser locale (client only). */
export function detectDefaultCurrency(): CurrencyCode {
  if (typeof window === "undefined") return "NGN";
  try {
    const lang = navigator.language?.toLowerCase() ?? "";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (lang.includes("-ng") || lang === "ng" || tz === "Africa/Lagos") return "NGN";
  } catch {
    // ignore
  }
  return "USD";
}

export const CURRENCY_STORAGE_KEY = "dsx_currency";

/** Segmented toggle pill classes. */
export function currencyToggleClass(active: boolean) {
  return cn(
    "min-h-[36px] min-w-[44px] rounded-md px-3 py-1.5 text-xs font-semibold transition",
    active ? "bg-brand text-white shadow-sm" : "text-neutral-500 hover:text-neutral-800",
  );
}
