"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CURRENCY_STORAGE_KEY,
  type CurrencyCode,
  detectDefaultCurrency,
  formatPrice,
  getCoursePrice,
  isCourseFree,
  type PricedCourse,
} from "@/lib/currency";

type CurrencyContextValue = {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  formatCoursePrice: (course: PricedCourse) => string;
  coursePrice: (course: PricedCourse) => number;
  courseIsFree: (course: PricedCourse) => boolean;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>("NGN");

  useEffect(() => {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY) as CurrencyCode | null;
    if (stored === "NGN" || stored === "USD") {
      setCurrencyState(stored);
    } else {
      setCurrencyState(detectDefaultCurrency());
    }
  }, []);

  const setCurrency = useCallback((code: CurrencyCode) => {
    setCurrencyState(code);
    localStorage.setItem(CURRENCY_STORAGE_KEY, code);
  }, []);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
      formatCoursePrice: (course) => {
        const amount = getCoursePrice(course, currency);
        return amount <= 0 ? "Free" : formatPrice(amount, currency);
      },
      coursePrice: (course) => getCoursePrice(course, currency),
      courseIsFree: (course) => isCourseFree(course, currency),
    }),
    [currency, setCurrency],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
