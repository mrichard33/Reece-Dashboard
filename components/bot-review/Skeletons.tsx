import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Content-shaped placeholders for the Bot Review tabs.
 *
 * Deliberately mirrors the real layout — queue column, conversation column,
 * scoring column — rather than showing a centered spinner. The page chrome
 * (title, tabs, counts) streams in first and these hold the space beneath it,
 * so the screen never jumps as the data lands.
 */

export function ReviewTabSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-24 w-4/5" />
          <Skeleton className="h-24 w-4/5 self-end" />
          <Skeleton className="h-24 w-4/5" />
        </div>
        <Skeleton className="hidden h-72 w-full lg:block" />
      </div>
    </div>
  );
}

export function TableTabSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-11 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function ScoreboardTabSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
