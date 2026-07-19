export type StepId =
  | "authorize"
  | "products"
  | "sku-align"
  | "logistics"
  | "sync";

/** 全站统一的 4 类流程状态 */
export type WorkflowStatus =
  | "in_progress"
  | "pending_confirm"
  | "completed"
  | "error";

export type StepStatus = WorkflowStatus | "not_started";

export type AuthStatus =
  | "waiting_input"
  | "ready_to_authorize"
  | "authorizing"
  | "authorized"
  | "error";

export type MatchSource = "image_search" | "title_match" | "manual";

export type ProductMatchStatus =
  | "high_match"
  | "medium_match"
  | "needs_review"
  | "confirmed"
  | "deferred"
  | "flagged"
  | "rejected";

export type SkuAlignStatus =
  | "auto_aligned"
  | "needs_confirm"
  | "pending"
  | "confirmed"
  | "conflict"
  | "skipped"
  | "flagged";

/** 系统判定结果（机器判断，不随用户操作改变） */
export type SkuJudgment = "acceptable" | "needs_review" | "conflict" | "blocked";

/** 用户处理状态 */
export type SkuHandleStatus =
  | "unhandled"
  | "accepted"
  | "modified"
  | "skipped"
  | "flagged";

export type SyncPhase = "blocked" | "ready" | "syncing" | "completed";

export type SyncResultKind = "success" | "skipped" | "exception";

export type ActivityLevel = "info" | "success" | "warning" | "error";

export interface OnboardingStep {
  id: StepId;
  order: number;
  title: string;
  description: string;
  href: string;
  status: StepStatus;
}

export interface ShopInfo {
  domain: string;
  name: string;
  currency: string;
  timezone: string;
  authorizedAt?: string;
  productCount: number;
  orderCount: number;
}

export interface OverviewMetrics {
  authStatus: "authorized" | "unauthorized";
  analyzedProducts: number;
  matchedProducts: number;
  pendingConfirmProducts: number;
  autoAlignedSkus: number;
  needsConfirmSkus: number;
}

export interface ActivityItem {
  id: string;
  time: string;
  title: string;
  detail: string;
  level: ActivityLevel;
}

export type StockLevel = "in_stock" | "low" | "out";

export interface ProductMatch {
  id: string;
  shopProduct: {
    id: string;
    title: string;
    image: string;
    variants: number;
    price: string;
    sku: string;
    stock: number;
    stockLevel: StockLevel;
  };
  sourceProduct: {
    id: string;
    title: string;
    image: string;
    supplier: string;
    price: string;
    /** 成本（人民币展示） */
    costUsdApprox?: string;
    sku: string;
    moq: number;
    stockLevel: StockLevel;
    stockLabel: string;
    warehouse?: string;
  };
  matchScore: number;
  source: MatchSource;
  /** 压缩为短标签，避免大段规格摘要 */
  specTags: string[];
  /** 预估毛利空间，mock 占位 */
  marginEstimate: string;
  /** 售价与成本差摘要，mock 占位 */
  priceGapLabel: string;
  status: ProductMatchStatus;
}

export interface SkuAlignment {
  id: string;
  shopProductTitle: string;
  shopVariant: {
    id: string;
    title: string;
    sku: string;
    options: string;
  };
  sourceSku: {
    id: string;
    title: string;
    sku: string;
    options: string;
    price: string;
  };
  /** @deprecated 保留兼容；以 judgment + handleStatus 为准 */
  status: SkuAlignStatus;
  judgment: SkuJudgment;
  handleStatus: SkuHandleStatus;
  /** 短差异摘要，优先于泛说明 */
  diffSummary?: string;
  /** 系统归一化提示（小字） */
  systemHint?: string;
  note?: string;
  issueType?: "unit" | "color" | "spec" | "pending_product";
}

export interface LogisticsForm {
  targetCountry: string;
  speedPreference: "economy" | "standard" | "express";
  maxShippingFee: number;
  batteryIncluded: boolean;
  autoTracking: boolean;
}

export interface LogisticsPlan {
  id: string;
  name: string;
  carrier: string;
  etaDays: string;
  estimatedFee: string;
  coverage: string;
  recommended: boolean;
  reasons: string[];
  /** 带电商品是否可用 */
  supportsBattery: boolean;
  batteryNote?: string;
}

export interface SyncResultItem {
  id: string;
  title: string;
  detail: string;
  kind: SyncResultKind;
}

export interface SyncSummary {
  linkedProducts: number;
  listedProducts: number;
  skippedProducts: number;
  exceptionCount: number;
  logisticsConfigured: boolean;
  autoFulfillmentReady: boolean;
  completedAt: string;
  items: SyncResultItem[];
}

export interface AiAlert {
  id: string;
  text: string;
  /** 对应表格行 / 数据项 id，点击可聚焦 */
  targetId?: string;
}

export interface AiNextAction {
  label: string;
  href?: string;
  /** 由页面处理的动作键 */
  action?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface AiPanelContent {
  title: string;
  summary: string;
  bullets: string[];
  nextAction?: AiNextAction;
  alerts?: AiAlert[];
}

// ---------------------------------------------------------------------------
// M1-5 路径B（离线目录上架）：与后端 VO 一一对应的类型。
// 后端 BigDecimal 序列化为 JSON number，故此处价格字段用 number。
// ---------------------------------------------------------------------------

/** 单品发布生命周期状态，对应后端 ProductPublishStatus。 */
export type PublishStatus = "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED";

/** GET /api/plugin/catalog/recommendations 返回项。 */
export interface CatalogRecommendation {
  candidateId: string;
  title: string;
  imageUrl?: string | null;
  /** 采购原价（货源币种，如 CNY） */
  price?: number | null;
  currency?: string | null;
  /** 定价模板推算的预估售价；price 未知时为 null */
  estimatedSalePrice?: number | null;
  targetCurrency?: string | null;
  supplierShop?: string | null;
  skuAttr?: string | null;
  offerId1688?: string | null;
  tangbuyUrl?: string | null;
  upstreamPlatform?: string | null;
  barcode?: string | null;
}

/** GET /api/plugin/pricing/template 返回的生效模板（stored 或系统默认）。 */
export interface PricingTemplate {
  shopName?: string | null;
  sourceCurrency: string;
  targetCurrency: string;
  exchangeRate: number;
  multiplier: number;
  addend: number;
  roundingStrategy: string;
  decimals: number;
  /** true 表示尚未保存、返回的是系统默认值 */
  isDefault: boolean;
  updatedAt?: string | null;
}

/** POST /api/plugin/pricing/template 请求体；仅 shopName + exchangeRate 必填。 */
export interface PricingTemplateUpsert {
  shopName: string;
  exchangeRate: number;
  multiplier?: number;
  addend?: number;
  roundingStrategy?: string;
  decimals?: number;
  sourceCurrency?: string;
  targetCurrency?: string;
}

/** POST /api/plugin/catalog/publish 响应。 */
export interface PublishResult {
  status: string;
  publishStatus: PublishStatus;
  candidateId: string;
  shopifyProductId?: string | null;
  shopifyProductHandle?: string | null;
  shopifyVariantId?: string | null;
  salePrice?: number | null;
  targetCurrency?: string | null;
  message?: string | null;
}

// ---------------------------------------------------------------------------
// A1 路径A（在售商品）：店铺商品镜像的只读展示类型，对应后端 ThirdPlatformProduct。
// ---------------------------------------------------------------------------

/** GET /api/plugin/product/list 返回的店铺在售商品镜像行（只读展示用子集）。 */
export interface ShopMirrorProduct {
  id: number;
  shopName?: string | null;
  thirdPlatformItemId: string;
  handle?: string | null;
  title?: string | null;
  status?: string | null;
  currency?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  primaryImageUrl?: string | null;
  updatedAt?: string | null;
}

/** POST /api/plugin/product/sync 响应。 */
export interface ProductSyncResult {
  status: string;
  shopName: string;
  mode: string;
  windowMinutes?: number | null;
  productCount: number;
}
