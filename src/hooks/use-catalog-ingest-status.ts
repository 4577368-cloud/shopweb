"use client";

import { useCallback, useEffect, useState } from "react";
import {
  isCatalogIngesting,
  resolveMergedSourceIdentity,
} from "@/lib/tangbuy/catalog-ingest-display";
import { writeProductSourceIdentity } from "@/lib/product-source-identity";
import { retryPendingPoolResolve } from "@/lib/tangbuy/preferred-pool";
import type { ImageBindingView } from "@/lib/types";

export function useCatalogIngestStatus(
  shopName: string,
  thirdPlatformItemId: string | undefined,
  binding?: ImageBindingView | null,
  options?: { poll?: boolean; titleHint?: string | null; tangbuySkuId?: string | null }
): boolean {
  const [ingesting, setIngesting] = useState(false);

  const refresh = useCallback(async () => {
    if (!shopName.trim() || !thirdPlatformItemId?.trim()) {
      setIngesting(false);
      return;
    }

    let identity = resolveMergedSourceIdentity(
      shopName,
      thirdPlatformItemId,
      binding
    );

    if (identity && isCatalogIngesting(identity) && options?.poll) {
      const retried = await retryPendingPoolResolve(identity, {
        shopName,
        titleHint: options.titleHint,
        tangbuySkuId: options.tangbuySkuId ?? identity.tangbuySkuId,
      });
      if (retried.internalGoodsId?.trim()) {
        writeProductSourceIdentity(shopName, thirdPlatformItemId, retried);
        identity = retried;
      }
    }

    setIngesting(isCatalogIngesting(identity));
  }, [
    shopName,
    thirdPlatformItemId,
    binding,
    options?.poll,
    options?.titleHint,
    options?.tangbuySkuId,
  ]);

  useEffect(() => {
    void refresh();
    if (!options?.poll) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh, options?.poll]);

  return ingesting;
}
