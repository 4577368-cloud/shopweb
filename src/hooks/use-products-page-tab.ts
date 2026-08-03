"use client";

import { useCallback, useEffect, useState, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { localePath } from "@/i18n/LocaleLink";
import type { Locale } from "@/i18n/config";
import {
  PRODUCTS_LEGACY_BUNDLES_TAB,
  type ProductsPageTab,
} from "@/lib/products/page-constants";

export function useProductsPageTab(locale: Locale) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const legacyBundles = raw === PRODUCTS_LEGACY_BUNDLES_TAB;
  const urlTab: ProductsPageTab = raw === "catalog" ? "catalog" : "shop";
  const [tab, setTabLocal] = useState<ProductsPageTab>(urlTab);

  useEffect(() => {
    setTabLocal(urlTab);
  }, [urlTab]);

  // Old links `?tab=bundles` → stay on shop and let the page open the hub overlay.
  useEffect(() => {
    if (!legacyBundles) return;
    startTransition(() => {
      router.replace(localePath(locale, "/products?tab=shop"), { scroll: false });
    });
  }, [legacyBundles, router, locale]);

  const setTab = useCallback(
    (next: ProductsPageTab) => {
      setTabLocal(next);
      const current = searchParams.get("tab");
      const already =
        current === next ||
        (next === "shop" && (current == null || current === "" || current === PRODUCTS_LEGACY_BUNDLES_TAB));
      if (already) return;
      startTransition(() => {
        router.replace(localePath(locale, `/products?tab=${next}`), {
          scroll: false,
        });
      });
    },
    [router, searchParams, locale]
  );

  return { tab, setTab, openBundlesHubFromUrl: legacyBundles };
}
