"use client";

import { useCallback, useMemo } from "react";
import type { ComponentProps } from "react";
import { ShopProductsPanel } from "@/components/select/shop-products-panel";
import type {
  ProductsShopTabSummaryProps,
} from "@/components/select/products-page/products-shop-tab";
import type { RecommendedCategory } from "@/lib/catalog-sourcing-types";
import type { BatchLinkProgress, BatchLinkRequest } from "@/lib/batch-link/types";
import type { ShopFilter } from "@/components/select/shop-products-panel";
import type { AiFieldEditRecord } from "@/lib/ai-field-edit-feedback";
import type { CandidateSummary } from "@/lib/agents/products/product-focus-snapshot";
import type { ImageBindingView, PricingTemplate, ShopMirrorProduct } from "@/lib/types";
import type { ShopProductMini } from "@/lib/agents/products/shop-minis";

export interface UseProductsShopTabPropsParams {
  displaySummaryReady: boolean;
  displaySummaryShopProducts: number;
  matched: number;
  pendingCount: number;
  unbound: number;
  pendingNewAnalysisCount: number;
  pendingNewAnalysisIds: Set<string>;
  recommendedCategories: RecommendedCategory[];
  restartScan: () => void;
  setShopFilter: (filter: ShopFilter) => void;
  hasNewProductsToLink: boolean;
  enqueueNewArrivalsBatchLink: () => void;
  batchLinkActive: boolean;
  refreshProductsQuietly: () => void;
  shopFilter: ShopFilter;
  commitAnalysisBaseline: (products: ShopMirrorProduct[]) => void;
  focusProductId: string | null;
  scrollToProductId: string | null;
  setScrollToProductId: (id: string | null) => void;
  searchModeProductId: string | null;
  setSearchModeProductId: (id: string | null) => void;
  rematchUnboundSignal: number;
  batchLinkRequest: BatchLinkRequest | null;
  mirrorRefreshSignal: number;
  handleBatchLinkProgressChange: (progress: BatchLinkProgress) => void;
  setPageLinkableScope: (scope: {
    ids: string[];
    page: number;
    totalPages: number;
  }) => void;
  onBatchLinkFinished: (progress: BatchLinkProgress) => void;
  setFocusProductId: (id: string | null) => void;
  setBindingsMap: React.Dispatch<
    React.SetStateAction<Record<string, ImageBindingView>>
  >;
  syncSummaryFromShopData: (
    products: ShopMirrorProduct[],
    bindings: Record<string, ImageBindingView>
  ) => void;
  setFocusCandidateId: (id: string | null) => void;
  setFocusCandidates: (candidates: CandidateSummary[]) => void;
  setPendingMinis: (minis: ShopProductMini[]) => void;
  setUnboundMinis: (minis: ShopProductMini[]) => void;
  aiFieldEdits: Record<string, AiFieldEditRecord>;
  clearAiFieldEdit: (productId: string, field: import("@/lib/ai-field-edit-feedback").AiFieldId) => void;
  searchQuery: string;
  filtersHighlighted: boolean;
  template: PricingTemplate | null;
}

export function useProductsShopTabProps(
  params: UseProductsShopTabPropsParams
): {
  summary: ProductsShopTabSummaryProps;
  panel: ComponentProps<typeof ShopProductsPanel>;
} {
  const {
    displaySummaryReady,
    displaySummaryShopProducts,
    matched,
    pendingCount,
    unbound,
    pendingNewAnalysisCount,
    pendingNewAnalysisIds,
    recommendedCategories,
    restartScan,
    setShopFilter,
    hasNewProductsToLink,
    enqueueNewArrivalsBatchLink,
    batchLinkActive,
    refreshProductsQuietly,
    shopFilter,
    commitAnalysisBaseline,
    focusProductId,
    scrollToProductId,
    setScrollToProductId,
    searchModeProductId,
    setSearchModeProductId,
    rematchUnboundSignal,
    batchLinkRequest,
    mirrorRefreshSignal,
    handleBatchLinkProgressChange,
    setPageLinkableScope,
    onBatchLinkFinished,
    setFocusProductId,
    setBindingsMap,
    syncSummaryFromShopData,
    setFocusCandidateId,
    setFocusCandidates,
    setPendingMinis,
    setUnboundMinis,
    aiFieldEdits,
    clearAiFieldEdit,
    searchQuery,
    filtersHighlighted,
    template,
  } = params;

  const onViewNewArrivals = useCallback(
    () => setShopFilter("new_arrivals"),
    [setShopFilter]
  );

  const onBatchLinkNewArrivals = useMemo(
    () =>
      hasNewProductsToLink
        ? () => void enqueueNewArrivalsBatchLink()
        : undefined,
    [hasNewProductsToLink, enqueueNewArrivalsBatchLink]
  );

  const summary = useMemo(
    (): ProductsShopTabSummaryProps => ({
      ready: displaySummaryReady,
      analyzed: displaySummaryShopProducts,
      matched,
      pending: pendingCount,
      unbound,
      pendingNewAnalysis: pendingNewAnalysisCount,
      recommendedCategories,
      onRefresh: restartScan,
      onViewNewArrivals,
      onBatchLinkNewArrivals,
      batchLinkBusy: batchLinkActive,
    }),
    [
      displaySummaryReady,
      displaySummaryShopProducts,
      matched,
      pendingCount,
      unbound,
      pendingNewAnalysisCount,
      recommendedCategories,
      restartScan,
      onViewNewArrivals,
      onBatchLinkNewArrivals,
      batchLinkActive,
    ]
  );

  const onScrollToConsumed = useCallback(
    () => setScrollToProductId(null),
    [setScrollToProductId]
  );

  const onSearchModeConsumed = useCallback(
    () => setSearchModeProductId(null),
    [setSearchModeProductId]
  );

  const onProductFocus = useCallback(
    (id: string) => setFocusProductId(id),
    [setFocusProductId]
  );

  const onCandidateContextChange = useCallback(
    (
      productId: string,
      ctx: { candidateId: string | null; candidates: CandidateSummary[] }
    ) => {
      if (productId !== focusProductId) return;
      setFocusCandidateId(ctx.candidateId);
      setFocusCandidates(ctx.candidates);
    },
    [focusProductId, setFocusCandidateId, setFocusCandidates]
  );

  const onMinisChange = useCallback(
    ({ pending, unbound: unboundMini }: { pending: ShopProductMini[]; unbound: ShopProductMini[] }) => {
      setPendingMinis(pending);
      setUnboundMinis(unboundMini);
    },
    [setPendingMinis, setUnboundMinis]
  );

  const panel = useMemo(
    (): ComponentProps<typeof ShopProductsPanel> => ({
      onActivity: refreshProductsQuietly,
      filter: shopFilter,
      onFilterChange: setShopFilter,
      pendingNewAnalysisIds,
      onMirrorAnalysisCommitted: commitAnalysisBaseline,
      focusProductId,
      scrollToProductId,
      onScrollToConsumed,
      searchModeProductId,
      rematchUnboundSignal,
      batchLinkRequest,
      mirrorRefreshSignal,
      linkingLocked: batchLinkActive,
      onBatchLinkProgressChange: handleBatchLinkProgressChange,
      onPageLinkableScopeChange: setPageLinkableScope,
      onBatchLinkFinished,
      onSearchModeConsumed,
      onProductFocus,
      onBindingsChange: setBindingsMap,
      onShopProductsChange: syncSummaryFromShopData,
      onCandidateContextChange,
      onMinisChange,
      aiFieldEdits,
      onAiFieldEditConsumed: clearAiFieldEdit,
      searchQuery,
      highlighted: filtersHighlighted,
      pricingTemplate: template,
    }),
    [
      refreshProductsQuietly,
      shopFilter,
      setShopFilter,
      pendingNewAnalysisIds,
      commitAnalysisBaseline,
      focusProductId,
      scrollToProductId,
      onScrollToConsumed,
      searchModeProductId,
      rematchUnboundSignal,
      batchLinkRequest,
      mirrorRefreshSignal,
      batchLinkActive,
      handleBatchLinkProgressChange,
      setPageLinkableScope,
      onBatchLinkFinished,
      onSearchModeConsumed,
      onProductFocus,
      setBindingsMap,
      syncSummaryFromShopData,
      onCandidateContextChange,
      onMinisChange,
      aiFieldEdits,
      clearAiFieldEdit,
      searchQuery,
      filtersHighlighted,
      template,
    ]
  );

  return { summary, panel };
}
