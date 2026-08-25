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
  void reset;
  useEffect(() => {
    Sentry.captureException(error);
    const key = "dsx-global-error-reload";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-white p-6 text-neutral-900">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-neutral-600">An unexpected error occurred. Please try again.</p>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem("dsx-global-error-reload");
              window.location.assign("/admin/dashboard");
            }}
            className="mt-6 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Reload admin
          </button>
        </div>
      </body>
    </html>
  );
}
