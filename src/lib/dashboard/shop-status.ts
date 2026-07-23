import { normalizeShopStatus } from "@/lib/shop-product-status";
import type { ShopMirrorProduct } from "@/lib/types";

export interface ShopStatusSummary {
  active: number;
  draft: number;
  archived: number;
  other: number;
  hint: string;
}

export function computeShopProductStatusSummary(
  products: ShopMirrorProduct[]
): ShopStatusSummary {
  let active = 0;
  let draft = 0;
  let archived = 0;
  let other = 0;

  for (const product of products) {
    const status = normalizeShopStatus(product.status);
    if (status === "ACTIVE") active += 1;
    else if (status === "DRAFT") draft += 1;
    else if (status === "ARCHIVED") archived += 1;
    else other += 1;
  }

  const parts: string[] = [];
  if (active > 0) parts.push(`在售 ${active}`);
  if (draft > 0) parts.push(`草稿 ${draft}`);
  if (archived > 0) parts.push(`归档 ${archived}`);

  return {
    active,
    draft,
    archived,
    other,
    hint: parts.length > 0 ? parts.join(" · ") : "状态待同步",
  };
}
