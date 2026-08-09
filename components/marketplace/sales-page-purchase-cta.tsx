"use client";

import { EnrollButton } from "@/components/marketplace/enroll-button";
import { trackProductEvent } from "@/lib/product-analytics";
import {
  attributionToMetadata,
  captureSalesAttribution,
  getSalesAttribution,
} from "@/lib/sales-attribution";

/**
 * DigitalSkillX-native purchase CTA.
 * Always uses the existing EnrollButton → Paystack/checkout/enrollment path.
 * Never follows imported WordPress payment URLs.
 */
export function SalesPagePurchaseCta({
  courseId,
  salesPageId,
  priceNgn,
  priceUsd,
  isEnrolled,
  isLoggedIn,
  label,
  comingSoon,
  className,
  ctaId = "default",
  sectionId,
  sectionType = "cta",
}: {
  courseId: string;
  salesPageId?: string;
  priceNgn: number;
  priceUsd: number;
  isEnrolled: boolean;
  isLoggedIn: boolean;
  label?: string;
  comingSoon?: boolean;
  className?: string;
  /** Stable CTA location id e.g. hero | pricing | final */
  ctaId?: string;
  sectionId?: string;
  sectionType?: string;
}) {
  const attr = captureSalesAttribution({
    course_id: courseId,
    sales_page_id: salesPageId,
  });

  return (
    <div
      onClickCapture={() => {
        void trackProductEvent({
          event: "sales_page_cta_click",
          courseId,
          metadata: attributionToMetadata(attr, {
            cta_id: ctaId,
            section_id: sectionId ?? null,
            section_type: sectionType,
          }),
        });
      }}
    >
      <EnrollButton
        courseId={courseId}
        priceNgn={priceNgn}
        priceUsd={priceUsd}
        isEnrolled={isEnrolled}
        isLoggedIn={isLoggedIn}
        label={label}
        comingSoon={comingSoon}
        className={className}
        attribution={getSalesAttribution() ?? attr}
        trackCheckoutStart
        checkoutMeta={{
          cta_id: ctaId,
          section_id: sectionId,
          section_type: sectionType,
          sales_page_id: salesPageId,
        }}
      />
    </div>
  );
}
