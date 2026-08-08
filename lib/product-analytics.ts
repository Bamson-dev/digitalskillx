/**
 * First-party funnel analytics (Experience 2.0 Phase I).
 * Never invent metrics — only emit when a real user action occurs.
 */

export type ProductEventName =
  | "course_view"
  | "recommendation_click"
  | "browse_view"
  | "enroll_cta_click"
  | "certificate_view";

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
