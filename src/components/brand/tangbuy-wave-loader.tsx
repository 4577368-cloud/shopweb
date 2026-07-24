"use client";

import { cn } from "@/lib/utils";

const BRAND_TITLE = "Tangbuy";
const BRAND_SUBTITLE = "Smart Match";

export function TangbuyWaveLoader({
  className,
  compact = false,
  label,
}: {
  className?: string;
  compact?: boolean;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center",
        compact ? "gap-2 py-16" : "min-h-[40vh] gap-3 py-24",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
    >
      <h2
        className={cn(
          "font-bold tracking-tight text-ink",
          compact ? "text-xl" : "text-3xl"
        )}
      >
        {BRAND_TITLE}
      </h2>
      <p
        className={cn(
          "animate-tangbuy-breathe font-medium tracking-wide text-brand-strong",
          compact ? "text-xs" : "text-sm"
        )}
      >
        {BRAND_SUBTITLE}
      </p>
    </div>
  );
}
