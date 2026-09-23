"use client";

import { useEffect, useRef } from "react";

/** Records one deduped course view per learner/device per day. */
export function LearnCourseViewTracker({ learningPathId }: { learningPathId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !learningPathId) return;
    fired.current = true;
    void fetch("/api/learn/analytics/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learningPathId }),
      credentials: "same-origin",
    }).catch(() => {
      /* non-blocking */
    });
  }, [learningPathId]);

  return null;
}
