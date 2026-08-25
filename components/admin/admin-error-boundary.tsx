"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { crashed: boolean };

/**
 * Catches client errors inside the admin chrome (stale chunks after deploy).
 * Layout errors are not handled by error.tsx in the same segment.
 */
export class AdminErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error) {
    console.error("[admin shell]", error);
    const stale = /ChunkLoadError|Loading chunk|dynamically imported module/i.test(
      `${error.name} ${error.message}`,
    );
    if (!stale || typeof window === "undefined") return;
    if (sessionStorage.getItem("dsx-admin-shell-reload") === "1") return;
    sessionStorage.setItem("dsx-admin-shell-reload", "1");
    window.location.reload();
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center">
          <div className="max-w-md">
            <h1 className="text-xl font-bold text-neutral-900">Admin needs a fresh load</h1>
            <p className="mt-2 text-sm text-neutral-600">
              The admin tab was holding an old version after a deploy. Reload and continue. Sending
              on the server is not affected.
            </p>
            <button
              type="button"
              className="mt-6 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
              onClick={() => {
                sessionStorage.removeItem("dsx-admin-shell-reload");
                window.location.assign("/admin/dashboard");
              }}
            >
              Reload admin
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
