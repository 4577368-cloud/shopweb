import { api } from "@/lib/api";
import {
  identityFromSearchCandidate,
  resolveConfirmOfferProductId,
} from "@/lib/catalog-product-resolve";
import { candidateStorageKey } from "@/lib/batch-link/image-match";
import { mergeConfirmedBindingView } from "@/lib/batch-link/source-display-title";
import {
  mergeIdentityIntoBinding,
  writeProductSourceIdentity,
} from "@/lib/product-source-identity";
import { resolveIdentityWithPreferredPool } from "@/lib/tangbuy/preferred-pool";
import type {
  ImageBindingView,
  ImageSearchProduct,
  ImageSearchResult,
  ShopMirrorProduct,
} from "@/lib/types";

/** Same payload as single-card「选用」/ confirmMatch — persists cross-ID snapshot. */
export async function confirmCandidateBinding(
  shopName: string,
  item: Pick<ShopMirrorProduct, "thirdPlatformItemId" | "title">,
  candidate: ImageSearchProduct,
  result: ImageSearchResult,
  opts?: {
    auto?: boolean;
    imageScores?: Record<string, number | null>;
    titleScores?: Record<string, number>;
  }
): Promise<ImageBindingView> {
  const fromCandidate = identityFromSearchCandidate(candidate);
  const skipPool = Boolean(
    candidate.catalogSource || candidate.internalGoodsId?.trim()
  );
  const resolved = await resolveIdentityWithPreferredPool({
    tangbuyProductId: candidate.internalGoodsId ?? candidate.productId,
    tangbuySkuId: candidate.skuId,
    detailUrl: candidate.detailUrl,
    titleHint: item.title ?? candidate.title,
    shopName,
    skipPoolIngest: skipPool,
  });

  const mergedIdentity = {
    ...fromCandidate,
    ...resolved,
    tangbuySkuId: candidate.skuId ?? resolved.tangbuySkuId ?? fromCandidate.tangbuySkuId,
  };

  const offerProductId = resolveConfirmOfferProductId(
    {
      ...candidate,
      internalGoodsId: mergedIdentity.internalGoodsId ?? candidate.internalGoodsId,
      tangbuyCatalogUrl: mergedIdentity.tangbuyCatalogUrl ?? candidate.tangbuyCatalogUrl,
      catalogItemId: mergedIdentity.catalogItemId ?? candidate.catalogItemId,
      dataSource: mergedIdentity.dataSource ?? candidate.dataSource,
    },
    mergedIdentity
  );

  const confirmDetailUrl =
    mergedIdentity.tangbuyCatalogUrl?.trim() ||
    mergedIdentity.offerDetailUrl?.trim() ||
    candidate.detailUrl;

  const key = candidateStorageKey(candidate);
  const imageScore =
    opts?.imageScores?.[key] ?? opts?.imageScores?.[candidate.productId] ?? null;
  const titleScore =
    opts?.titleScores?.[key] ?? opts?.titleScores?.[candidate.productId] ?? null;
  const similarityScore =
    candidate.similarityScore ??
    (imageScore != null && imageScore > 0 ? imageScore / 100 : null) ??
    (titleScore != null && titleScore > 0 ? titleScore / 100 : null);

  const view = await api.confirmImageMatch({
    shopName,
    thirdPlatformItemId: item.thirdPlatformItemId,
    offerProductId,
    offerSkuId: candidate.skuId,
    detailUrl: confirmDetailUrl,
    similarityScore,
    imageSource: result.imageSource,
    querySource: result.querySource,
    appliedQuery: result.appliedQuery,
    offerImageUrl: candidate.imageUrl,
    offerPrice: candidate.price,
    offerTitle: candidate.title?.trim() || null,
    auto: opts?.auto ?? false,
  });

  writeProductSourceIdentity(shopName, item.thirdPlatformItemId, mergedIdentity);

  return mergeConfirmedBindingView(
    mergeIdentityIntoBinding(view, mergedIdentity),
    candidate
  );
}
