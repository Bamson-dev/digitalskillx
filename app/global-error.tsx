"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-white p-6 text-neutral-900">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-neutral-600">An unexpected error occurred. Please try again.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
