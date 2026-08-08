import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

/** Experience 2.0 — shared Skeleton for marketplace browse. */
export default function BrowseLoading() {
  return (
    <div className="mx-auto max-w-[1120px] space-y-8 px-4 py-10 sm:px-8">
      <Skeleton className="h-9 w-48" />
      <SkeletonLines lines={2} className="max-w-md" />
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
