// 订单中心数据接入层（Phase 4）。
// 真实订单来自后端 `/api/plugin/order/header/list`（Shopify 已同步订单头，webhook 落地）。
// 该接口仅返回轻量头（outerOrderId / orderName / financialStatus / fulfillmentStatus /
// currency / totalPrice / platformCreatedAt），故映射为 OrderSummary 时富字段（目的地国 /
// 货源单号 / 物流双轨等）留缺，待后端补全或 Phase 5 接实时轨迹。
// 本地无后端 / 接口异常 / 返回空 时，自动回退 makeMockOrders()，保证本地测试不中断、不干扰开店流程。

import { api } from "@/lib/api";
import type { ShopOrderHeader } from "@/lib/types";
import { makeMockOrders } from "./mock";
import type {
  LineItem,
  LinkedOffer,
  OrderBindingLine,
  OrderStatus,
  OrderSummary,
  PaymentStatus,
} from "./types";
import { applyProcurementSnapshot } from "./tangbuy";

export type OrderSource = "real" | "mock";

export interface FetchOrdersResult {
  orders: OrderSummary[];
  source: OrderSource;
  /** 诚实错误标识：真实店铺会话后端不可达时不返回假订单，改由 UI 显示空态。 */
  error?: "backend_unavailable" | "no_shop" | null;
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
  // Shopify fulfillment_status=partial 表示「部分商品已发货」，剩余可能还在备货。
  // 不宜全单标 inTransit，保留 pendingShipment 让人工判断部分发货状态。
  if (ful === "partial") return "pendingShipment";
  // 店铺顾客已付款 → 下一步为向 Tangbuy 支付采购款（待支付 Tab）
  if (fin === "paid") return "pendingPayment";
  // 顾客尚未支付 → 待下单（最初状态）
  if (fin === "authorized" || fin === "partially_paid" || fin === "pending" || fin === "unpaid") {
    return "pendingOrder";
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
  const base: OrderSummary = {
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
  if (h.procurementLine && Object.keys(h.procurementLine).length > 0) {
    return applyProcurementSnapshot(base, h.procurementLine, {
      shopifyFinancialStatus: h.financialStatus,
    });
  }
  return base;
}

// 后端订单行（Shopify 行 + Tangbuy 绑定快照）→ 前端 LineItem（含关联货源）。
// 同步时已做「Shopify 行 → Tangbuy 货源」匹配：命中（BOUND）时回填 linkedOffer，
// 未命中（UNBOUND / 无 tangbuyProductId）则只给 Shopify 行信息、不伪造货源。
export function mapBindingLineToLineItem(
  line: OrderBindingLine,
  currency?: string | null
): LineItem {
  const bound = line.bindingStatus === "BOUND" && !!line.tangbuyProductId;
  const linkedOffer: LinkedOffer | undefined = bound
    ? {
        offerId: line.tangbuyProductId as string,
        source: "TANGBUY",
        sourceRole: "PRIMARY",
        title: line.title ?? (line.tangbuyProductId as string),
        procurementPrice: "—",
      }
    : undefined;
  return {
    outerVariantId: line.outerVariantId ?? undefined,
    image: line.previewImageUrl ?? undefined,
    title: line.title ?? "—",
    sku: line.sku ?? "",
    qty: line.quantity ?? 1,
    unitCost: formatMoney(line.price, currency),
    linkedOffer,
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

// 订单头短期缓存（30s）：避免多个组件挂载 / 快速切 Tab 时重复请求全量订单头。
const ORDER_HEADERS_CACHE_MS = 30_000;
const orderHeadersCache = new Map<string, { at: number; data: ShopOrderHeader[] }>();

function mergeProcurementIntoHeader(
  h: ShopOrderHeader,
  byOuterId: Map<string, ShopOrderHeader["procurementLine"]>,
): ShopOrderHeader {
  if (h.procurementLine && Object.keys(h.procurementLine).length > 0) return h;
  const snap = byOuterId.get(h.outerOrderId);
  if (!snap || Object.keys(snap).length === 0) return h;
  return { ...h, procurementLine: snap };
}

async function loadProcurementSnapshotMap(
  shopName: string,
): Promise<Map<string, NonNullable<ShopOrderHeader["procurementLine"]>>> {
  const map = new Map<string, NonNullable<ShopOrderHeader["procurementLine"]>>();
  try {
    const rows = await api.listOrderProcurementSnapshots(shopName);
    for (const row of rows ?? []) {
      if (row?.outerOrderId && row.procurementLine) {
        map.set(row.outerOrderId, row.procurementLine);
      }
    }
  } catch {
    // 可选接口：plugin 未上线时不影响列表
  }
  return map;
}

function fetchOrderHeaders(shopName: string): Promise<ShopOrderHeader[]> {
  const cached = orderHeadersCache.get(shopName);
  if (cached && Date.now() - cached.at < ORDER_HEADERS_CACHE_MS) {
    return Promise.resolve(cached.data);
  }
  return api.listShopOrders(shopName).then((data) => {
    orderHeadersCache.set(shopName, { at: Date.now(), data });
    return data;
  });
}

// 并发受限的 batch 执行：避免 N 个订单头触发 N 次并发请求打爆浏览器并发上限（6）与后端 QPS。
async function mapWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// 拉取订单：优先真实接口。
// - 未连接店铺（shopName 为空）→ 演示数据
// - 接口异常 → 演示数据（容错）
// - 真实店铺返回空 → 诚实显示 0 条（不伪装 mock），仅演示店铺回退 mock 保预览
export async function fetchOrders(shop: string): Promise<FetchOrdersResult> {
  const raw = (shop ?? "").trim();
  if (!raw) {
    // 未连接店铺（开发预览）：保留示例数据，但标 no_shop 让 UI 明确其为演示。
    return { orders: makeMockOrders(), source: "mock", error: "no_shop" };
  }
  const shopName = normalizeShopName(raw);
  try {
    const [headers, procurementByOuter] = await Promise.all([
      fetchOrderHeaders(shopName),
      loadProcurementSnapshotMap(shopName),
    ]);
    if (headers && headers.length > 0) {
      // 并行补拉每个订单的「Shopify 行 → Tangbuy 关联货源」匹配结果，
      // 回填 lineItems（含 linkedOffer）；单行拉取失败不影响整张列表。
      // 并发限制为 6（浏览器对同源的并发上限），避免 N+1 打爆后端。
      const orders = await mapWithConcurrencyLimit(headers, 6, async (h) => {
        const header = mergeProcurementIntoHeader(h, procurementByOuter);
        const base = mapShopOrderHeader(header);
        try {
          const lines = await api.listOrderBindingLines(shopName, h.outerOrderId);
          if (lines && lines.length > 0) {
            return {
              ...base,
              lineItems: lines.map((l) => mapBindingLineToLineItem(l, h.currency)),
            };
          }
        } catch {
          // 行匹配接口异常 → 保持无 lineItems（走空态），不阻塞订单列表
        }
        return base;
      });
      return { orders, source: "real" };
    }
    // 真实店铺但确实无订单：诚实返回 0 条（数据源标 real）
    if (DEMO_SHOP_NAMES.has(shopName)) {
      return { orders: makeMockOrders(), source: "mock" };
    }
    return { orders: [], source: "real" };
  } catch {
    // 真实店铺会话后端不可达：诚实返回空态（不伪造假订单），UI 显示加载失败提示。
    return { orders: [], source: "real", error: "backend_unavailable" };
  }
}

/** 清除指定店铺的订单头缓存（下单/支付等写操作后调用，确保下次 fetch 拿到最新数据）。 */
export function invalidateOrderHeadersCache(shop?: string): void {
  if (shop) {
    const shopName = normalizeShopName(shop);
    orderHeadersCache.delete(shopName);
  } else {
    orderHeadersCache.clear();
  }
}
