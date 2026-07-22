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

// ---------------------------------------------------------------------------
// Logistics Phase 1 — strategy template + product type analysis (not lane UI).
// ---------------------------------------------------------------------------

export type LogisticsTypeCode =
  | "GENERAL"
  | "APPAREL"
  | "FOOD"
  | "BATTERY_MAGNETIC"
  | "BLADE"
  | "OTHER";

export type LogisticsDecisionStatus =
  | "pending_sku"
  | "pending_postal_meta"
  | "ready_for_quote"
  | "confirmed"
  | "restricted"
  | "needs_review";

export type QuoteStatus =
  | "NOT_REQUESTED"
  | "PENDING"
  | "INGESTING"
  | "SUCCESS"
  | "FAILED";

export interface LogisticsLine {
  lineCode: string;
  lineName: string;
  estimatedFee: number;
  currency: string;
  estimatedDays: number;
  /** Raw Tangbuy transitTime, e.g. "10-20". */
  transitTimeLabel?: string;
  carrier: string;
  supportsBattery?: boolean;
  trackingAvailable: boolean;
  priority: number;
}

export interface VariantLogisticsDecision {
  thirdPlatformSkuId: string;
  optionLabel: string;
  tangbuySkuId?: string | null;
  tangbuyGoodsId?: string | null;
  postalLimitClass?: string;
  postalLimitLabel?: string;
  postalLimitConfidence?: number;
  estimatedWeightG?: number;
  estimatedVolumeCm3?: number;
  estimatedLengthCm?: number;
  estimatedWidthCm?: number;
  estimatedHeightCm?: number;
  measureSource?: string;
  decisionStatus: LogisticsDecisionStatus;
  decisionReason?: string;
  /** User confirmed via accept-decision API. */
  decisionConfirmed?: boolean;
  acceptedAt?: string | null;
  quoteStatus?: QuoteStatus;
  recommendedLine?: LogisticsLine;
  alternativeLines?: LogisticsLine[];
  /** Shopify listing price for margin display. */
  listingPrice?: number | null;
  listingCurrency?: string | null;
  /** Tangbuy procurement cost (CNY) from binding snapshot. */
  procurementCostCny?: number | null;
}

export type PackagingType = "MINIMAL" | "CARTON";
export type LogisticsSpeedPreference = "ECONOMY" | "FAST" | "BALANCED";

export interface MarketSelection {
  marketGroupId: string;
  countryCodes: string[];
}

export interface LogisticsTemplate {
  id: string;
  shopName: string;
  name: string;
  packaging: PackagingType;
  speedPreference: LogisticsSpeedPreference;
  markets: MarketSelection[];
  isActive: boolean;
  updatedAt?: string | null;
}

export interface LogisticsTemplateUpsert {
  shopName: string;
  name?: string;
  packaging: PackagingType;
  speedPreference: LogisticsSpeedPreference;
  markets: MarketSelection[];
}

export interface ProductLogisticsProfile {
  thirdPlatformItemId: string;
  title?: string | null;
  primaryImageUrl?: string | null;
  dominantLogisticsType: LogisticsTypeCode;
  dominantLogisticsTypeLabel: string;
  totalVariants: number;
  decisionStatusCounts: Record<LogisticsDecisionStatus, number>;
  tangbuyProductId?: string | null;
  detailUrl?: string | null;
  variantDecisions: VariantLogisticsDecision[];
}

export interface LogisticsTypeCount {
  type: LogisticsTypeCode;
  label: string;
  count: number;
}

export interface LogisticsAnalysis {
  shopName: string;
  status: string;
  analyzedCount: number;
  skippedUnboundCount: number;
  productProfiles: ProductLogisticsProfile[];
  totalVariants: number;
  decisionStatusCounts: Record<LogisticsDecisionStatus, number>;
  highRiskTypes: LogisticsTypeCode[];
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
  /** Optional body under 「下一步」; falls back to a generic continue hint. */
  description?: string;
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
  /** 货源图列表（列表接口 itemImages）；上架时整组同步到 Shopify */
  imageUrls?: string[] | null;
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

/** GET /api/plugin/product/detail — Phase 1 read-only mirror detail. */
export interface ShopMirrorSku {
  id: number;
  thirdPlatformSkuId: string;
  sku?: string | null;
  title?: string | null;
  price?: number | null;
  priceLocal?: number | null;
  weightGrams?: number | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  imageUrl?: string | null;
  barcode?: string | null;
  inventoryQuantity?: number | null;
  position?: number | null;
}

export interface ShopMirrorMedia {
  id: number;
  mediaId?: string | null;
  url?: string | null;
  alt?: string | null;
  position?: number | null;
}

export interface ShopProductDetail {
  id: number;
  shopName?: string | null;
  thirdPlatformItemId: string;
  handle?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  currency?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  minWeightGrams?: number | null;
  maxWeightGrams?: number | null;
  primaryImageUrl?: string | null;
  updatedAt?: string | null;
  variants: ShopMirrorSku[];
  media: ShopMirrorMedia[];
}

/** PUT /api/plugin/product/detail — Phase 2–4 write-back body. */
export interface ShopProductVariantUpdatePayload {
  thirdPlatformSkuId: string;
  price?: number | null;
  inventoryQuantity?: number | null;
}

export interface ShopProductUpdatePayload {
  itemId: string;
  title?: string;
  description?: string;
  status?: string;
  /** @deprecated Prefer variants[]; kept for back-compat. */
  defaultVariantPrice?: number | null;
  /** Phase 4: per-variant price / inventory. */
  variants?: ShopProductVariantUpdatePayload[];
  /** Shopify variant GIDs (`thirdPlatformSkuId`) to delete on save. */
  deletedVariantIds?: string[];
  /** Shopify product media IDs to delete on save (gallery / 主图). */
  deletedMediaIds?: string[];
  /** Mirror updatedAt from last GET; server returns 409 PRODUCT_CONFLICT on mismatch. */
  expectedUpdatedAt?: string | null;
  /** Skip concurrency check and overwrite Shopify. */
  force?: boolean;
}

// ---------------------------------------------------------------------------
// A3-1 路径A（在售商品匹配）：1688 图搜预览（无状态，不落库）。
// 对应后端 ImageSearchProductVO；price 为网关原始字符串。
// ---------------------------------------------------------------------------

/** Client-side snapshot of IDs across 1688 offer ↔ Tangbuy 商品库. */
export type PoolIngestStatus =
  | "not_needed"
  | "submitted"
  | "already_exists"
  | "resolved"
  | "pending_resolve"
  | "failed"
  | "skipped";

export interface ProductSourceIdentity {
  offerId1688?: string | null;
  internalGoodsId?: string | null;
  catalogItemId?: string | null;
  tangbuySkuId?: string | null;
  tangbuyCatalogUrl?: string | null;
  offerDetailUrl?: string | null;
  dataSource?: string | null;
  resolvedVia?:
    | "catalog_match"
    | "offer_sku_lookup"
    | "internal_direct"
    | "pool_ingest_resolved"
    | "1688_only"
    | null;
  resolvedAt?: string | null;
  poolIngestStatus?: PoolIngestStatus | null;
  poolIngestedAt?: string | null;
}

/** POST /api/plugin/match/image-search 返回的归一化 1688 候选（后端已按相似度降序，前端不重排）。 */
export interface ImageSearchProduct {
  productId: string;
  title: string;
  imageUrl?: string | null;
  /** 后端归一化为可直接打开的完整 1688 offer 链接 */
  detailUrl?: string | null;
  /** 网关现价原始字符串（如 "12.00"），可能为空 */
  price?: string | null;
  supplier?: string | null;
  /** 月销（官方图搜 monthSold）——A3-3b 起替代相似度作为可信度参考 */
  soldCount?: number | null;
  /** 复购率展示串（如 "13%"）——官方图搜信号，替代相似度 */
  repurchaseRate?: string | null;
  /** A3-3b 起恒为 null（官方多语言图搜不返回逐条相似度） */
  similarityScore?: number | null;
  minOrderQty?: number | null;
  inventory?: number | null;
  skuId?: string | null;
  /** true = 来自 Tangbuy 商品库 keyword 搜（productId 为 internal goodsId） */
  catalogSource?: boolean;
  internalGoodsId?: string | null;
  catalogItemId?: string | null;
  offerId1688?: string | null;
  tangbuyCatalogUrl?: string | null;
  dataSource?: string | null;
  catalogResolvedVia?: string | null;
}

/** 本次图搜用的图源：原始货源图 / Shopify 转存图（后端决定）。 */
export type ImageSearchImageSource = "ORIGINAL" | "SHOPIFY";

/** 本次图搜纠偏词来源：无 / 商品标题 / 视觉 LLM（后端决定）。 */
export type ImageSearchQuerySource = "NONE" | "TITLE" | "LLM";

/**
 * A3-2a 包裹响应：候选列表 + 后端如何解析（用了哪张图、哪个纠偏词）。
 * appliedQuery 为展示用文案，querySource=NONE 时为 null。
 */
export interface ImageSearchResult {
  items: ImageSearchProduct[];
  imageSource: ImageSearchImageSource;
  querySource: ImageSearchQuerySource;
  appliedQuery?: string | null;
}

/** POST /api/oss/upload（前端同源代理）返回：上传后的公网图片地址。 */
export interface UploadedImage {
  url: string;
}

// ---------------------------------------------------------------------------
// A3-2b 路径A（在售商品匹配）：确认图搜结果 → 建立 SKU 级绑定（路线 B）。
// 无状态预览之上的落库；后端解析默认变体，前端只提交所选 offer。
// ---------------------------------------------------------------------------

/** POST /api/plugin/match/image-search/confirm 请求体；后端按需解析店铺默认变体。 */
export interface ConfirmImageMatchRequest {
  shopName: string;
  thirdPlatformItemId: string;
  /** 1688 offer id（必填） */
  offerProductId: string;
  offerSkuId?: string | null;
  detailUrl?: string | null;
  similarityScore?: number | null;
  imageSource?: ImageSearchImageSource | null;
  querySource?: ImageSearchQuerySource | null;
  appliedQuery?: string | null;
  /** 命中候选的图片快照，落库后回显直接用，避免再查货源明细（其白底图/SKU 常为空）。 */
  offerImageUrl?: string | null;
  /** 命中候选的价格快照（网关原始串，如 "12.00"）。 */
  offerPrice?: string | null;
  /** 命中候选的标题快照，落库后回显直接用。 */
  offerTitle?: string | null;
  /** true=扫描自动关联，落 PENDING 待确认；false/缺省=人工确认，落 ACTIVE。 */
  auto?: boolean;
}

/**
 * 图搜绑定视图：confirm 响应 + GET bindings 回显项。bound=false 为正常的"未绑定"。
 * imageSource/querySource/appliedQuery/detailUrl 由后端从审计 matchReason 解码。
 */
export type BindingStatus = "PENDING" | "ACTIVE";

export interface ImageBindingView {
  bound: boolean;
  thirdPlatformItemId?: string | null;
  thirdPlatformSkuId?: string | null;
  tangbuyProductId?: string | null;
  tangbuySkuId?: string | null;
  matchScore?: number | null;
  /** PENDING = AI 自动关联待确认；ACTIVE = 已确认。老数据可能为空。 */
  bindStatus?: BindingStatus | null;
  /** FROM_CANDIDATE = 图搜关联；FROM_PUBLISH = 商城上架；FROM_MANUAL = 人工粘贴链接匹配。 */
  bindSource?: string | null;
  imageSource?: ImageSearchImageSource | null;
  querySource?: ImageSearchQuerySource | null;
  appliedQuery?: string | null;
  detailUrl?: string | null;
  /** 确认时落库的命中候选图快照；回显优先用它，无需再查货源明细。 */
  offerImageUrl?: string | null;
  /** 确认时落库的命中候选价快照（网关原始串）。 */
  offerPrice?: string | null;
  /** 确认时落库的货源标题快照。 */
  offerTitle?: string | null;
  /** 前端合并：1688 offerId + 商品库 goodsId 等跨 ID 快照（localStorage 回填）。 */
  sourceIdentity?: ProductSourceIdentity | null;
}

/** Persisted Shopify order header (GET /api/plugin/order/header/list). */
export interface ShopOrderHeader {
  outerOrderId: string;
  orderName?: string | null;
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  currency?: string | null;
  totalPrice?: number | null;
  platformCreatedAt?: string | null;
}

/** Background image-auto-match queue progress (POST start / GET active / GET {jobId}). */
export type MatchJobStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface MatchJobProgress {
  jobId: number;
  shopName: string;
  jobType: string;
  jobStatus: MatchJobStatus;
  total: number;
  processed: number;
  linked: number;
  skipped: number;
  failed: number;
  percent: number;
  lastError?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  recent?: string[];
}

// ---------------------------------------------------------------------------
// S1-a SKU 绑定页（只读回显）：对应后端 SkuProductOverviewVO / SkuVariantVO。
// 仅返回"至少有一条 ACTIVE binding 的商品"，按商品聚合、逐变体展开。
// ---------------------------------------------------------------------------

/** 某个 Shopify 变体当前的 ACTIVE 绑定态（A3-2b 图搜 或 S1-b1 自动对齐），bound 为 null 表示未绑定。 */
export interface SkuVariantBinding {
  /** 稳定标识，预留给 S1-b 逐变体自动绑定扩展 */
  bindingId?: number | null;
  candidateId?: number | null;
  tangbuyProductId?: string | null;
  tangbuySkuId?: string | null;
  /** PENDING = AI 自动对齐待确认；ACTIVE = 已确认。老数据可能为空。 */
  bindStatus?: BindingStatus | null;
  /** S1-b1 自动对齐 / 图搜快照的 1688 规格或标题（如 "Red / M" 或货源标题） */
  tangbuySkuSpec?: string | null;
  /** 图搜确认时的候选图快照 — itemGet 不可用时的展示回退 */
  offerImageUrl?: string | null;
  /** 图搜确认时的候选价快照（网关原始串，如 "12.00"） */
  offerPrice?: string | null;
  /** 绑定来源：IMAGE（图搜确认）/ RULE / AI（自动对齐） */
  matchSource?: string | null;
  matchScore?: number | null;
  querySource?: ImageSearchQuerySource | null;
  appliedQuery?: string | null;
  detailUrl?: string | null;
}

/** 单个 Shopify 变体；optionLabel 后端保证非空（规格名兜底）。 */
export interface SkuVariant {
  thirdPlatformSkuId: string;
  sku?: string | null;
  optionLabel: string;
  price?: number | null;
  imageUrl?: string | null;
  bound?: SkuVariantBinding | null;
}

/** GET /api/plugin/match/sku/overview 返回项：按商品聚合。 */
export interface SkuProductOverview {
  thirdPlatformItemId: string;
  title?: string | null;
  imageUrl?: string | null;
  /** Product-level Tangbuy offer id (from bound variants). */
  tangbuyProductId?: string | null;
  /** Tangbuy detail URL for itemGet SKU matrix. */
  detailUrl?: string | null;
  /** Shopify shop currency for listing-price display (e.g. USD). */
  currency?: string | null;
  variants: SkuVariant[];
}

// ---------------------------------------------------------------------------
// S1-b1 逐变体 SKU 自动对齐：把已绑定商品的每个 Shopify 变体对齐到 1688 offer 的 SKU 矩阵。
// ---------------------------------------------------------------------------

/** 单个 Shopify 变体的自动对齐结果。matched=false 表示未找到可信匹配，保持原状。 */
export interface SkuAutoAlignItem {
  thirdPlatformSkuId: string;
  optionLabel: string;
  matched: boolean;
  tangbuySkuId?: string | null;
  tangbuySkuSpec?: string | null;
  score?: number | null;
}

/** POST /api/plugin/match/sku/auto-align 响应。 */
export interface SkuAutoAlignResult {
  thirdPlatformItemId: string;
  offerId: string;
  totalVariants: number;
  matchedCount: number;
  items: SkuAutoAlignItem[];
}

// ---------------------------------------------------------------------------
// S1-b0 货源明细（只读镜像后端 OfferDetailVO）：仅用于 /sku-align 右侧「图/名/价」对照，
// 由前端按需（展开商品时）拉取，不落库、不改 overview 契约。
// ---------------------------------------------------------------------------

/** 1688 SKU 的一条规格属性；skuImageUrl 为该规格值对应的图。 */
export interface OfferSkuAttribute {
  attributeName?: string | null;
  value?: string | null;
  attributeNameTrans?: string | null;
  valueTrans?: string | null;
  skuImageUrl?: string | null;
}

/** 1688 offer 下的单个 SKU；price 为网关返回的价格字符串（可能是区间）。 */
export interface OfferSku {
  skuId?: string | null;
  price?: string | null;
  consignPrice?: string | null;
  amountOnSale?: number | null;
  skuAttributes?: OfferSkuAttribute[] | null;
}

/** GET /api/plugin/match/sku/offer-detail 返回：归一化后的 1688 货源明细（含 SKU 矩阵）。 */
export interface OfferDetail {
  offerId?: string | null;
  subject?: string | null;
  subjectTrans?: string | null;
  whiteImageUrl?: string | null;
  minOrderQuantity?: number | null;
  skus?: OfferSku[] | null;
}

/** POST /api/plugin/product/sync 响应。 */
export interface ProductSyncResult {
  status: string;
  shopName: string;
  mode: string;
  windowMinutes?: number | null;
  productCount: number;
}
