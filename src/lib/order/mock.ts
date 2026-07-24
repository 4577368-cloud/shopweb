// 订单中心 mock 数据工厂（Phase 1 数据层）
// 覆盖 8 状态 + 全部视图；含目的地国 → 线路/模板价派生（预设规则表）。
// Phase 4 真实接入时用 /api/plugin/order/list 替换 makeMockOrders()。
import type { DestinationCountry, OrderStatus, OrderSummary, PaymentStatus } from "./types";

const COUNTRIES: Record<string, DestinationCountry> = {
  US: { code: "US", name: "美国" },
  GB: { code: "GB", name: "英国" },
  DE: { code: "DE", name: "德国" },
  JP: { code: "JP", name: "日本" },
  AU: { code: "AU", name: "澳大利亚" },
  CA: { code: "CA", name: "加拿大" },
};

// 预设线路规则（目的地国 → 线路）。无匹配走默认线并标待核价。
const ROUTE_RULES: Record<string, string> = {
  US: "美向专线",
  CA: "美向专线",
  GB: "欧向专线",
  DE: "欧向专线",
  AU: "澳新专线",
  JP: "日韩专线",
};

// 预设模板价（线路 → 价格串）。无匹配标待核价。
const TEMPLATE_PRICE: Record<string, string> = {
  "美向专线": "¥42.00",
  "欧向专线": "¥36.00",
  "澳新专线": "¥28.00",
  "日韩专线": "¥21.00",
};

function deriveRoute(country: DestinationCountry): {
  routeLine: string;
  templatePrice?: string;
  needsQuote: boolean;
} {
  const line = ROUTE_RULES[country.code];
  if (!line) return { routeLine: "默认线", needsQuote: true };
  const price = TEMPLATE_PRICE[line];
  return price
    ? { routeLine: line, templatePrice: price, needsQuote: false }
    : { routeLine: line, needsQuote: true };
}

// 各状态默认支付状态（mock 阶段硬编码；Phase 4 接真实数据后由接口填充）
const DEFAULT_PAYMENT: Record<OrderStatus, PaymentStatus> = {
  pendingOrder: "unpaid",
  pendingSupplement: "unpaid",
  pendingPayment: "unpaid",
  preparing: "paid",
  pendingShipment: "paid",
  inTransit: "paid",
  delivered: "paid",
  canceled: "unpaid",
};

interface MockSeed {
  id: string;
  shopOrderNo: string;
  tangbuyOrderNo: string;
  shopifyOrderId: string;
  title: string;
  sku: string;
  supplierOrderNo: string;
  cost: string; // 数值串，如 "86.00"
  method: string;
  eta: string;
  fee?: string; // 可选，缺省用派生模板价
  remark?: string;
  country: DestinationCountry;
  status: OrderStatus;
  qty?: number; // 多件商品，默认 1
  paymentStatus?: PaymentStatus; // 覆盖默认
  createdAt?: string; // ISO-like 展示串，默认 2026-07-2X
  paymentStatusOverride?: boolean; // 部分补款等
}

const SEEDS: MockSeed[] = [
  // ── pendingOrder（核心入口，密度最高） ──
  { id: "1", shopOrderNo: "#1024", tangbuyOrderNo: "—", shopifyOrderId: "5204812367890", title: "Wireless Earbuds Pro", sku: "WE-PRO-BLK", supplierOrderNo: "—", cost: "86.00", method: "云途专线", eta: "8-12 天", remark: "优先发美向仓", country: COUNTRIES.US, status: "pendingOrder" },
  { id: "2", shopOrderNo: "#1027", tangbuyOrderNo: "—", shopifyOrderId: "5204812456781", title: "Smart Watch Band", sku: "SWB-22MM", supplierOrderNo: "—", cost: "23.50", method: "燕文平邮", eta: "12-18 天", country: COUNTRIES.GB, status: "pendingOrder" },
  { id: "3", shopOrderNo: "#1031", tangbuyOrderNo: "—", shopifyOrderId: "5204812545672", title: "LED Ring Light", sku: "LR-18IN", supplierOrderNo: "—", cost: "54.00", method: "4PX 专线", eta: "7-10 天", remark: "易碎需加固", country: COUNTRIES.DE, status: "pendingOrder" },
  { id: "11", shopOrderNo: "#1033", tangbuyOrderNo: "—", shopifyOrderId: "5204812634583", title: "Phone Case Silicone", sku: "PCS-IP15", supplierOrderNo: "—", cost: "12.00", method: "云途专线", eta: "8-12 天", country: COUNTRIES.US, status: "pendingOrder", qty: 2 },
  { id: "12", shopOrderNo: "#1038", tangbuyOrderNo: "—", shopifyOrderId: "5204812723494", title: "Linen Tea Towel", sku: "LTT-NAT", supplierOrderNo: "—", cost: "8.50", method: "燕文平邮", eta: "12-18 天", country: COUNTRIES.AU, status: "pendingOrder", qty: 4 },
  { id: "13", shopOrderNo: "#1041", tangbuyOrderNo: "—", shopifyOrderId: "5204812812305", title: "USB-C Cable 2m", sku: "USC-2M", supplierOrderNo: "—", cost: "6.20", method: "4PX 专线", eta: "7-10 天", country: COUNTRIES.JP, status: "pendingOrder", qty: 3 },
  { id: "14", shopOrderNo: "#1045", tangbuyOrderNo: "—", shopifyOrderId: "5204812901216", title: "Bamboo Cutting Board", sku: "BCB-MED", supplierOrderNo: "—", cost: "21.00", method: "云途专线", eta: "8-12 天", country: COUNTRIES.CA, status: "pendingOrder", qty: 1 },

  // ── pendingSupplement ──
  { id: "4", shopOrderNo: "#1009", tangbuyOrderNo: "TB-7781", shopifyOrderId: "5204812098763", title: "Phone Stand Aluminum", sku: "PS-ALU", supplierOrderNo: "SUP-4412", cost: "19.00", method: "云途专线", eta: "8-12 天", country: COUNTRIES.US, status: "pendingSupplement" },
  { id: "15", shopOrderNo: "#1015", tangbuyOrderNo: "TB-7795", shopifyOrderId: "5204812198674", title: "Insulated Mug 450ml", sku: "IM-450", supplierOrderNo: "SUP-4420", cost: "16.50", method: "燕文专线", eta: "9-14 天", country: COUNTRIES.DE, status: "pendingSupplement", paymentStatus: "partial" },

  // ── pendingPayment ──
  { id: "5", shopOrderNo: "#1003", tangbuyOrderNo: "TB-7750", shopifyOrderId: "5204811987654", title: "Bluetooth Speaker", sku: "BS-MINI", supplierOrderNo: "SUP-4300", cost: "62.00", method: "云途专线", eta: "8-12 天", country: COUNTRIES.JP, status: "pendingPayment" },
  { id: "16", shopOrderNo: "#1018", tangbuyOrderNo: "TB-7812", shopifyOrderId: "5204812297585", title: "Notebook Hardcover", sku: "NB-A5", supplierOrderNo: "SUP-4450", cost: "11.00", method: "4PX 专线", eta: "7-10 天", country: COUNTRIES.GB, status: "pendingPayment" },

  // ── preparing ──
  { id: "6", shopOrderNo: "#0998", tangbuyOrderNo: "TB-7720", shopifyOrderId: "5204811876545", title: "Yoga Mat Non-Slip", sku: "YM-6MM", supplierOrderNo: "SUP-4188", cost: "41.00", method: "4PX 专线", eta: "7-10 天", remark: "卷装", country: COUNTRIES.AU, status: "preparing" },
  { id: "17", shopOrderNo: "#1001", tangbuyOrderNo: "TB-7740", shopifyOrderId: "5204811965436", title: "Cotton T-Shirt Unisex", sku: "TS-COT-M", supplierOrderNo: "SUP-4280", cost: "9.50", method: "云途专线", eta: "8-12 天", country: COUNTRIES.US, status: "preparing", qty: 3 },

  // ── pendingShipment ──
  { id: "7", shopOrderNo: "#0990", tangbuyOrderNo: "TB-7690", shopifyOrderId: "5204811765436", title: "Desk Organizer", sku: "DO-WOOD", supplierOrderNo: "SUP-4050", cost: "33.00", method: "燕文专线", eta: "9-14 天", country: COUNTRIES.US, status: "pendingShipment" },
  { id: "18", shopOrderNo: "#0994", tangbuyOrderNo: "TB-7705", shopifyOrderId: "5204811854327", title: "Scented Candle Glass", sku: "SCG-LAV", supplierOrderNo: "SUP-4110", cost: "14.50", method: "燕文专线", eta: "9-14 天", country: COUNTRIES.DE, status: "pendingShipment" },

  // ── inTransit ──
  { id: "8", shopOrderNo: "#0975", tangbuyOrderNo: "TB-7640", shopifyOrderId: "5204811654327", title: "Camping Lantern", sku: "CL-USB", supplierOrderNo: "SUP-3920", cost: "47.00", method: "云途专线", eta: "8-12 天", country: COUNTRIES.CA, status: "inTransit" },

  // ── delivered ──
  { id: "9", shopOrderNo: "#0950", tangbuyOrderNo: "TB-7580", shopifyOrderId: "5204811543218", title: "Kitchen Scale", sku: "KS-01", supplierOrderNo: "SUP-3700", cost: "28.00", method: "4PX 专线", eta: "7-10 天", country: COUNTRIES.DE, status: "delivered" },
  { id: "19", shopOrderNo: "#0965", tangbuyOrderNo: "TB-7610", shopifyOrderId: "5204811602108", title: "Aroma Diffuser", sku: "AD-WOOD", supplierOrderNo: "SUP-3810", cost: "37.00", method: "云途专线", eta: "8-12 天", country: COUNTRIES.JP, status: "delivered" },

  // ── canceled ──
  { id: "10", shopOrderNo: "#0942", tangbuyOrderNo: "TB-7550", shopifyOrderId: "5204811432109", title: "Water Bottle Steel", sku: "WB-750", supplierOrderNo: "SUP-3610", cost: "35.00", method: "燕文专线", eta: "9-14 天", remark: "客户取消", country: COUNTRIES.GB, status: "canceled" },
];

export function makeMockOrders(): OrderSummary[] {
  return SEEDS.map((b) => {
    const dest = b.country;
    const d = deriveRoute(dest);
    const fee = b.fee ?? d.templatePrice ?? "待核价";
    const summary: OrderSummary = {
      id: b.id,
      shopOrderNo: b.shopOrderNo,
      tangbuyOrderNo: b.tangbuyOrderNo,
      shopifyOrderId: b.shopifyOrderId,
      createdAt: b.createdAt ?? "2026-07-2X",
      destinationCountry: dest,
      status: b.status,
      paymentStatus: b.paymentStatus ?? DEFAULT_PAYMENT[b.status],
      lineItems: [{ title: b.title, sku: b.sku, qty: b.qty ?? 1, unitCost: `¥${b.cost}` }],
      supplierOrderNo: b.supplierOrderNo,
      productCost: `¥${b.cost}`,
      logisticsMethod: b.method,
      logisticsEta: b.eta,
      logisticsFee: fee,
      remark: b.remark ?? "",
      routeLine: d.routeLine,
      templatePrice: d.templatePrice,
      needsQuote: d.needsQuote,
    };

    // 按状态补专属字段（设计稿 §2.3）
    if (b.status === "pendingShipment" || b.status === "inTransit") {
      summary.wulouNo = `WL2026${b.id.padStart(4, "0")}`;
      summary.track = {
        domestic: { step: "domesticArrived" },
        intl: { step: b.status === "inTransit" ? "lineHaul" : "departed" },
      };
    }
    if (b.status === "pendingSupplement") {
      summary.supplementReason = "重量差异";
      summary.supplementAmount = b.paymentStatus === "partial" ? "¥4.50" : "¥12.00";
    }
    if (b.status === "pendingPayment") {
      summary.payableAmount = `¥${b.cost}`;
      summary.payMethod = "支付宝";
    }
    if (b.status === "preparing") {
      summary.expectedShipAt = "2026-07-25";
    }
    if (b.status === "inTransit") {
      summary.intlTrackingNo = `TRK${b.id}`;
      summary.carrier = "云途";
      summary.expectedShipAt = "2026-07-22"; // 已发，对未来 ETA 标签
    }
    if (b.status === "pendingShipment") {
      summary.expectedShipAt = "2026-07-25";
    }
    if (b.status === "delivered") {
      summary.signedAt = "2026-07-20";
      summary.signedBy = "已签收";
      summary.deliveryStatus = "已签收";
    }
    if (b.status === "canceled") {
      summary.canceledAt = "2026-07-19";
      summary.cancelReason = "客户取消";
      summary.refundStatus = "已退款";
    }
    return summary;
  });
}