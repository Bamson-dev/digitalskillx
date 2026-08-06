import type { Metadata } from "next";
import { Suspense } from "react";
import { EnrollmentSuccessClient } from "@/components/enrollment/enrollment-success-client";

export const metadata: Metadata = { title: "Welcome" };

export default function EnrollmentSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 to-white">
      <header className="border-b border-app/60 bg-white/70 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-3xl font-display text-lg font-bold tracking-tight">
          DigitalSkillX
        </div>
      </header>
      <Suspense fallback={<p className="p-10 text-center text-sm text-muted">Loading…</p>}>
        <EnrollmentSuccessClient />
      </Suspense>
    </div>
  );
}
