"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import {
  applyListingEditsToProducts,
  applyTitleEditsToProducts,
  type AiFieldEditRecord,
} from "@/lib/ai-field-edit-feedback";
import {
  isMirrorCacheFresh,
  peekMirrorCache,
  setMirrorCache,
} from "@/lib/products/mirror-cache";
import type { ProductsSummary } from "@/lib/products/page-constants";
import { assembleLaunchSummaryFastFromMirror } from "@/lib/sync/assemble-launch-summary";
import { setLaunchSummaryCacheIfNotFull } from "@/lib/sync/launch-summary-cache";
import { warmLaunchSummaryPartial } from "@/lib/sync/warm-launch-summary-partial";
import {
  computeShopProductBindingStats,
  indexImageBindings,
} from "@/lib/shop-product-binding-stats";
import type { ImageBindingView, PricingTemplate, ShopMirrorProduct } from "@/lib/types";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface UseProductsMirrorParams {
  shopName: string;
  shopMirrorKey: string;
  shopDomain: string;
  batchLinkBusyRef: React.RefObject<boolean>;
  aiFieldEditsRef: React.RefObject<Record<string, AiFieldEditRecord>>;
  refreshNewArrivalAwareness: (
    products: ShopMirrorProduct[],
    bindings: Record<string, ImageBindingView>
  ) => void;
  setPricingTemplate: (template: PricingTemplate | null) => void;
  t: TranslateFn;
}

export function useProductsMirror({
  shopName,
  shopMirrorKey,
  shopDomain,
  batchLinkBusyRef,
  aiFieldEditsRef,
  refreshNewArrivalAwareness,
  setPricingTemplate,
  t,
}: UseProductsMirrorParams) {
  const [summary, setSummary] = useState<ProductsSummary | null>(null);
  const [shopProducts, setShopProducts] = useState<ShopMirrorProduct[]>([]);
  const [bindingsMap, setBindingsMap] = useState<
    Record<string, ImageBindingView>
  >({});
  const [mirrorRefreshSignal, setMirrorRefreshSignal] = useState(0);

  const bumpMirrorRefresh = useCallback(() => {
    setMirrorRefreshSignal((n) => n + 1);
  }, []);

  const applyEdits = useCallback(
    (products: ShopMirrorProduct[]) =>
      applyTitleEditsToProducts(
        applyListingEditsToProducts(products, aiFieldEditsRef.current),
        aiFieldEditsRef.current
      ),
    [aiFieldEditsRef]
  );

  const publishMirrorState = useCallback(
    (
      products: ShopMirrorProduct[],
      bindings: Record<string, ImageBindingView>
    ) => {
      const stats = computeShopProductBindingStats(products, bindings);
      const merged = applyEdits(products);
      setBindingsMap(bindings);
      setShopProducts(merged);
      setSummary({
        shopProducts: stats.analyzed,
        confirmedProducts: stats.confirmed,
        pendingProducts: stats.pending,
      });
      refreshNewArrivalAwareness(merged, bindings);
      return { merged, stats };
    },
    [applyEdits, refreshNewArrivalAwareness]
  );

  const loadSummary = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const silent = opts?.silent ?? false;
      const force = opts?.force ?? false;

      if (silent && !force && batchLinkBusyRef.current) {
        const cached = peekMirrorCache(shopMirrorKey);
        if (cached) {
          return { products: cached.items, bindings: cached.bindings };
        }
      }

      if (!silent) {
        const cached = peekMirrorCache(shopMirrorKey);
        if (cached) {
          const { merged } = publishMirrorState(cached.items, cached.bindings);
          void loadSummary({ silent: true });
          return { products: merged, bindings: cached.bindings };
        }
      }

      if (silent && !force && isMirrorCacheFresh(shopMirrorKey)) {
        try {
          const bindings = await api
            .listImageBindings(shopName)
            .catch(() => [] as ImageBindingView[]);
          const map = indexImageBindings(bindings);
          const cached = peekMirrorCache(shopMirrorKey);
          const products = cached?.items ?? [];
          const { merged } = publishMirrorState(products, map);
          setMirrorCache(shopMirrorKey, { items: products, bindings: map });
          return { products: merged, bindings: map };
        } catch {
          return null;
        }
      }

      if (!batchLinkBusyRef.current) {
        void api.backfillPublishedBindings(shopName).catch(() => null);
      }
      const [products, bindings, tpl] = await Promise.all([
        api.getShopProducts(shopName).catch(() => [] as ShopMirrorProduct[]),
        api.listImageBindings(shopName).catch(() => []),
        api.getPricingTemplate(shopName).catch(() => null),
      ]);
      const map = indexImageBindings(bindings);
      const { merged } = publishMirrorState(products, map);
      setPricingTemplate(tpl);
      setMirrorCache(shopMirrorKey, { items: products, bindings: map });
      const partial = assembleLaunchSummaryFastFromMirror(
        shopMirrorKey,
        shopName,
        shopDomain,
        t
      );
      if (partial) setLaunchSummaryCacheIfNotFull(shopMirrorKey, partial);
      warmLaunchSummaryPartial(shopMirrorKey, shopName, shopDomain, t, {
        shopProducts: products,
        bindings: map,
        pricingTemplate: tpl ?? undefined,
      });
      return { products: merged, bindings: map };
    },
    [
      batchLinkBusyRef,
      publishMirrorState,
      setPricingTemplate,
      shopDomain,
      shopMirrorKey,
      shopName,
      t,
    ]
  );

  const syncSummaryFromShopData = useCallback(
    (
      products: ShopMirrorProduct[],
      bindings: Record<string, ImageBindingView>
    ) => {
      const stats = computeShopProductBindingStats(products, bindings);
      setShopProducts(products);
      setBindingsMap(bindings);
      setSummary({
        shopProducts: stats.analyzed,
        confirmedProducts: stats.confirmed,
        pendingProducts: stats.pending,
      });
      refreshNewArrivalAwareness(products, bindings);
    },
    [refreshNewArrivalAwareness]
  );

  const refreshProductsQuietly = useCallback(() => {
    if (batchLinkBusyRef.current) return;
    void loadSummary({ silent: true });
  }, [batchLinkBusyRef, loadSummary]);

  return {
    summary,
    shopProducts,
    setShopProducts,
    bindingsMap,
    setBindingsMap,
    loadSummary,
    syncSummaryFromShopData,
    mirrorRefreshSignal,
    bumpMirrorRefresh,
    refreshProductsQuietly,
  };
}
