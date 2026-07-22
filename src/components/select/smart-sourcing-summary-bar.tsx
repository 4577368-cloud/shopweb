"use client";

import { Loader2, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecommendedCategory } from "@/lib/catalog-sourcing-types";
import { cn } from "@/lib/utils";

export interface SmartSourcingSummaryBarProps {
  ready: boolean;
  analyzed: number;
  matched: number;
  pending: number;
  unbound: number;
  /** New mirror rows since last scan/sync baseline, not yet image-matched. */
  pendingNewAnalysis?: number;
  recommendedCategories: RecommendedCategory[];
  onRefresh?: () => void;
  onViewDetails?: () => void;
  /** Jump to new-arrival filter in the product list. */
  onViewNewArrivals?: () => void;
  /** Disable new-arrival CTA while any batch link run is active. */
  batchLinkBusy?: boolean;
  className?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

/** Lightweight Shopify analysis strip for the「我的shopify」tab context. */
export function SmartSourcingSummaryBar({
  ready,
  analyzed,
  matched,
  pending,
  unbound,
  pendingNewAnalysis = 0,
  recommendedCategories,
  onRefresh,
  onViewDetails,
  onViewNewArrivals,
  batchLinkBusy = false,
  className,
  searchQuery = "",
  onSearchChange,
}: SmartSourcingSummaryBarProps) {
  const topCats = recommendedCategories.slice(0, 3);

  return (
    <section
      className={cn(
        "rounded-[var(--radius-control)] border border-hairline bg-surface/80 px-3 py-1.5",
        className
      )}
    >
      <div className="flex items-center gap-x-2 gap-y-1">
        {ready ? (
          <div className="hidden min-w-[12rem] flex-1 overflow-hidden rounded-full bg-surface-muted sm:block">
            <div className="flex h-1.5 rounded-full">
              <div
                className="rounded-l-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${analyzed > 0 ? (matched - pending) / analyzed * 100 : 0}%` }}
                title={`已确认 ${matched - pending}`}
              />
              <div
                className="bg-amber-400 transition-all duration-500"
                style={{ width: `${analyzed > 0 ? pending / analyzed * 100 : 0}%` }}
                title={`待确认 ${pending}`}
              />
              <div
                className="rounded-r-full bg-slate-400 transition-all duration-500"
                style={{ width: `${analyzed > 0 ? unbound / analyzed * 100 : 0}%` }}
                title={`未关联 ${unbound}`}
              />
            </div>
          </div>
        ) : null}

        <p className="ml-auto hidden shrink-0 text-xs leading-5 text-ink-muted sm:block">
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

        {onSearchChange ? (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索商品标题/SKU…"
              className="h-7 w-44 rounded-[var(--radius-control)] border border-hairline bg-surface pl-7 pr-2 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-1.5">
          {onViewDetails ? (
            <button
              type="button"
              onClick={onViewDetails}
              className="hidden text-[11px] font-medium text-brand-strong hover:underline sm:inline"
            >
              查看详情
            </button>
          ) : null}
          {onRefresh && !batchLinkBusy ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              className="h-7 w-7 px-0"
              title="重新分析（同步商品并匹配货源）"
              aria-label="重新分析"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <p className="mt-1 text-xs leading-5 text-ink-muted sm:hidden">
        {ready ? (
          <>
            已分析 {analyzed} · 匹配 {matched} · 待确认 {pending} · 未匹配 {unbound}
          </>
        ) : (
          "正在分析店铺商品…"
        )}
      </p>

      {ready && pendingNewAnalysis > 0 && !batchLinkBusy ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50/80 px-2.5 py-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-sky-900">
            <span className="font-semibold">{pendingNewAnalysis} 个新商品</span>
            已入库，进入页面后将在当前页自动一键关联（主图就绪后执行）。
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {onViewNewArrivals ? (
              <button
                type="button"
                onClick={onViewNewArrivals}
                className="text-[11px] font-medium text-sky-800 underline underline-offset-2 hover:text-sky-950"
              >
                查看新商品
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
