"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin]", error);
    if (sessionStorage.getItem("dsx-admin-error-reload") === "1") return;
    sessionStorage.setItem("dsx-admin-error-reload", "1");
    window.location.reload();
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold text-neutral-900">Admin hit a temporary error</h1>
      <p className="text-sm text-muted">
        Reload the page. If this tab has been open since a deploy, a hard refresh clears the stale
        scripts.
      </p>
      <button
        type="button"
        onClick={() => {
          sessionStorage.removeItem("dsx-admin-error-reload");
          reset();
          window.location.assign("/admin/dashboard");
        }}
        className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
      >
        Reload admin
      </button>
    </div>
  );
}
