import { isPoolIngestPending } from "@/lib/logistics/estimate-goods-block";
import { readProductSourceIdentity } from "@/lib/product-source-identity";
import type { LogisticsEstimateResult } from "@/lib/api";
import type {
  ImageBindingView,
  ProductSourceIdentity,
  VariantLogisticsDecision,
} from "@/lib/types";

export const CATALOG_INGESTING_LABEL = "商品入库中";

export const CATALOG_INGESTING_TOOLTIP =
  "货源正在同步到 Tangbuy 商品库，暂时无法获得物流预估；通常需数十秒，完成后本标签自动消失。";

export function resolveMergedSourceIdentity(
  shopName: string,
  thirdPlatformItemId: string,
  binding?: ImageBindingView | null
): ProductSourceIdentity | null {
  if (!shopName.trim() || !thirdPlatformItemId.trim()) return null;
  const stored = readProductSourceIdentity(shopName, thirdPlatformItemId);
  const inline = binding?.sourceIdentity;
  if (!stored && !inline) return null;
  return { ...inline, ...stored };
}

export function isCatalogIngesting(
  identity: ProductSourceIdentity | null | undefined
): boolean {
  if (!identity) return false;
  if (identity.internalGoodsId?.trim()) return false;
  return isPoolIngestPending(identity.poolIngestStatus);
}

export function isProductQuoteIngesting(
  variants: VariantLogisticsDecision[],
  quoteResults: Map<string, LogisticsEstimateResult>
): boolean {
  return variants.some(
    (variant) =>
      quoteResults.get(variant.thirdPlatformSkuId)?.quoteStatus === "INGESTING"
  );
}

export function isProductCatalogIngesting(input: {
  shopName: string;
  thirdPlatformItemId: string;
  binding?: ImageBindingView | null;
  variants?: VariantLogisticsDecision[];
  quoteResults?: Map<string, LogisticsEstimateResult>;
}): boolean {
  const identity = resolveMergedSourceIdentity(
    input.shopName,
    input.thirdPlatformItemId,
    input.binding
  );
  if (isCatalogIngesting(identity)) return true;
  if (input.variants && input.quoteResults) {
    return isProductQuoteIngesting(input.variants, input.quoteResults);
  }
  return false;
}

export function countCatalogIngestingProducts(input: {
  shopName: string;
  productIds: string[];
  variantsByProduct: Map<string, VariantLogisticsDecision[]>;
  quoteResults: Map<string, LogisticsEstimateResult>;
}): number {
  let count = 0;
  for (const productId of input.productIds) {
    if (
      isProductCatalogIngesting({
        shopName: input.shopName,
        thirdPlatformItemId: productId,
        variants: input.variantsByProduct.get(productId),
        quoteResults: input.quoteResults,
      })
    ) {
      count += 1;
    }
  }
  return count;
}

/** Logistics CTA: not started vs pool/quote in flight vs catalog id ready. */
export type ProductSourceIngestPhase =
  | "not_in_catalog"
  | "in_progress"
  | "ready";

export function productSourceIngestPhase(input: {
  shopName?: string;
  thirdPlatformItemId?: string;
  variants: VariantLogisticsDecision[];
  quoteResults: Map<string, LogisticsEstimateResult>;
}): ProductSourceIngestPhase {
  const shop = input.shopName?.trim();
  const itemId = input.thirdPlatformItemId?.trim();
  if (shop && itemId) {
    const identity = readProductSourceIdentity(shop, itemId);
    if (identity?.internalGoodsId?.trim()) return "ready";
    if (isCatalogIngesting(identity)) return "in_progress";
  }
  if (isProductQuoteIngesting(input.variants, input.quoteResults)) {
    return "in_progress";
  }
  return "not_in_catalog";
}
