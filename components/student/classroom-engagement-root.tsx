"use client";

import dynamic from "next/dynamic";
import "@/styles/classroom-motion.css";

const ClassroomMomentHost = dynamic(
  () =>
    import("@/components/student/classroom-moment-host").then((m) => m.ClassroomMomentHost),
  { ssr: false, loading: () => null },
);

/** Lazy-loads companion + motion CSS only when the classroom mounts. */
export function ClassroomEngagementRoot({
  companionEnabled = true,
  celebrationsEnabled = true,
}: {
  companionEnabled?: boolean;
  celebrationsEnabled?: boolean;
}) {
  return (
    <ClassroomMomentHost
      companionEnabled={companionEnabled}
      celebrationsEnabled={celebrationsEnabled}
    />
  );
}
