import type { CatalogFilterState } from "@/lib/catalog-sourcing-types";
import type { PricingTemplate } from "@/lib/types";
import type { BasePageContext } from "@/lib/agents/runtime";
import type { ProductFocusSnapshot, CandidateSummary } from "@/lib/agents/products/product-focus-snapshot";
import type { ProductCatalogEntry } from "@/lib/agents/products/resolve-product-target";
import type { ScanHandoffPayload } from "@/lib/scan/handoff";
import type { TranslateFn } from "@/i18n/server";
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
export type ProductsShopFilter =
  | "all"
  | "new_arrivals"
  | "pending"
  | "confirmed"
  | "unbound";
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
 * Readable snapshot of the products page for agents / conversational layer.
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
  /** Mirror catalog for title → productId resolution (rules only). */
  productCatalog: ProductCatalogEntry[];
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
  productCatalog?: ProductCatalogEntry[];
  scanHandoff?: ScanHandoffPayload | null;
  shopCurrencyHint?: string | null;
  t: TranslateFn;
}

export function buildPricingContext(
  template: PricingTemplate | null,
  t: TranslateFn
): ProductsPricingContext {
  if (!template) {
    return {
      configured: false,
      isDefault: true,
      targetCurrency: null,
      exchangeRate: null,
      multiplier: null,
      addend: null,
      summaryLine: t("productsPricing.summaryMissing"),
    };
  }
  const configured = !needsPricingSetup(template);
  const baseParams = {
    currency: template.targetCurrency,
    rate: template.exchangeRate,
    multiplier: template.multiplier,
  };
  return {
    configured,
    isDefault: template.isDefault,
    targetCurrency: template.targetCurrency,
    exchangeRate: template.exchangeRate,
    multiplier: template.multiplier,
    addend: template.addend,
    summaryLine: configured
      ? template.addend
        ? t("productsPricing.summaryConfiguredAddend", {
            ...baseParams,
            addend: template.addend,
          })
        : t("productsPricing.summaryConfigured", baseParams)
      : t("productsPricing.summaryDefault"),
  };
}

export function purchaseDisplayAlignedWithPricing(
  pricing: ProductsPricingContext,
  purchase: ProductsPurchaseDisplayContext
): boolean {
  return (
    pricing.configured &&
    pricing.exchangeRate === purchase.exchangeRate &&
    pricing.targetCurrency === purchase.currency
  );
}

export function buildPurchaseDisplayContext(
  t: TranslateFn,
  shopCurrencyHint?: string | null,
  template?: PricingTemplate | null
): ProductsPurchaseDisplayContext {
  const ctx = resolvePurchaseCostDisplayContext(shopCurrencyHint, template);
  const summaryLine = ctx.fromPricingTemplate
    ? t("productsPricing.purchaseFromTemplate", {
        currency: ctx.currency,
        rate: ctx.exchangeRate,
      })
    : t("productsPricing.purchaseDefault", {
        currency: ctx.currency,
        rate: ctx.exchangeRate,
      });
  return {
    currency: ctx.currency,
    exchangeRate: ctx.exchangeRate,
    summaryLine,
  };
}

export function buildProductsPageContext(
  input: BuildProductsPageContextInput
): ProductsPageContext {
  const pricing = buildPricingContext(input.template, input.t);
  const purchaseDisplay = buildPurchaseDisplayContext(
    input.t,
    input.shopCurrencyHint,
    input.template
  );
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
    productCatalog: input.productCatalog ?? [],
    purchaseDisplay,
    scanHandoff: input.scanHandoff ?? null,
  };
}

/** Optional: keep filter state typed for future lifting into context. */
export type ProductsCatalogFilters = CatalogFilterState;
