// 订单状态机工具（Phase 1 数据层）
import type { OrderStatus, OrderSummary } from "./types";

// 状态主轴顺序（待下单 → … → 已送达；已取消在末尾作为旁路）
export const STATUS_ORDER: OrderStatus[] = [
  "pendingOrder",
  "pendingSupplement",
  "pendingPayment",
  "preparing",
  "pendingShipment",
  "inTransit",
  "delivered",
  "canceled",
];

export const ALL_VIEW_KEY = "all" as const;
export type TabKey = OrderStatus | typeof ALL_VIEW_KEY;

// i18n 键（调用方用 t(statusLabelKey(s)) 取标签）
export function statusLabelKey(s: OrderStatus): string {
  return `order.tabs.${s}`;
}

export type BadgeTone = "neutral" | "info" | "warning" | "success" | "danger";

// 状态徽标色级（供 UI 用）
export function statusBadge(s: OrderStatus): BadgeTone {
  switch (s) {
    case "pendingOrder":
      return "info";
    case "pendingSupplement":
    case "pendingPayment":
      return "warning";
    case "preparing":
      return "neutral";
    case "pendingShipment":
    case "inTransit":
      return "info";
    case "delivered":
      return "success";
    case "canceled":
      return "danger";
  }
}

// 下一状态（线性推进；canceled 无下一）
export function nextStatus(s: OrderStatus): OrderStatus | null {
  const i = STATUS_ORDER.indexOf(s);
  if (i < 0 || i >= STATUS_ORDER.length - 2) return null; // 末两位是 delivered/canceled
  const nxt = STATUS_ORDER[i + 1];
  return nxt === "canceled" ? null : nxt;
}

// 各状态订单计数（用于 Tab 徽标）
export function countByStatus(orders: OrderSummary[]): Record<OrderStatus, number> {
  const acc = {} as Record<OrderStatus, number>;
  for (const s of STATUS_ORDER) acc[s] = 0;
  for (const o of orders) acc[o.status] += 1;
  return acc;
}
