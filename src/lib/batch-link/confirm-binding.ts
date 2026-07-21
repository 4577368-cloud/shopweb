import { api } from "@/lib/api";
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
  return api.confirmImageMatch({
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
}
