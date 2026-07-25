// 运营中心 · 指标磁贴（Metric Tile）。语义化、轻量、可复用。
// 用于概览条、详情抽屉的指标网格，让数据"密集且规整"。

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "brand" | "success" | "warning" | "danger" | "info";

const TONE: Record<Tone, { box: string; value: string; icon: string }> = {
  default: { box: "bg-surface-muted", value: "text-ink", icon: "text-ink-muted" },
  brand: { box: "bg-brand-soft", value: "text-brand", icon: "text-brand" },
  success: { box: "bg-success-soft", value: "text-success", icon: "text-success" },
  warning: { box: "bg-warning-soft", value: "text-warning", icon: "text-warning" },
  danger: { box: "bg-destructive-soft", value: "text-destructive", icon: "text-destructive" },
  info: { box: "bg-info-soft", value: "text-info", icon: "text-info" },
};

interface MetricTileProps {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  className?: string;
}

export function MetricTile({ icon, label, value, sub, tone = "default", className }: MetricTileProps) {
  const t = TONE[tone];
  return (
    <div className={cn("flex flex-col gap-1 rounded-[var(--radius-card)] border border-hairline px-3 py-2.5", t.box, className)}>
      <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        {icon && <span className={cn("inline-flex", t.icon)}>{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("text-lg font-semibold leading-none tabular-nums", t.value)}>{value}</div>
      {sub != null && <div className="text-[11px] text-ink-subtle">{sub}</div>}
    </div>
  );
}
