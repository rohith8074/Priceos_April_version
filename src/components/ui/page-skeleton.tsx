"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton({ variant = "cards" }: { variant?: "cards" | "table" | "chat" | "calendar" }) {
  if (variant === "chat") {
    return (
      <div className="flex h-full w-full overflow-hidden">
        {/* Column 1: List */}
        <div className="w-64 border-r p-4 space-y-4 shrink-0 bg-surface-1/50">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-5 w-24 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          <Skeleton className="h-9 w-full rounded-xl mb-4" />
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-6 w-12 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
        {/* Column 2: Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-surface-0">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
          <div className="flex-1 p-4 space-y-6 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "flex-row" : "flex-row-reverse"}`}>
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className={`space-y-2 flex flex-col ${i % 2 === 0 ? "items-start" : "items-end"}`}>
                  <Skeleton className={`h-16 rounded-2xl ${i % 2 === 0 ? "w-[300px]" : "w-[240px]"}`} />
                  <Skeleton className="h-2 w-16" />
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t">
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>
        {/* Column 3: Details */}
        <div className="w-56 border-l p-4 space-y-6 shrink-0 bg-surface-1/50">
          <div className="flex flex-col items-center gap-3 py-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <div className="space-y-1.5">
                <Skeleton className="h-8 w-full rounded-lg" />
                <Skeleton className="h-8 w-full rounded-lg" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="p-6 space-y-4 w-full">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <div className="rounded-2xl border overflow-hidden">
          <div className="p-3 border-b bg-muted/30 flex gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-3 border-b flex gap-4 items-center">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "calendar") {
    return (
      <div className="p-6 space-y-4 w-full">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded-lg" />
          ))}
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
