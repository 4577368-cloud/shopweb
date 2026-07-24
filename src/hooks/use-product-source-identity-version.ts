"use client";

import { useEffect, useState } from "react";

/** Bumps when {@link writeProductSourceIdentity} updates localStorage for this product. */
export function useProductSourceIdentityVersion(
  shopName: string,
  thirdPlatformItemId: string
): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const shop = shopName.trim();
    const itemId = thirdPlatformItemId.trim();
    if (!shop || !itemId) return;

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{
        shopName?: string;
        thirdPlatformItemId?: string;
      }>).detail;
      if (
        detail?.shopName === shop &&
        detail?.thirdPlatformItemId === itemId
      ) {
        setVersion((v) => v + 1);
      }
    };

    window.addEventListener("product-source-identity-updated", onUpdate);
    return () =>
      window.removeEventListener("product-source-identity-updated", onUpdate);
  }, [shopName, thirdPlatformItemId]);

  return version;
}
