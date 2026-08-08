import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

/** Experience 2.0 — shared Skeleton for student dashboard. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-10" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-8 w-72 max-w-full" />
        <SkeletonLines lines={1} className="max-w-sm" />
      </div>
      <div className="flex gap-5 border-b border-neutral-200 pb-10">
        <Skeleton className="hidden h-28 w-40 shrink-0 rounded-none sm:block" />
        <div className="min-w-0 flex-1 space-y-4">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-2 w-full max-w-xs" />
          <Skeleton className="h-11 w-36 rounded-none" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-16 w-full rounded-none" />
        <Skeleton className="h-16 w-full rounded-none" />
      </div>
    </div>
  );
}
