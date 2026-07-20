"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecommendedCategory } from "@/lib/catalog-sourcing-types";
import { cn } from "@/lib/utils";

export interface SmartSourcingSummaryBarProps {
  ready: boolean;
  analyzed: number;
  matched: number;
  pending: number;
  unbound: number;
  recommendedCategories: RecommendedCategory[];
  onRefresh?: () => void;
  onViewDetails?: () => void;
  className?: string;
}

/** Lightweight Shopify analysis strip for the「我的shopify」tab context. */
export function SmartSourcingSummaryBar({
  ready,
  analyzed,
  matched,
  pending,
  unbound,
  recommendedCategories,
  onRefresh,
  onViewDetails,
  className,
}: SmartSourcingSummaryBarProps) {
  const pct = analyzed > 0 ? Math.round((matched / analyzed) * 100) : 0;
  const topCats = recommendedCategories.slice(0, 3);

  return (
    <section
      className={cn(
        "rounded-[var(--radius-control)] border border-hairline bg-surface/80 px-3 py-2",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-xs leading-5 text-ink-muted">
          {ready ? (
            <>
              已分析 <span className="font-semibold text-ink">{analyzed}</span>
              {" · "}
              自动匹配 <span className="font-semibold text-ink">{matched}</span>
              {" · "}
              待确认{" "}
              <span
                className={
                  pending > 0 ? "font-semibold text-amber-600" : "font-semibold text-ink"
                }
              >
                {pending}
              </span>
              {" · "}
              未匹配 <span className="font-semibold text-ink">{unbound}</span>
              {topCats.length ? (
                <>
                  {" · 推荐 "}
                  {topCats.map((c, i) => (
                    <span key={c.id} className="text-ink">
                      {i > 0 ? " / " : ""}
                      {c.name}
                    </span>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
              正在分析店铺商品…
            </span>
          )}
        </p>

        <div className="flex shrink-0 items-center gap-1.5">
          {onViewDetails ? (
            <button
              type="button"
              onClick={onViewDetails}
              className="text-[11px] font-medium text-brand-strong hover:underline"
            >
              查看详情
            </button>
          ) : null}
          {onRefresh ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              className="h-7 w-7 px-0"
              title="重新分析"
              aria-label="重新分析"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${ready ? pct : 0}%` }}
        />
      </div>
    </section>
  );
}
