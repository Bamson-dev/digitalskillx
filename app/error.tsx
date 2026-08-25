"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app]", error);
    const admin = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
    if (!admin) return;
    if (sessionStorage.getItem("dsx-app-admin-reload") === "1") return;
    sessionStorage.setItem("dsx-app-admin-reload", "1");
    window.location.reload();
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-bold">This page failed to load</h1>
        <p className="mt-2 text-sm text-neutral-600">Try again, or go back to the previous screen.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
