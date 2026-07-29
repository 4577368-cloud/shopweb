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
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-destructive-soft text-destructive",
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
