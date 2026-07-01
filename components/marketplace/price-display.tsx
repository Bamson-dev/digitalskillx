"use client";

import { useCurrency } from "@/components/providers/currency-provider";
import { formatNaira, formatUsd, type PricedCourse } from "@/lib/currency";
import { cn } from "@/lib/utils";

export function PriceDisplay({
  course,
  className,
}: {
  course: PricedCourse;
  className?: string;
}) {
  const { formatCoursePrice } = useCurrency();
  return <span className={cn(className)}>{formatCoursePrice(course)}</span>;
}

/** Featured block: show both NGN and USD like the design reference. */
export function DualPriceDisplay({
  course,
  className,
}: {
  course: PricedCourse;
  className?: string;
}) {
  const ngn = course.price_ngn <= 0 ? "Free" : formatNaira(course.price_ngn);
  const usd = course.price_usd <= 0 ? "Free" : formatUsd(course.price_usd);
  return (
    <span className={cn("font-bold text-neutral-900", className)}>
      {ngn}
      <span className="mx-2 font-normal text-neutral-400">/</span>
      {usd} USD
    </span>
  );
}
