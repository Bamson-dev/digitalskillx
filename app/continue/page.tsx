import type { Metadata } from "next";
import Link from "next/link";
import { ContinueLearningClient } from "@/components/student/continue-learning-client";

export const metadata: Metadata = {
  title: "Continue learning",
  description: "Keep watching your DigitalSkillX courses when the main classroom has a temporary outage.",
};

/**
 * Public continuity surface — works from the browser cache/IndexedDB even when
 * Auth or Postgres is unhealthy. Does not replace normal /courses when online.
 */
export default function ContinueLearningPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <div className="mb-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Continuity mode
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Keep learning</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          If sign-in or the classroom briefly fails, use the last course copy saved
          on this device. Your enrollment is unchanged.
        </p>
        <div className="flex flex-wrap gap-3 pt-2 text-sm">
          <Link href="/courses" className="font-medium text-primary underline">
            Open My Courses
          </Link>
          <Link href="/login" className="text-muted-foreground underline">
            Sign in
          </Link>
        </div>
      </div>
      <ContinueLearningClient />
    </main>
  );
}
