/** Controlled NL commands — not open chat. */
export type ProductCommandId =
  | "open_filter"
  | "focus_product"
  | "rerun_candidate_search"
  | "explain_product_match"
  | "open_pricing_editor"
  | "update_listing_price"
  | "update_product_copy"
  | "batch_update_product_copy"
  | "batch_update_listing_price";

export type ProductCommandTargetScope = "current" | "explicit" | "none" | "all";

export type ProductCommandShopFilter =
  | "all"
  | "pending"
  | "confirmed"
  | "unbound"
  | "new_arrivals";

export type ListingPriceScope = "all" | "one";

export interface ProductCommandParams {
  shopFilter?: ProductCommandShopFilter;
  productId?: string;
  /** Title fragment from user text — resolved against mirror catalog in rules layer */
  productTitleHint?: string;
  /** Shopify listing / variant price — never procurement cost */
  price?: number;
  currency?: string;
  /** Multi-variant: all SKUs vs one SKU — chosen in confirm UI if unset */
  priceScope?: ListingPriceScope;
  variantSkuId?: string;
  variantLabelHint?: string;
  matchExplain?: "reason" | "risk";
  /** Product copy / title update */
  copyField?: "title" | "description" | "all";
  copyAction?: "translate" | "rewrite" | "optimize";
  copyTargetLang?: string;
  /** title translate style: amazon = marketplace rewrite; literal = direct translation */
  copyStyle?: "amazon" | "literal";
  copyTone?: string;
  copyRawText?: string;
  /** Batch: filter scope — which subset of products to process */
  batchFilter?: "all" | "pending" | "confirmed" | "unbound";
  /** Batch: max number of products to process (0 = all matching) */
  batchLimit?: number;
  /** Batch: resolved product IDs (computed during planning phase) */
  batchProductIds?: string[];
  /** Batch price: multiplier of procurement cost (e.g., 2 = 2x cost) */
  batchPriceMultiplier?: number;
  /** Batch price: fixed target price */
  batchPriceFixed?: number;
}

export interface ProductCommandDraft {
  intent: ProductCommandId;
  targetScope: ProductCommandTargetScope;
  productId?: string;
  params: ProductCommandParams;
  confirmationRequired: boolean;
}

export type ProductCommandClassifySource = "rules" | "llm" | "default";

export interface ProductCommandClassifyResult {
  confidence: "high" | "none";
  source: ProductCommandClassifySource;
  draft?: ProductCommandDraft;
  clarify?: string;
}

export interface ProductCommandPlan {
  draft: ProductCommandDraft;
  operation: string;
  targetLabel: string;
  detailLines: string[];
  executable: boolean;
  clarify?: string;
}

export type ProductCommandExecution =
  | { type: "agent_action"; action: import("@/lib/agents/types").AgentSuggestedAction }
  | {
      type: "agent_intent";
      intent: import("@/lib/agents/products/intents").ProductsIntentId;
      productId?: string;
    }
  | {
      type: "listing_price_update";
      productId: string;
      productTitle: string;
      price: number;
      currency: string;
      variantScope: ListingPriceScope;
      variantSkuId?: string;
    }
  | {
      type: "product_copy_update";
      productId: string;
      productTitle: string;
      copyField: "title" | "description" | "all";
      copyAction: "translate" | "rewrite" | "optimize";
      targetLang?: string;
      tone?: string;
    }
  | {
      type: "batch_product_copy_update";
      productIds: string[];
      totalCount: number;
      copyField: "title" | "description" | "all";
      copyAction: "translate" | "rewrite" | "optimize";
      targetLang?: string;
      tone?: string;
      filterLabel: string;
    }
  | {
      type: "batch_listing_price_update";
      productIds: string[];
      totalCount: number;
      batchPriceMultiplier?: number;
      batchPriceFixed?: number;
      filterLabel: string;
    };

export const PRODUCT_COMMAND_IDS: ProductCommandId[] = [
  "open_filter",
  "focus_product",
  "rerun_candidate_search",
  "explain_product_match",
  "open_pricing_editor",
  "update_listing_price",
  "update_product_copy",
  "batch_update_product_copy",
  "batch_update_listing_price",
];

export const PRODUCT_COMMAND_SET = new Set<ProductCommandId>(PRODUCT_COMMAND_IDS);

export type CommandSensitivity = "high" | "low";

export const PRODUCT_COMMAND_DEFS: {
  id: ProductCommandId;
  label: string;
  description: string;
  defaultConfirmation: boolean;
  sensitivity: CommandSensitivity;
}[] = [
  {
    id: "open_filter",
    label: "切换筛选",
    description: "切换商品列表筛选，如待确认、未匹配、新入库",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "focus_product",
    label: "聚焦商品",
    description: "在列表中定位并高亮某个商品",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "rerun_candidate_search",
    label: "重搜候选",
    description: "为当前商品重新图搜货源候选",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "explain_product_match",
    label: "解释匹配",
    description: "解释为何推荐当前货源或有哪些不确定点",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "open_pricing_editor",
    label: "打开定价",
    description: "打开定价策略侧栏或商品售价编辑入口",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "update_listing_price",
    label: "修改售价",
    description: "修改 Shopify 商品上架售价（listing price），不是采购价",
    defaultConfirmation: true,
    sensitivity: "high",
  },
  {
    id: "update_product_copy",
    label: "修改文案",
    description: "翻译、改写或优化商品标题、描述等文案，确认后直接更新到 Shopify",
    defaultConfirmation: true,
    sensitivity: "low",
  },
  {
    id: "batch_update_product_copy",
    label: "批量修改文案",
    description: "批量翻译、改写或优化多个商品的标题、描述等文案，自动逐个更新到 Shopify",
    defaultConfirmation: true,
    sensitivity: "low",
  },
  {
    id: "batch_update_listing_price",
    label: "批量修改售价",
    description: "批量更新多个商品的上架售价，支持按采购价倍数、固定价格等方式计算",
    defaultConfirmation: true,
    sensitivity: "high",
  },
];
