"use client";

import { useCallback, useEffect, useState, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { localePath } from "@/i18n/LocaleLink";
import type { Locale } from "@/i18n/config";
import type { ProductsPageTab } from "@/lib/products/page-constants";

export function useProductsPageTab(locale: Locale) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab: ProductsPageTab =
    searchParams.get("tab") === "catalog" ? "catalog" : "shop";
  const [tab, setTabLocal] = useState<ProductsPageTab>(urlTab);

  useEffect(() => {
    setTabLocal(urlTab);
  }, [urlTab]);

  const setTab = useCallback(
    (next: ProductsPageTab) => {
      setTabLocal(next);
      const current = searchParams.get("tab");
      const already =
        current === next ||
        (next === "shop" && (current == null || current === ""));
      if (already) return;
      startTransition(() => {
        router.replace(localePath(locale, `/products?tab=${next}`), {
          scroll: false,
        });
      });
    },
    [router, searchParams, locale]
  );

  return { tab, setTab };
}
