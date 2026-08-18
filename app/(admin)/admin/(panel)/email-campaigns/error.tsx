"use client";

import { useEffect } from "react";

export default function EmailCampaignsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[email-campaigns]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold text-neutral-900">Could not load email campaigns</h1>
      <p className="text-sm text-muted">
        The page hit a server timeout or error. Refresh, then use Start sending to all students.
        Do not use Enroll this list only for the full student list.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Try again
      </button>
    </div>
  );
}
