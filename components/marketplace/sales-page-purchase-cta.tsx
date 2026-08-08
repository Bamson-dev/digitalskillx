"use client";

import { EnrollButton } from "@/components/marketplace/enroll-button";

/**
 * DigitalSkillX-native purchase CTA.
 * Always uses the existing EnrollButton → Paystack/checkout/enrollment path.
 * Never follows imported WordPress payment URLs.
 */
export function SalesPagePurchaseCta({
  courseId,
  priceNgn,
  priceUsd,
  isEnrolled,
  isLoggedIn,
  label,
  comingSoon,
  className,
}: {
  courseId: string;
  priceNgn: number;
  priceUsd: number;
  isEnrolled: boolean;
  isLoggedIn: boolean;
  label?: string;
  comingSoon?: boolean;
  className?: string;
}) {
  return (
    <EnrollButton
      courseId={courseId}
      priceNgn={priceNgn}
      priceUsd={priceUsd}
      isEnrolled={isEnrolled}
      isLoggedIn={isLoggedIn}
      label={label}
      comingSoon={comingSoon}
      className={className}
    />
  );
}
