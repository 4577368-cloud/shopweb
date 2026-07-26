// 成本标记（免费 / 已缓存 / 计费）——让用户在运营中心一眼看出哪些调用是免费的。
// 设计约束：用户强调"多用免费和低调用"，故免费服务必须有清晰可见的前端标记。
"use client";

import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

interface CostBadgeProps {
  /** 命中 pipispy 免费接口（如 competition/products，0 积分）。 */
  free?: boolean;
  /** 命中会话缓存，未真正调用 pipispy（不烧额度）。 */
  cached?: boolean;
  /** 计费调用消耗的积分（cached/free 都不传）。 */
  points?: number;
  className?: string;
}

const TONE: Record<"free" | "cached" | "paid", string> = {
  free: "bg-success-soft text-success",
  cached: "bg-muted text-ink-muted",
  paid: "bg-warning-soft text-warning",
};

export function CostBadge({ free, cached, points, className }: CostBadgeProps) {
  const t = useT();
  const kind: "free" | "cached" | "paid" = free ? "free" : cached ? "cached" : "paid";
  const label =
    kind === "free"
      ? t("ops.cost.free")
      : kind === "cached"
        ? t("ops.cost.cached")
        : t("ops.cost.paid", { n: points ?? 0 });
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
        TONE[kind],
        className
      )}
    >
      {label}
    </span>
  );
}
