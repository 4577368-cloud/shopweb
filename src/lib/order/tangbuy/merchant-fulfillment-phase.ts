import type { OrderStatus } from "../types";
import type { MerchantOrdLineSnapshot } from "./ord-line-snapshot";

/**
 * 商家订单中心对用户展示的履约阶段（简化模型）。
 *
 * Tab 语义（产品）：
 * - **待下单**：用户尚未支付，最初状态（与 Shopify 未付款一致）。
 * - **待支付**：向 Tangbuy 支付采购款；Admin 到账后生成采购订单。
 * - 支付采购款后至 1688 发货前：**处理中**（含接单、类目、预订购等内部步骤）。
 * - **已发货**（1688 已发货）→ 到仓 → 发出 → 妥投。
 */
export type MerchantFulfillmentPhase =
  | "awaiting_order_payment"
  | "awaiting_procurement_payment"
  | "processing"
  | "domestic_shipped"
  | "in_warehouse"
  | "intl_dispatched"
  | "delivered"
  | "canceled";

const CANCELED_GOODS = new Set([11, 24]);

export function resolveMerchantFulfillmentPhase(
  row: MerchantOrdLineSnapshot,
): MerchantFulfillmentPhase {
  const g = row.ord_line_stat;

  if (CANCELED_GOODS.has(g ?? -999)) return "canceled";

  // 向 Tangbuy 待支付 / 待补款 / 1688 待支付
  if (g === -2 || g === -1 || g === 2 || g === 55) {
    return "awaiting_procurement_payment";
  }

  // 1688 / 国内段已发货
  if (g === 5 || g === 6) return "domestic_shipped";

  if (g === 8 || g === 9 || g === 10 || g === 28 || g === 29 || g === 37 || g === 58) {
    return "in_warehouse";
  }

  if (g === 30) return "intl_dispatched";
  if (g === 31) return "delivered";

  // 待接单、1688 待生成、已订购、处理中等：Tangbuy 已收款后的中间态
  return "processing";
}

/** 履约阶段 → 订单中心 Tab（`OrderStatus`） */
export function merchantPhaseToOrderStatus(
  phase: MerchantFulfillmentPhase,
  goods?: number,
): OrderStatus {
  switch (phase) {
    case "canceled":
      return "canceled";
    case "awaiting_order_payment":
      return "pendingOrder";
    case "awaiting_procurement_payment":
      return goods === 2 ? "pendingSupplement" : "pendingPayment";
    case "processing":
    case "in_warehouse":
      return "preparing";
    case "domestic_shipped":
      return "pendingShipment";
    case "intl_dispatched":
      return "inTransit";
    case "delivered":
      return "delivered";
    default:
      return "preparing";
  }
}

export const MERCHANT_PHASE_I18N_KEY: Record<MerchantFulfillmentPhase, string> = {
  awaiting_order_payment: "order.merchantPhase.awaiting_order_payment",
  awaiting_procurement_payment: "order.merchantPhase.awaiting_procurement_payment",
  processing: "order.merchantPhase.processing",
  domestic_shipped: "order.merchantPhase.domestic_shipped",
  in_warehouse: "order.merchantPhase.in_warehouse",
  intl_dispatched: "order.merchantPhase.intl_dispatched",
  delivered: "order.merchantPhase.delivered",
  canceled: "order.merchantPhase.canceled",
};

export function isShopifyAwaitingCustomerPayment(financialStatus?: string | null): boolean {
  const fin = (financialStatus ?? "").trim().toLowerCase();
  if (!fin) return true;
  if (fin === "paid") return false;
  if (fin === "voided" || fin === "refunded") return false;
  return (
    fin === "authorized" ||
    fin === "partially_paid" ||
    fin === "pending" ||
    fin === "unpaid"
  );
}
