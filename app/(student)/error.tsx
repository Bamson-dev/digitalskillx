"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[student route]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold text-neutral-900">Something went wrong</h1>
      <p className="text-sm text-muted">
        We couldn&apos;t load this page. Your progress is safe — try again, or return to your courses.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Try again
        </button>
        <Link
          href="/courses"
          className="rounded-lg border border-app px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-surface-muted"
        >
          My courses
        </Link>
      </div>
    </div>
  );
}
