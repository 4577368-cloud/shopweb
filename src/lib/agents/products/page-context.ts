import type { CatalogFilterState } from "@/lib/catalog-sourcing-types";
import type { PricingTemplate } from "@/lib/types";
import type { BasePageContext } from "@/lib/agents/runtime";
import type { ProductFocusSnapshot, CandidateSummary } from "@/lib/agents/products/product-focus-snapshot";
import type { ScanHandoffPayload } from "@/lib/scan/handoff";
import {
  resolvePurchaseCostDisplayContext,
} from "@/lib/purchase-cost-display";

/** Purchase-cost display layer (Shopify tab) — not listing pricing. */
export interface ProductsPurchaseDisplayContext {
  currency: string;
  exchangeRate: number;
  summaryLine: string;
}

/** Same rule as PricingStrategyRailCard — keep agent context in sync. */
function needsPricingSetup(template: PricingTemplate | null): boolean {
  return template == null || template.isDefault;
}

export type ProductsTab = "shop" | "catalog";
export type ProductsShopFilter = "all" | "pending" | "confirmed" | "unbound";
export type ProductsPhase = "scan" | "result";

export interface ProductsPricingContext {
  configured: boolean;
  isDefault: boolean;
  targetCurrency: string | null;
  exchangeRate: number | null;
  multiplier: number | null;
  addend: number | null;
  /** One-line human summary for agents */
  summaryLine: string;
}

/**
 * Readable snapshot of the 智能选品 page for agents / conversational layer.
 * Extends BasePageContext; page-specific fields stay here.
 */
export interface ProductsPageContext extends BasePageContext {
  page: "products";
  phase: ProductsPhase;
  tab: ProductsTab;
  shopFilter: ProductsShopFilter;
  analyzedCount: number;
  matchedCount: number;
  pendingCount: number;
  unboundCount: number;
  analysisReady: boolean;
  recommendedCategoryNames: string[];
  /** Applied catalog filter chips (discover tab); may be empty on shop tab */
  filterSummary: string[];
  pricing: ProductsPricingContext;
  hasStrategyCard: boolean;
  focusProductId: string | null;
  focusCandidateId: string | null;
  /** Rule-built snapshot for per-product intents */
  focusProduct: ProductFocusSnapshot | null;
  focusCandidates: CandidateSummary[];
  purchaseDisplay: ProductsPurchaseDisplayContext;
  /** One-shot context after scan → result handoff */
  scanHandoff: ScanHandoffPayload | null;
}

export interface BuildProductsPageContextInput {
  phase: ProductsPhase;
  tab: ProductsTab;
  shopFilter: ProductsShopFilter;
  authorized: boolean;
  shopName: string;
  analyzedCount: number;
  matchedCount: number;
  pendingCount: number;
  unboundCount: number;
  analysisReady: boolean;
  recommendedCategoryNames: string[];
  filterSummary?: string[];
  template: PricingTemplate | null;
  focusProductId?: string | null;
  focusCandidateId?: string | null;
  focusProduct?: ProductFocusSnapshot | null;
  focusCandidates?: CandidateSummary[];
  scanHandoff?: ScanHandoffPayload | null;
  shopCurrencyHint?: string | null;
}

export function buildPricingContext(
  template: PricingTemplate | null
): ProductsPricingContext {
  if (!template) {
    return {
      configured: false,
      isDefault: true,
      targetCurrency: null,
      exchangeRate: null,
      multiplier: null,
      addend: null,
      summaryLine: "尚未读取到定价模板",
    };
  }
  const configured = !needsPricingSetup(template);
  return {
    configured,
    isDefault: template.isDefault,
    targetCurrency: template.targetCurrency,
    exchangeRate: template.exchangeRate,
    multiplier: template.multiplier,
    addend: template.addend,
    summaryLine: configured
      ? `已配置：${template.targetCurrency} · 汇率 ${template.exchangeRate} · 倍率 ×${template.multiplier}${
          template.addend ? ` · 加价 +${template.addend}` : ""
        }`
      : "尚未完成有效定价配置（当前为系统默认）",
  };
}

export function buildPurchaseDisplayContext(
  shopCurrencyHint?: string | null
): ProductsPurchaseDisplayContext {
  const ctx = resolvePurchaseCostDisplayContext(shopCurrencyHint);
  return {
    currency: ctx.currency,
    exchangeRate: ctx.exchangeRate,
    summaryLine: `采购价展示：${ctx.currency} · 默认汇率 ${ctx.exchangeRate}（不含倍率加价）`,
  };
}

export function buildProductsPageContext(
  input: BuildProductsPageContextInput
): ProductsPageContext {
  const pricing = buildPricingContext(input.template);
  const purchaseDisplay = buildPurchaseDisplayContext(input.shopCurrencyHint);
  return {
    page: "products",
    phase: input.phase,
    tab: input.tab,
    shopFilter: input.shopFilter,
    authorized: input.authorized,
    shopName: input.shopName,
    analyzedCount: input.analyzedCount,
    matchedCount: input.matchedCount,
    pendingCount: input.pendingCount,
    unboundCount: input.unboundCount,
    analysisReady: input.analysisReady,
    recommendedCategoryNames: input.recommendedCategoryNames,
    filterSummary: input.filterSummary ?? [],
    pricing,
    hasStrategyCard: input.authorized,
    focusProductId: input.focusProductId ?? null,
    focusCandidateId: input.focusCandidateId ?? null,
    focusProduct: input.focusProduct ?? null,
    focusCandidates: input.focusCandidates ?? [],
    purchaseDisplay,
    scanHandoff: input.scanHandoff ?? null,
  };
}

/** Optional: keep filter state typed for future lifting into context. */
export type ProductsCatalogFilters = CatalogFilterState;
