"use client";

import { cn } from "@/lib/utils";

export interface SegmentedTabItem {
  id: string;
  label: string;
  count?: number;
}

interface SegmentedTabsProps {
  tabs: SegmentedTabItem[];
  value: string;
  onValueChange: (id: string) => void;
  /**
   * solid — primary section switch (active = filled brand pill), used for the big "优化现有 / 推荐上新"
   *         style tabs.
   * chip  — filter chips with counts (active = brand-soft), used for "全部 / 高匹配 / 需关注" rows.
   */
  variant?: "solid" | "chip";
  className?: string;
  highlighted?: boolean;
  /**
   * chip variant only: override the active chip's classes (e.g. per-page theming).
   * Defaults to the shared `bg-brand-soft text-brand-accent`.
   */
  activeChipClassName?: string;
}

export function SegmentedTabs({
  tabs,
  value,
  onValueChange,
  variant = "solid",
  className,
  highlighted,
  activeChipClassName,
}: SegmentedTabsProps) {
  if (variant === "chip") {
    return (
      <div className={cn(
        "flex flex-wrap items-center gap-1.5 transition-all duration-500",
        highlighted && "ring-2 ring-brand-accent/35 rounded-lg bg-brand-soft/50",
        className
      )}>
        {tabs.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onValueChange(tab.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? (activeChipClassName ?? "bg-[#333333] font-bold text-white")
                  : "bg-surface-muted text-ink-muted hover:text-ink",
                highlighted && active && "ring-1 ring-brand-accent/50"
              )}
            >
              <span className="truncate" title={tab.label}>{tab.label}</span>
              {tab.count != null ? (
                <span className={cn(active ? "" : "text-ink-subtle")}>
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-hairline bg-surface-muted p-0.5 transition-all duration-500",
        highlighted && "ring-2 ring-brand-accent/35",
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onValueChange(tab.id)}
                         className={cn(
                "relative z-10 inline-flex min-w-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-white font-bold text-black shadow-card"
                  : "text-ink-muted hover:text-ink",
                highlighted && active && "ring-1 ring-brand-accent/50"
              )}
            >
              <span className="truncate" title={tab.label}>{tab.label}</span>
            {tab.count != null ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px]",
                  active ? "bg-surface-muted font-medium text-ink-muted" : "bg-slate-200/70 text-ink-muted"
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
