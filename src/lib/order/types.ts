// 订单中心领域类型（Phase 1 数据层）
// 与开店流程解耦，不依赖 useOnboarding；后续 Phase 4 真实接入时只需替换 mock 来源。

export type OrderStatus =
  | "pendingOrder"
  | "pendingSupplement"
  | "pendingPayment"
  | "preparing"
  | "pendingShipment"
  | "inTransit"
  | "delivered"
  | "canceled";

export interface LineItem {
  image?: string;
  title: string;
  sku: string;
  qty: number;
  unitCost: string; // 展示用货币字符串，如 "¥86.00"
}

// 支付状态（表格列使用；mock 阶段填写，Phase 4 真实接口替换）
export type PaymentStatus = "paid" | "unpaid" | "partial";

// PII 隔离：列表仅持国家（code + 中文名），收件人详情只在 Shopify 端。
export interface DestinationCountry {
  code: string; // ISO 如 "US"
  name: string; // 中文名 "美国"
}

// 物流双轨状态枚举（Phase 5 接真实轨迹时复用）
export type DomesticTrackStep =
  | "pendingPickup" // 待揽收
  | "pickedUp" // 已揽收
  | "domesticTransit" // 运输中
  | "domesticArrived"; // 已入仓

export type IntlTrackStep =
  | "departed" // 已出库
  | "lineHaul" // 干线运输
  | "customs" // 清关
  | "lastMile" // 末端派送
  | "intlDelivered"; // 已签收

export interface LogisticsTrack {
  domestic: { step: DomesticTrackStep; abnormal?: boolean };
  intl: { step: IntlTrackStep; abnormal?: boolean };
}

// 订单摘要：通用常驻字段 + 按状态可选字段（依设计稿 §2.3）
export interface OrderSummary {
  id: string;
  shopOrderNo: string; // Shopify order_number / id —— 列表核心标识
  tangbuyOrderNo: string; // 我们系统内部单号，"—" 表示无
  shopifyOrderId: string; // 跳 Shopify Admin 用
  createdAt: string; // 展示串（真实接入后为 ISO）
  destinationCountry: DestinationCountry;
  status: OrderStatus;
  paymentStatus?: PaymentStatus; // 表格列用，备货前默认 unpaid，支付后 paid，部分补款 partial

  // 通用可选字段（按状态填充）
  lineItems?: LineItem[];
  supplierOrderNo?: string;
  productCost?: string; // 商品成本总计展示串
  logisticsMethod?: string;
  logisticsEta?: string;
  logisticsFee?: string;
  remark?: string;
  routeLine?: string; // 派生物流线路（美向/欧向）
  templatePrice?: string; // 派生模板价
  needsQuote?: boolean; // 无模板标「待核价」

  // 待补款
  supplementReason?: string;
  supplementAmount?: string;

  // 待支付
  payableAmount?: string;
  payMethod?: string;

  // 备货中
  expectedShipAt?: string;

  // 待发货 / 待送达
  wulouNo?: string; // 五楼单号（用户要求）
  intlTrackingNo?: string; // 国际物流单号
  carrier?: string; // 承运商
  track?: LogisticsTrack; // 双轨（mock，Phase 5 接真实）

  // 已送达
  signedAt?: string;
  signedBy?: string;
  deliveryStatus?: string;

  // 已取消
  canceledAt?: string;
  cancelReason?: string;
  refundStatus?: string;
}
