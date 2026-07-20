"use client";

import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Top "AI task status" card for /products. Answers "AI 帮我做了什么、还剩什么".
 * Primary CTA lives only in the page header; refresh sits next to this card's title.
 */
export interface AiTaskStatusProps {
  ready: boolean;
  analyzed: number;
  /** bound = pending + confirmed (products AI has matched a source for) */
  matched: number;
  pending: number;
  confirmed: number;
  unbound: number;
  /** Re-run analysis (sync + auto-match). Rendered as icon-only next to the title. */
  onRefresh?: () => void;
}

export function AiTaskStatus({
  ready,
  analyzed,
  matched,
  pending,
  confirmed,
  unbound,
  onRefresh,
}: AiTaskStatusProps) {
  const pct = analyzed > 0 ? Math.round((matched / analyzed) * 100) : 0;
  const allDone = ready && analyzed > 0 && pending === 0 && unbound === 0;

  return (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
            {ready ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </span>
          <h2 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-ink">
            {ready ? "AI 已完成店铺商品分析" : "正在分析店铺商品…"}
          </h2>
          {onRefresh ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              className="h-8 w-8 shrink-0 px-0"
              title="重新分析（同步商品并自动关联货源）"
              aria-label="重新分析"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>

        <p className="mt-1.5 text-sm text-ink-muted">
          {ready ? (
            <>
              已分析 <strong className="font-semibold text-ink">{analyzed}</strong> 个商品 · 自动匹配{" "}
              <strong className="font-semibold text-ink">{matched}</strong> 个 · 待确认{" "}
              <strong
                className={
                  pending > 0 ? "font-semibold text-amber-600" : "font-semibold text-ink"
                }
              >
                {pending}
              </strong>{" "}
              个
            </>
          ) : (
            "正在读取店铺商品与货源关联…"
          )}
        </p>
      </div>

      <div className="mt-3.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500"
            style={{ width: `${ready ? pct : 0}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-subtle">
          <span>
            {ready ? `${pct}% 已匹配货源` : "读取中…"}
            {allDone ? " · 货源已就绪" : ""}
          </span>
          <span>已确认 {ready ? confirmed : "—"}</span>
          <span>未匹配 {ready ? unbound : "—"}</span>
        </div>
      </div>
    </section>
  );
}
