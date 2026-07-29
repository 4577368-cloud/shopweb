"use client";

// 订单中心加载骨架屏（P0-7）：数据拉取期间替代表格，避免空白与误读。
export function OrderSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4">
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-7 w-7 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-14 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-right text-[11px] text-ink-subtle">…</p>
    </div>
  );
}
