import { api } from "@/lib/api";
import { mergeConfirmedBindingView } from "@/lib/batch-link/source-display-title";
import type {
  ImageBindingView,
  ImageSearchProduct,
  ImageSearchResult,
  ShopMirrorProduct,
} from "@/lib/types";

/** Same payload as single-card「选用」/ confirmMatch. */
export async function confirmCandidateBinding(
  shopName: string,
  item: Pick<ShopMirrorProduct, "thirdPlatformItemId">,
  candidate: ImageSearchProduct,
  result: ImageSearchResult
): Promise<ImageBindingView> {
  const view = await api.confirmImageMatch({
    shopName,
    thirdPlatformItemId: item.thirdPlatformItemId,
    offerProductId: candidate.productId,
    offerSkuId: candidate.skuId,
    detailUrl: candidate.detailUrl,
    similarityScore: candidate.similarityScore,
    imageSource: result.imageSource,
    querySource: result.querySource,
    appliedQuery: result.appliedQuery,
    offerImageUrl: candidate.imageUrl,
    offerPrice: candidate.price,
    offerTitle: candidate.title?.trim() || null,
  });
  return mergeConfirmedBindingView(view, candidate);
}
