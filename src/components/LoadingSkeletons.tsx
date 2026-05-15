import { Skeleton } from "@/components/ui/skeleton";

export function CardSkeleton() {
  return (
    <div className="bg-surface-container border border-border-low p-6 rounded-lg space-y-4">
      <Skeleton className="h-12 w-3/4 bg-surface-highest" />
      <Skeleton className="h-6 w-full bg-surface-highest" />
      <Skeleton className="h-6 w-2/3 bg-surface-highest" />
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 p-4 border border-border-low rounded-lg">
          <Skeleton className="h-12 w-12 rounded bg-surface-highest" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 bg-surface-highest" />
            <Skeleton className="h-3 w-1/2 bg-surface-highest" />
          </div>
          <Skeleton className="h-8 w-24 bg-surface-highest" />
        </div>
      ))}
    </div>
  );
}

export function ModalSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-6 w-1/3 bg-surface-highest" />
        <Skeleton className="h-10 w-full bg-surface-highest rounded-lg" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-1/3 bg-surface-highest" />
        <Skeleton className="h-24 w-full bg-surface-highest rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-1/2 bg-surface-highest" />
          <Skeleton className="h-10 w-full bg-surface-highest rounded-lg" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-6 w-1/2 bg-surface-highest" />
          <Skeleton className="h-10 w-full bg-surface-highest rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="bg-surface-container border border-border-low p-6 rounded-lg space-y-4">
      <div className="flex justify-between items-start">
        <Skeleton className="h-12 w-12 rounded bg-surface-highest" />
        <Skeleton className="h-6 w-20 bg-surface-highest" />
      </div>
      <Skeleton className="h-4 w-3/4 bg-surface-highest" />
      <Skeleton className="h-8 w-1/2 bg-surface-highest" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-1/3 bg-surface-highest" />
      <div className="flex items-end gap-2 h-64">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 bg-surface-highest"
            style={{ height: `${Math.random() * 100 + 50}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <Skeleton className="h-16 w-16 rounded-lg bg-surface-highest" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-3/4 bg-surface-highest" />
          <Skeleton className="h-4 w-1/2 bg-surface-highest" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-1/2 bg-surface-highest" />
            <Skeleton className="h-6 w-full bg-surface-highest" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full bg-surface-highest rounded-lg" />
        ))}
      </div>
    </div>
  );
}
