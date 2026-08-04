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
  /** Shopify variant id (back from `ThirdPlatformOrderLine.outerVariantId`).
   *  Needed to deep-link into sku-align from the table's ➕ button. */
  outerVariantId?: string;
  image?: string;
  title: string;
  sku: string;
  qty: number;
  unitCost: string; // 展示用货币字符串，如 "¥86.00"
  // 关联货源（Tangbuy / 1688 offer）—— 下单 = 下单此关联商品，而非 Shopify 店铺商品本身。
  // 真实关联来自 sku-align 的 currentBinding.offerId + sourceRole；mock 阶段由种子数据模拟该形态。
  linkedOffer?: LinkedOffer;
}

// 货源平台
export type OfferSource = "TANGBUY" | "1688";

// 关联货源：Shopify 商品 → Tangbuy/1688 offer 的绑定（对应 sku-align 的 currentBinding）。
export interface LinkedOffer {
  offerId: string; // Tangbuy/1688 offerId
  source: OfferSource; // 货源平台
  sourceRole: "PRIMARY" | "SUPPLEMENT"; // 主货源 / 补货货源
  title: string; // 货源商品标题
  imageUrl?: string;
  detailUrl?: string; // 货源商品详情（Tangbuy/1688）
  procurementPrice: string; // 采购单价（CNY 串，如 "¥86.00"）—— 下单金额即此
  supplier?: string; // 供应商名（可选展示）
}

// 后端 `GET /api/plugin/order/binding/lines` 返回的原始订单行。
// 同步时已做「Shopify 行 → Tangbuy 货源」匹配并落库：前半段是 Shopify 行信息，
// 后半段（tangbuy*）是匹配到的 Tangbuy 货源快照；bindingStatus 标记是否命中。
export interface OrderBindingLine {
  outerOrderId?: string | null;
  outerVariantId?: string | null;
  /** Shopify variant preview image (optional; backend may sync from variant media). */
  previewImageUrl?: string | null;
  outerProductId?: string | null; // Shopify product id (optional; needed to deep-link to sku-align)
  sku?: string | null;
  title?: string | null;
  quantity?: number | null;
  price?: number | null;
  tangbuyProductId?: string | null;
  tangbuySkuId?: string | null;
  bindingStatus?: "BOUND" | "UNBOUND" | null;
}

// 支付状态（表格列使用；mock 阶段填写，Phase 4 真实接口替换）
export type PaymentStatus = "paid" | "unpaid" | "partial";

// PII 隔离：列表仅持国家（code + 中文名）；收件人详情经文字链打开独立面板，可补全国际物流必填项。
export interface DestinationCountry {
  code: string; // ISO 如 "US"
  name: string; // 中文名 "美国"
}

/** Shopify shipping / recipient — shown only in recipient panel (not list). */
export interface OrderRecipient {
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  company?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  countryCode?: string;
  /** Any intl-required field blank */
  incomplete?: boolean;
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

  /** Shopify 收件人；详情默认折叠，经文字链打开面板查看/补全 */
  recipient?: OrderRecipient;

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

  /** Tangbuy 子单 goodsStatus（Admin ord_line_stat），有则列表状态以此为准 */
  procurementLineStatus?: number;
  procurementLineStatusLabel?: string;
  /** 商家侧履约阶段（i18n：`order.merchantPhase.*`） */
  merchantFulfillmentPhase?: string;
  procurementExceptionTag?: string;
  procurementQueue?: string;
}
