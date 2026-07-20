import type { CatalogFilterState } from "@/lib/catalog-sourcing-types";
import type { PricingTemplate } from "@/lib/types";
import type { BasePageContext } from "@/lib/agents/runtime";

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

export function buildProductsPageContext(
  input: BuildProductsPageContextInput
): ProductsPageContext {
  const pricing = buildPricingContext(input.template);
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
  };
}

/** Optional: keep filter state typed for future lifting into context. */
export type ProductsCatalogFilters = CatalogFilterState;
