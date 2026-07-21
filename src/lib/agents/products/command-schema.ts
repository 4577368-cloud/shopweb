/** Controlled NL commands — not open chat. */
export type ProductCommandId =
  | "open_filter"
  | "focus_product"
  | "rerun_candidate_search"
  | "explain_product_match"
  | "open_pricing_editor"
  | "update_listing_price";

export type ProductCommandTargetScope = "current" | "explicit" | "none";

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
    };

export const PRODUCT_COMMAND_IDS: ProductCommandId[] = [
  "open_filter",
  "focus_product",
  "rerun_candidate_search",
  "explain_product_match",
  "open_pricing_editor",
  "update_listing_price",
];

export const PRODUCT_COMMAND_SET = new Set<ProductCommandId>(PRODUCT_COMMAND_IDS);

export const PRODUCT_COMMAND_DEFS: {
  id: ProductCommandId;
  label: string;
  description: string;
  defaultConfirmation: boolean;
}[] = [
  {
    id: "open_filter",
    label: "切换筛选",
    description: "切换商品列表筛选，如待确认、未匹配、新入库",
    defaultConfirmation: false,
  },
  {
    id: "focus_product",
    label: "聚焦商品",
    description: "在列表中定位并高亮某个商品",
    defaultConfirmation: false,
  },
  {
    id: "rerun_candidate_search",
    label: "重搜候选",
    description: "为当前商品重新图搜货源候选",
    defaultConfirmation: false,
  },
  {
    id: "explain_product_match",
    label: "解释匹配",
    description: "解释为何推荐当前货源或有哪些不确定点",
    defaultConfirmation: false,
  },
  {
    id: "open_pricing_editor",
    label: "打开定价",
    description: "打开定价策略侧栏或商品售价编辑入口",
    defaultConfirmation: false,
  },
  {
    id: "update_listing_price",
    label: "修改售价",
    description: "修改 Shopify 商品上架售价（listing price），不是采购价",
    defaultConfirmation: true,
  },
];
