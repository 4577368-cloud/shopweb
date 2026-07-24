"use client";

// 订单状态徽标（Phase 2）：消费 state-machine 的 statusBadge tone。
import { useT } from "@/i18n/LocaleProvider";
import type { OrderStatus } from "@/lib/order/types";
import {
  statusBadge,
  statusLabelKey,
  type BadgeTone,
} from "@/lib/order/state-machine";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "border border-hairline bg-surface text-ink-muted",
  info: "bg-brand-soft text-brand-accent",
  warning: "bg-amber-100 text-amber-700",
  success: "bg-emerald-50 text-emerald-700",
  danger: "bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const t = useT();
  const tone = statusBadge(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        TONE_CLASS[tone]
      )}
    >
      {t(statusLabelKey(status))}
    </span>
  );
}
