/**
 * 采购作业队列 — 与采购系统 `tangbuy-procurement-api/app/services/orders/queue_filters.py`
 * 中 `resolve_order_queue` 保持一致（优先于纯枚举表 lookup）。
 */
import type { MerchantOrdLineSnapshot } from "./ord-line-snapshot";

export type ProcurementQueue =
  | "pending_procurement"
  | "pending_payment"
  | "ordered"
  | "shipped"
  | "in_warehouse"
  | "dispatched"
  | "exception"
  | "reverse";

export function resolveProcurementQueue(
  row: MerchantOrdLineSnapshot,
): ProcurementQueue | undefined {
  const goods = row.ord_line_stat;
  const orderStat = row.ord_stat;
  const rtn = row.rtn_stat ?? 0;
  const abn = row.abn_type_cd ?? 0;

  if (rtn && Number(rtn) !== 0) return "reverse";
  if (abn && Number(abn) !== 0) return "exception";
  if (goods === 25 || goods === 14 || goods === 33) return "exception";
  if (goods === 24 || goods === 11) return "reverse";
  if (goods === 0 || goods === 23 || goods === 54) return "pending_procurement";
  if (goods === -2 || goods === -1 || goods === 2 || goods === 55) return "pending_payment";
  if (goods === 22) return "ordered";
  if (goods === 5 || goods === 6 || goods === 8) return "shipped";
  if (goods === 9 || goods === 10 || goods === 28 || goods === 29 || goods === 37 || goods === 58) {
    return "in_warehouse";
  }
  if (goods === 30 || goods === 31) return "dispatched";
  if (orderStat === 0) return "pending_payment";
  if (orderStat === 1 || orderStat === 2) return "pending_procurement";
  return undefined;
}
