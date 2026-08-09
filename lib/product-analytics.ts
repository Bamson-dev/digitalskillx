/**
 * First-party funnel analytics.
 * Never invent metrics — only emit when a real user action occurs.
 * Never send payment credentials, cards, secrets, passwords, or tokens.
 */

export type ProductEventName =
  | "course_view"
  | "recommendation_click"
  | "browse_view"
  | "enroll_cta_click"
  | "certificate_view"
  | "sales_page_view"
  | "sales_page_cta_click"
  | "sales_page_checkout_start"
  | "sales_page_purchase"
  | "sales_page_lead_capture"
  | "sales_page_scroll_depth"
  | "sales_page_section_view"
  | "product_recommendation_view"
  | "product_recommendation_click"
  | "upsell_view"
  | "upsell_click"
  | "product_viewed"
  | "offer_viewed"
  | "offer_cta_clicked"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_abandoned"
  | "recommendation_viewed"
  | "upsell_viewed"
  | "upsell_accepted"
  | "upsell_declined"
  | "course_completed"
  | "product_purchased";

export const PRODUCT_EVENT_NAMES: readonly ProductEventName[] = [
  "course_view",
  "recommendation_click",
  "browse_view",
  "enroll_cta_click",
  "certificate_view",
  "sales_page_view",
  "sales_page_cta_click",
  "sales_page_checkout_start",
  "sales_page_purchase",
  "sales_page_lead_capture",
  "sales_page_scroll_depth",
  "sales_page_section_view",
  "product_recommendation_view",
  "product_recommendation_click",
  "upsell_view",
  "upsell_click",
  // Phase 8 funnel names (aliases of legacy sales_page_* where applicable)
  "product_viewed",
  "offer_viewed",
  "offer_cta_clicked",
  "checkout_started",
  "checkout_completed",
  "checkout_abandoned",
  "recommendation_viewed",
  "upsell_viewed",
  "upsell_accepted",
  "upsell_declined",
  "course_completed",
  "product_purchased",
] as const;

export type ProductEventPayload = {
  event: ProductEventName;
  courseId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function trackProductEvent(payload: ProductEventPayload): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      event: payload.event,
      courseId: payload.courseId ?? null,
      metadata: payload.metadata ?? {},
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/event", blob);
      return;
    }
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    /* analytics must never break UX */
  }
}
