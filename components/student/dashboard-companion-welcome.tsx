"use client";

import { useEffect } from "react";
import { ClassroomEngagementRoot } from "@/components/student/classroom-engagement-root";
import { dispatchClassroomMoment } from "@/lib/classroom-engagement";

/**
 * Quiet once-per-day dashboard welcome.
 * Not a dance — dancing every dashboard open would feel cheap.
 */
export function DashboardCompanionWelcome() {
  useEffect(() => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const key = `dsx-dashboard-welcome:${day}`;
      if (sessionStorage.getItem(key) || localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore storage */
    }
    const t = window.setTimeout(() => {
      dispatchClassroomMoment("dashboard_welcome", {
        dedupeKey: `dashboard:${new Date().toISOString().slice(0, 10)}`,
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, []);

  return <ClassroomEngagementRoot />;
}
