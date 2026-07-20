"use client";

import type { RecommendedCategory } from "@/lib/catalog-sourcing-types";
import { cn } from "@/lib/utils";

export interface RecommendedCategoryChipsProps {
  categories: RecommendedCategory[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear?: () => void;
  className?: string;
}

export function RecommendedCategoryChips({
  categories,
  selectedIds,
  onToggle,
  onClear,
  className,
}: RecommendedCategoryChipsProps) {
  if (!categories.length) return null;
  const hasSelection = selectedIds.length > 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-[11px] text-ink-subtle">推荐类目</span>
      {categories.map((c) => {
        const active = selectedIds.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-brand text-white"
                : "bg-brand-soft text-brand-strong hover:bg-brand/15"
            )}
          >
            {c.name}
            {c.count > 0 ? (
              <span className={cn("text-[10px]", active ? "text-white/80" : "text-brand/70")}>
                {Math.round(c.share * 100)}%
              </span>
            ) : null}
          </button>
        );
      })}
      {hasSelection && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] font-medium text-ink-muted hover:text-ink"
        >
          取消推荐筛选
        </button>
      ) : null}
    </div>
  );
}
