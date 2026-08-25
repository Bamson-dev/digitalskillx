"use client";

import { useEffect } from "react";
import Link from "next/link";

function isStaleChunkError(error: Error) {
  const text = `${error.name} ${error.message}`;
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    text,
  );
}

export default function AdminPanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin panel]", error);
    if (!isStaleChunkError(error)) return;
    const key = "dsx-admin-chunk-reload";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold text-neutral-900">Admin page failed to load</h1>
      <p className="text-sm text-muted">
        This often happens after a deploy while the admin tab was left open. Refresh the page and
        try the action again. Campaign sending on the server is not stopped by this screen.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem("dsx-admin-chunk-reload");
            reset();
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Try again
        </button>
        <Link
          href="/admin/dashboard"
          className="rounded-lg border border-app px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-surface-muted"
        >
          Admin home
        </Link>
      </div>
    </div>
  );
}
