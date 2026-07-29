// 订单 CSV 导出（header 按钮与右栏 Copilot 共用同一实现，避免两处维护）。
import type { OrderSummary } from "./types";

export function csvCell(s: string | undefined): string {
  const v = (s ?? "").toString();
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// 导出当前视图为 CSV。t 为 i18n 取值函数（来自 useT）。返回导出条数。
export function exportOrdersCsv(
  orders: OrderSummary[],
  t: (key: string) => string
): number {
  const headers = [
    t("order.table.info"),
    t("order.columns.tangbuyOrderNo"),
    t("order.table.status"),
    t("order.table.paymentStatus"),
    t("order.table.amount"),
    t("order.card.createdAt"),
  ];
  const rows = orders.map((o) => [
    o.shopOrderNo,
    o.tangbuyOrderNo ?? "—",
    t(`order.tabs.${o.status}`),
    o.paymentStatus ? t(`order.paymentStatus.${o.paymentStatus}`) : "—",
    o.productCost ?? "—",
    o.createdAt,
  ]);
  const lines = [headers, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return orders.length;
}
