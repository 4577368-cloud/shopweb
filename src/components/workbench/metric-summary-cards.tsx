import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MetricTone = "default" | "brand" | "warning" | "neutral";

export interface MetricSummaryItem {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: MetricTone;
}

const iconToneMap: Record<MetricTone, string> = {
  default: "bg-slate-100 text-slate-500",
  brand: "bg-brand-soft text-brand-accent",
  warning: "bg-amber-50 text-amber-600",
  neutral: "bg-slate-100 text-slate-400",
};

interface MetricSummaryCardsProps {
  items: MetricSummaryItem[];
  className?: string;
  /**
   * 在 lg 断点（≥1024px）以上的列数。省略时按 items.length 推断默认 4。
   * 例如订单中心 6 张状态卡：传 `columns={6}` 即 lg 起一行 6 列。
   * 卡片最小宽由 grid 子项 min-w-0 + 父容器 grid-cols-N 决定，调用方保证在常见 lg 视口下不挤。
   */
  columns?: number;
}

// Tailwind JIT 需要字面量类名；列出所有可能用到的 lg:grid-cols-N。
// 新增列数请同步追加。
const LG_COL_CLASS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
  7: "lg:grid-cols-7",
  8: "lg:grid-cols-8",
  9: "lg:grid-cols-9",
  10: "lg:grid-cols-10",
  11: "lg:grid-cols-11",
  12: "lg:grid-cols-12",
};

// 中等屏（sm-lg）默认列数：N 小时 2 列，N 大时 3 列，避免卡片过宽。
function smColClass(n: number): string {
  if (n <= 2) return "sm:grid-cols-2";
  if (n <= 4) return "sm:grid-cols-2";
  if (n <= 6) return "sm:grid-cols-3";
  return "sm:grid-cols-4";
}

/**
 * The KPI summary strip used at the top of the work area (prototypes: /sku-align 4 counts).
 * Compact cards: value + label on one line, optional hint below, tinted icon bubble.
 */
export function MetricSummaryCards({ items, className, columns }: MetricSummaryCardsProps) {
  const lgClass =
    LG_COL_CLASS[columns ?? Math.min(4, items.length)] ?? "lg:grid-cols-4";
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2",
        smColClass(items.length),
        lgClass,
        className
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between gap-2 rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2 shadow-card"
        >
          <div className="min-w-0">
            <p className="flex min-w-0 items-baseline gap-1.5 leading-tight">
              <span className="shrink-0 text-lg font-semibold tabular-nums tracking-tight text-ink">
                {item.value}
              </span>
              <span className="truncate text-xs text-ink-muted">{item.label}</span>
            </p>
            {item.hint ? (
              <p className="mt-0.5 truncate text-[11px] leading-snug text-ink-subtle">
                {item.hint}
              </p>
            ) : null}
          </div>
          {item.icon ? (
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                iconToneMap[item.tone ?? "default"]
              )}
            >
              {item.icon}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
