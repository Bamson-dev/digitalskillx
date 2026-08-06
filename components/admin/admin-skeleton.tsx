"use client";

import { cn } from "@/lib/utils";

/** Lightweight skeleton blocks for admin loading states. */
export function AdminSkeleton({
  className,
  lines = 4,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={cn("animate-pulse space-y-3", className)} aria-busy="true" aria-live="polite">
      <div className="h-7 w-48 rounded-md bg-slate-200/80" />
      <div className="h-4 w-72 rounded-md bg-slate-100" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-lg bg-slate-100"
          style={{ width: `${88 - i * 8}%` }}
        />
      ))}
    </div>
  );
}

export function AdminTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-app bg-white" aria-busy="true">
      <div className="border-b border-app bg-surface-muted/40 px-4 py-3">
        <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="divide-y divide-app">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3">
            <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}

export function AdminLoadingBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-app bg-white px-4 py-3 text-sm text-muted">
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent"
        aria-hidden
      />
      <span>{message}</span>
    </div>
  );
}
