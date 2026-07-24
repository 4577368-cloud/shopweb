"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "@/lib/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

/** Matches sync page 2-col layout so loading does not feel like an empty panel. */
export function SyncPageSkeleton({
  tierMessages,
}: {
  tierMessages: readonly [string, string];
}) {
  const [tierIndex, setTierIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTierIndex((i) => (i + 1) % tierMessages.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [tierMessages.length]);

  const message = tierMessages[tierIndex] ?? tierMessages[0];

  return (
    <div className="space-y-4" aria-busy aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-accent" />
        {message}
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-h-0 flex-col gap-3">
          <Skeleton className="aspect-[5/4] w-full rounded-[var(--radius-card)]" />
          <Skeleton className="min-h-[220px] flex-1 rounded-[var(--radius-card)]" />
        </div>
        <Skeleton className="min-h-[320px] w-full rounded-[var(--radius-card)] lg:min-h-[380px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-44 rounded-[var(--radius-card)]" />
        <Skeleton className="h-44 rounded-[var(--radius-card)]" />
      </div>
      <Skeleton className="h-28 rounded-[var(--radius-card)]" />
    </div>
  );
}
