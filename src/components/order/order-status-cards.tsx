"use client";

// 订单中心顶部状态卡行（参考图风格：图标 + 计数 + 昨日 delta）。
// 6 张高密度汇总卡：全部 / 待下单 / 待支付 / 备货中 / 待发货 / 已送达。
// 「待支付」= 待补款 + 待支付合计（贴近"需要金钱动作"的语义）。
// 点击切到对应 Tab；active 卡 brand-accent 边框。
import type { ReactNode } from "react";
import { useT } from "@/i18n/LocaleProvider";
import type { OrderStatus } from "@/lib/order/types";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  Package,
  ShoppingBag,
  Truck,
  CheckCircle2,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

type TabKey = OrderStatus | "all";

type Tone = "brand" | "info" | "warning" | "neutral" | "success";

interface CardSpec {
  key: TabKey;
  icon: ReactNode;
  labelKey: string;
  tone: Tone;
}

const TONE: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-accent",
  info: "bg-sky-50 text-sky-600",
  warning: "bg-amber-50 text-amber-600",
  neutral: "bg-slate-100 text-slate-500",
  success: "bg-emerald-50 text-emerald-600",
};

const CARDS: CardSpec[] = [
  { key: "all", icon: <ShoppingBag className="h-4 w-4" />, labelKey: "order.all", tone: "brand" },
  { key: "pendingOrder", icon: <Clock className="h-4 w-4" />, labelKey: "order.tabs.pendingOrder", tone: "info" },
  { key: "pendingPayment", icon: <Coins className="h-4 w-4" />, labelKey: "order.tabs.pendingPayment", tone: "warning" },
  { key: "preparing", icon: <Package className="h-4 w-4" />, labelKey: "order.tabs.preparing", tone: "neutral" },
  { key: "pendingShipment", icon: <Truck className="h-4 w-4" />, labelKey: "order.tabs.pendingShipment", tone: "info" },
  { key: "delivered", icon: <CheckCircle2 className="h-4 w-4" />, labelKey: "order.tabs.delivered", tone: "success" },
];

function valueFor(cardKey: TabKey, allCount: number, byStatus: Record<OrderStatus, number>): number {
  if (cardKey === "all") return allCount;
  if (cardKey === "pendingPayment") {
    return (byStatus.pendingSupplement ?? 0) + (byStatus.pendingPayment ?? 0);
  }
  return byStatus[cardKey as OrderStatus] ?? 0;
}

export interface OrderStatusCardsProps {
  counts: { all: number; byStatus: Record<OrderStatus, number> };
  // mock 阶段硬编码的「较昨日」涨跌幅；真实接入后由接口注入
  deltas: Partial<Record<TabKey, number>>;
  activeTab: TabKey;
  onTabChange: (k: TabKey) => void;
}

export function OrderStatusCards({
  counts,
  deltas,
  activeTab,
  onTabChange,
}: OrderStatusCardsProps) {
  const t = useT();
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {CARDS.map((card) => {
        const isActive = activeTab === card.key;
        const value = valueFor(card.key, counts.all, counts.byStatus);
        const delta = deltas[card.key];
        const up = delta === undefined ? true : delta >= 0;
        return (
          <button
            type="button"
            key={card.key}
            onClick={() => onTabChange(card.key)}
            className={cn(
              "flex items-center gap-2 rounded-[var(--radius-card)] border bg-surface px-2.5 py-2 text-left transition-colors",
              isActive
                ? "border-brand-accent ring-1 ring-brand-ring"
                : "border-hairline hover:border-brand/40"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                TONE[card.tone]
              )}
            >
              {card.icon}
            </span>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5">
              <span className="truncate text-xs font-medium text-ink-muted">
                {t(card.labelKey)}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-base font-semibold tabular-nums tracking-tight text-ink leading-none">
                  {value.toLocaleString()}
                </span>
                {delta !== undefined && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-px rounded-full px-1 py-0.5 text-[10px] font-medium tabular-nums leading-none",
                      up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}
                  >
                    {up ? (
                      <ChevronUp className="h-2.5 w-2.5" />
                    ) : (
                      <ChevronDown className="h-2.5 w-2.5" />
                    )}
                    {Math.abs(delta).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}