"use client";

import { useEffect } from "react";
import { trackProductEvent } from "@/lib/product-analytics";

/** Track a real course sales-page view once per mount. */
export function CourseViewTracker({ courseId }: { courseId: string }) {
  useEffect(() => {
    void trackProductEvent({ event: "course_view", courseId });
  }, [courseId]);
  return null;
}
