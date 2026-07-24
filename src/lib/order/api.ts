// 订单中心数据接入层（Phase 4）。
// 真实订单来自后端 `/api/plugin/order/header/list`（Shopify 已同步订单头，webhook 落地）。
// 该接口仅返回轻量头（outerOrderId / orderName / financialStatus / fulfillmentStatus /
// currency / totalPrice / platformCreatedAt），故映射为 OrderSummary 时富字段（目的地国 /
// 货源单号 / 物流双轨等）留缺，待后端补全或 Phase 5 接实时轨迹。
// 本地无后端 / 接口异常 / 返回空 时，自动回退 makeMockOrders()，保证本地测试不中断、不干扰开店流程。

import { api } from "@/lib/api";
import type { ShopOrderHeader } from "@/lib/types";
import { makeMockOrders } from "./mock";
import type { OrderStatus, OrderSummary, PaymentStatus } from "./types";

export type OrderSource = "real" | "mock";

export interface FetchOrdersResult {
  orders: OrderSummary[];
  source: OrderSource;
}

function norm(v: string | null | undefined): string {
  return (v ?? "").toString().trim().toLowerCase();
}

// Shopify financial_status + fulfillment_status → 我们的内部状态机。
// 这是启发式映射：真实权威状态以后端内部订单系统为准（Phase 4/5 完善）。
export function deriveStatus(
  financialStatus?: string | null,
  fulfillmentStatus?: string | null
): OrderStatus {
  const fin = norm(financialStatus);
  const ful = norm(fulfillmentStatus);

  if (fin === "voided" || fin === "refunded") return "canceled";
  if (ful === "fulfilled") return "delivered";
  if (ful === "partial") return "inTransit";
  // Shopify 已付款订单 → 待向货源下单（待下单，核心入口）。
  // 货源侧「备货中」需后端内部订单系统回写，订单头无法判断，故不在此派生。
  if (fin === "paid") return "pendingOrder";
  // 已授权未扣款 / 部分付款 / 待付款 → 待付款
  if (fin === "authorized" || fin === "partially_paid" || fin === "pending" || fin === "unpaid") {
    return "pendingPayment";
  }
  return "pendingOrder";
}

export function derivePayment(
  financialStatus?: string | null
): PaymentStatus | undefined {
  const fin = norm(financialStatus);
  if (fin === "paid") return "paid";
  if (fin === "partially_paid") return "partial";
  // pending / unpaid / authorized / voided / refunded → 视为未实收
  return "unpaid";
}

export function formatMoney(
  amount: number | null | undefined,
  currency?: string | null
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const cur = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(amount);
  } catch {
    return `${cur} ${amount.toFixed(2)}`;
  }
}

// 真实订单头 → 订单摘要。富字段留缺（真实接口尚未提供）。
export function mapShopOrderHeader(h: ShopOrderHeader): OrderSummary {
  return {
    id: h.outerOrderId,
    shopOrderNo: h.orderName ?? h.outerOrderId,
    tangbuyOrderNo: "—",
    shopifyOrderId: h.outerOrderId,
    createdAt: h.platformCreatedAt ?? "",
    destinationCountry: { code: "", name: "—" },
    status: deriveStatus(h.financialStatus, h.fulfillmentStatus),
    paymentStatus: derivePayment(h.financialStatus),
    productCost: formatMoney(h.totalPrice, h.currency),
  };
}

// 容错日期解析：兼容 ISO（真实）与 "YYYY-MM-DD HH:mm"（mock）。
export function parseCreatedAt(s: string): number | null {
  if (!s) return null;
  const t = new Date(s.includes(" ") ? s.replace(" ", "T") : s).getTime();
  return Number.isNaN(t) ? null : t;
}

// 已知演示店铺（归一化小写比对）：返回空真实结果时仍回退 mock，保持本地预览有数据。
const DEMO_SHOP_NAMES = new Set([
  "northwind-home",
  "northwind-home.myshopify.com",
  "northwind home",
]);

// 后端 order/product 接口按「短名」索引（如 easybrandkit），不接受 .myshopify.com 全域名。
// 这里归一化：去后缀、转小写，兼容 shop.name（短名）与 shop.domain（全域名）两种形态。
function normalizeShopName(shop: string): string {
  return (shop ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.myshopify\.com$/i, "")
    .replace(/\.myshopify\.com\/$/i, "");
}

// 拉取订单：优先真实接口。
// - 未连接店铺（shopName 为空）→ 演示数据
// - 接口异常 → 演示数据（容错）
// - 真实店铺返回空 → 诚实显示 0 条（不伪装 mock），仅演示店铺回退 mock 保预览
export async function fetchOrders(shop: string): Promise<FetchOrdersResult> {
  const raw = (shop ?? "").trim();
  if (!raw) {
    return { orders: makeMockOrders(), source: "mock" };
  }
  const shopName = normalizeShopName(raw);
  try {
    const headers = await api.listShopOrders(shopName);
    if (headers && headers.length > 0) {
      return { orders: headers.map(mapShopOrderHeader), source: "real" };
    }
    // 真实店铺但确实无订单：诚实返回 0 条（数据源标 real）
    if (DEMO_SHOP_NAMES.has(shopName)) {
      return { orders: makeMockOrders(), source: "mock" };
    }
    return { orders: [], source: "real" };
  } catch {
    return { orders: makeMockOrders(), source: "mock" };
  }
}
