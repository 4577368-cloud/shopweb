"use client";

import { useCallback, useMemo, useState } from "react";
import type { AgentIntentRequest } from "@/components/select/shop-products-panel";
import type { ShopFilter } from "@/components/select/shop-products-panel";
import {
  applyBatchAckToBindings,
  batchAckPendingBindings,
  listPendingAckProductIds,
} from "@/lib/batch-link/batch-ack-pending";
import { buildProductsPageContext } from "@/lib/agents/products/page-context";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import {
  buildProductFocusSnapshot,
  type CandidateSummary,
} from "@/lib/agents/products/product-focus-snapshot";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { AgentResponse } from "@/lib/agents/types";
import { readableError } from "@/lib/api";
import type { ProductsPageTab } from "@/lib/products/page-constants";
import type { RecommendedCategory } from "@/lib/catalog-sourcing-types";
import {
  localizeRecommendedCategoryName,
} from "@/lib/recommended-categories";
import type { ScanHandoffPayload } from "@/lib/scan/handoff";
import type { ImageBindingView, PricingTemplate, ShopMirrorProduct } from "@/lib/types";
import type { ProductsPagePhase } from "@/hooks/use-products-entry";
import type { LoadSummaryFn } from "@/hooks/use-products-entry";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface UseProductsAgentRailParams {
  phase: ProductsPagePhase;
  tab: ProductsPageTab;
  shopFilter: ShopFilter;
  isAuthorized: boolean;
  shopName: string;
  displaySummaryShopProducts: number | undefined;
  matched: number;
  pendingCount: number;
  unbound: number;
  analysisReady: boolean;
  recommendedCategories: RecommendedCategory[];
  filterSummary: string[];
  template: PricingTemplate | null;
  focusProductId: string | null;
  focusCandidateId: string | null;
  focusProductSnapshot: ReturnType<typeof buildProductFocusSnapshot> | null;
  focusCandidates: CandidateSummary[];
  shopProducts: ShopMirrorProduct[];
  bindingsMap: Record<string, ImageBindingView>;
  scanHandoff: ScanHandoffPayload | null;
  shopCurrencyHint: string | null;
  pendingMinis: import("@/lib/agents/products/shop-minis").ShopProductMini[];
  unboundMinis: import("@/lib/agents/products/shop-minis").ShopProductMini[];
  setTab: (tab: ProductsPageTab) => void;
  setShopFilter: (filter: ShopFilter) => void;
  setFocusProductId: (id: string | null) => void;
  setScrollToProductId: (id: string | null) => void;
  setFocusCandidateId: (id: string | null) => void;
  setFocusCandidates: (candidates: CandidateSummary[]) => void;
  setSearchModeProductId: (id: string | null) => void;
  setRematchUnboundSignal: React.Dispatch<React.SetStateAction<number>>;
  setFilterPresetRequest: React.Dispatch<
    React.SetStateAction<{
      categoryName?: string;
      keywords?: string;
      sourceFilter?: "all" | "tangbuy" | "1688";
      priceMaxUsd?: number;
    } | null>
  >;
  openPricingDrawer: () => void;
  syncSummaryFromShopData: (
    products: ShopMirrorProduct[],
    bindings: Record<string, ImageBindingView>
  ) => void;
  bumpMirrorRefresh: () => void;
  loadSummary: LoadSummaryFn;
  showToast: (message: string) => void;
  t: TranslateFn;
}

export function useProductsAgentRail(params: UseProductsAgentRailParams) {
  const {
    phase,
    tab,
    shopFilter,
    isAuthorized,
    shopName,
    displaySummaryShopProducts,
    matched,
    pendingCount,
    unbound,
    analysisReady,
    recommendedCategories,
    filterSummary,
    template,
    focusProductId,
    focusCandidateId,
    focusProductSnapshot,
    focusCandidates,
    shopProducts,
    bindingsMap,
    scanHandoff,
    shopCurrencyHint,
    pendingMinis,
    unboundMinis,
    setTab,
    setShopFilter,
    setFocusProductId,
    setScrollToProductId,
    setFocusCandidateId,
    setFocusCandidates,
    setSearchModeProductId,
    setRematchUnboundSignal,
    setFilterPresetRequest,
    openPricingDrawer,
    syncSummaryFromShopData,
    bumpMirrorRefresh,
    loadSummary,
    showToast,
    t,
  } = params;

  const [agentIntentRequest, setAgentIntentRequest] =
    useState<AgentIntentRequest | null>(null);
  const [highlightedArea, setHighlightedArea] = useState<string | null>(null);

  const highlight = useCallback((area: string) => {
    setHighlightedArea(area);
    setTimeout(() => setHighlightedArea(null), 2000);
  }, []);

  const productCatalog = useMemo(
    () =>
      shopProducts.map((p) => {
        const binding = bindingsMap[p.thirdPlatformItemId];
        let bindState: string = "unbound";
        if (binding?.bound) {
          bindState = binding.bindStatus === "PENDING" ? "pending" : "confirmed";
        }
        return {
          productId: p.thirdPlatformItemId,
          title: (p.title ?? "").trim() || p.thirdPlatformItemId,
          bindState,
          shopStatus: p.status,
        };
      }),
    [shopProducts, bindingsMap]
  );

  const pageContext = useMemo(
    (): ProductsPageContext =>
      buildProductsPageContext({
        phase,
        tab,
        shopFilter,
        authorized: isAuthorized,
        shopName,
        analyzedCount: displaySummaryShopProducts ?? 0,
        matchedCount: matched,
        pendingCount,
        unboundCount: unbound,
        analysisReady,
        recommendedCategoryNames: recommendedCategories.map((c) =>
          localizeRecommendedCategoryName(t, c.id, c.name)
        ),
        filterSummary,
        template,
        focusProductId,
        focusCandidateId,
        focusProduct: focusProductSnapshot,
        focusCandidates,
        productCatalog,
        scanHandoff,
        shopCurrencyHint,
        t,
      }),
    [
      phase,
      tab,
      shopFilter,
      isAuthorized,
      shopName,
      displaySummaryShopProducts,
      matched,
      pendingCount,
      unbound,
      analysisReady,
      recommendedCategories,
      filterSummary,
      template,
      focusProductId,
      focusCandidateId,
      focusProductSnapshot,
      focusCandidates,
      productCatalog,
      scanHandoff,
      shopCurrencyHint,
      t,
    ]
  );

  const agentPanelContext = useMemo(() => {
    if (!agentIntentRequest) return pageContext;
    const {
      productId,
      focusCandidateId: reqCandidateId,
      focusCandidates: reqCandidates,
    } = agentIntentRequest;
    const product = shopProducts.find(
      (p) => p.thirdPlatformItemId === productId
    );
    if (!product) return pageContext;
    return {
      ...pageContext,
      focusProductId: productId,
      focusProduct: buildProductFocusSnapshot(
        product,
        bindingsMap[productId],
        template
      ),
      focusCandidateId:
        reqCandidateId ??
        (productId === focusProductId ? focusCandidateId : null),
      focusCandidates:
        reqCandidates ??
        (productId === focusProductId ? focusCandidates : []),
    };
  }, [
    agentIntentRequest,
    pageContext,
    shopProducts,
    bindingsMap,
    focusProductId,
    focusCandidateId,
    focusCandidates,
    template,
  ]);

  const requestAgentIntent = useCallback(
    (
      intent: ProductsIntentId,
      productId: string,
      opts?: {
        focusCandidateId?: string | null;
        focusCandidates?: CandidateSummary[];
      }
    ) => {
      setFocusProductId(productId);
      setScrollToProductId(productId);
      if (opts?.focusCandidates) {
        setFocusCandidates(opts.focusCandidates);
        setFocusCandidateId(opts.focusCandidateId ?? null);
      }
      setAgentIntentRequest({
        intent,
        productId,
        focusCandidateId: opts?.focusCandidateId,
        focusCandidates: opts?.focusCandidates,
      });
    },
    [
      setFocusCandidateId,
      setFocusCandidates,
      setFocusProductId,
      setScrollToProductId,
    ]
  );

  const focusProduct = useCallback(
    (productId: string, opts?: { openSearch?: boolean }) => {
      setTab("shop");
      if (pendingMinis.some((m) => m.productId === productId)) {
        setShopFilter("pending");
      } else if (unboundMinis.some((m) => m.productId === productId)) {
        setShopFilter("unbound");
      }
      setFocusProductId(productId);
      setScrollToProductId(productId);
      if (opts?.openSearch) {
        setSearchModeProductId(productId);
      }
    },
    [
      pendingMinis,
      setSearchModeProductId,
      setScrollToProductId,
      setFocusProductId,
      setShopFilter,
      setTab,
      unboundMinis,
    ]
  );

  const applyAgentAction = useCallback(
    (res: AgentResponse) => {
      const action = res.suggestedAction;
      if (
        res.openDrawer === "pricing" ||
        action.kind === "open_pricing_drawer"
      ) {
        openPricingDrawer();
        highlight("pricing");
      }
      if (action.kind === "set_tab" && action.tab) {
        setTab(action.tab);
        highlight("tabs");
      }
      if (action.kind === "batch_ack_pending") {
        if (action.tab) setTab(action.tab);
        if (action.shopFilter) {
          setShopFilter(action.shopFilter);
          highlight("filters");
        }
        void (async () => {
          const ids = listPendingAckProductIds(shopProducts, bindingsMap);
          if (ids.length === 0) {
            showToast(t("shopProducts.toastNoPending"));
            return;
          }
          try {
            const result = await batchAckPendingBindings(shopName, ids);
            const nextBindings = applyBatchAckToBindings(
              bindingsMap,
              ids,
              result.failed
            );
            syncSummaryFromShopData(shopProducts, nextBindings);
            bumpMirrorRefresh();
            await loadSummary();
            showToast(
              result.failed.length > 0
                ? t("shopProducts.toastBatchAckPartial", {
                    ok: result.ok,
                    failed: result.failed.length,
                  })
                : t("shopProducts.toastBatchAckDone", { ok: result.ok })
            );
          } catch (err) {
            showToast(readableError(err));
          }
        })();
        return;
      }
      if (action.kind === "set_shop_filter") {
        if (action.tab) setTab(action.tab);
        if (action.shopFilter) setShopFilter(action.shopFilter);
        highlight("filters");
        if (action.shopFilter === "pending" && pendingMinis[0]) {
          setFocusProductId(pendingMinis[0].productId);
          setScrollToProductId(pendingMinis[0].productId);
        }
        if (action.shopFilter === "unbound" && unboundMinis[0]) {
          setFocusProductId(unboundMinis[0].productId);
          setScrollToProductId(unboundMinis[0].productId);
        }
      }
      if (action.kind === "focus_product" && action.productId) {
        focusProduct(action.productId);
      }
      if (action.kind === "open_candidate_search" && action.productId) {
        focusProduct(action.productId, { openSearch: true });
      }
      if (action.kind === "rematch_unbound") {
        setTab("shop");
        setRematchUnboundSignal((n) => n + 1);
      }
      if (action.kind === "apply_filter_preset") {
        setTab("catalog");
        setFilterPresetRequest({
          categoryName: action.filterPreset?.categoryName,
          keywords: action.filterPreset?.keywords,
          sourceFilter: action.filterPreset?.sourceFilter,
          priceMaxUsd: action.filterPreset?.priceMaxUsd,
        });
      }
    },
    [
      bindingsMap,
      bumpMirrorRefresh,
      focusProduct,
      highlight,
      loadSummary,
      openPricingDrawer,
      pendingMinis,
      setFilterPresetRequest,
      setFocusProductId,
      setRematchUnboundSignal,
      setScrollToProductId,
      setShopFilter,
      setTab,
      shopName,
      shopProducts,
      showToast,
      syncSummaryFromShopData,
      t,
      unboundMinis,
    ]
  );

  return {
    agentIntentRequest,
    setAgentIntentRequest,
    highlightedArea,
    pageContext,
    agentPanelContext,
    requestAgentIntent,
    focusProduct,
    applyAgentAction,
  };
}
