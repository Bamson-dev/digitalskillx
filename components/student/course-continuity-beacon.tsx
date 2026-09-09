"use client";

import { useEffect } from "react";
import {
  saveContinuityCourse,
  type ContinuityCourseSnapshot,
} from "@/lib/course-continuity/offline-store";

/**
 * Silent beacon: refreshes continuity cookie + caches curriculum locally.
 * Does not change classroom UI.
 */
export function CourseContinuityBeacon({
  courseId,
  snapshot,
}: {
  courseId?: string;
  snapshot?: ContinuityCourseSnapshot | null;
}) {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (snapshot?.id && !cancelled) {
          await saveContinuityCourse({
            ...snapshot,
            updatedAt: snapshot.updatedAt || new Date().toISOString(),
          });
        }
      } catch {
        // offline cache is best-effort
      }

      try {
        await fetch("/api/course-continuity/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            courseIds: courseId ? [courseId] : snapshot?.id ? [snapshot.id] : [],
          }),
        });
      } catch {
        // cookie refresh is best-effort during outages
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [courseId, snapshot]);

  return null;
}
