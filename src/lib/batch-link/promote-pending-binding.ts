import { api } from "@/lib/api";
import type { ImageBindingView } from "@/lib/types";

/**
 * Promote a PENDING image binding to ACTIVE.
 *
 * 1) Cheap ack endpoint (PENDING → ACTIVE in place)
 * 2) If ack fails, re-confirm the **already-bound** offer with {@code auto:false}
 *    — same wire path as manual 图搜「选用」, which does not depend on tray candidates.
 */
export async function promotePendingImageBinding(
  shopName: string,
  thirdPlatformItemId: string,
  binding: ImageBindingView
): Promise<ImageBindingView> {
  if (!binding.bound || binding.bindStatus !== "PENDING") {
    return binding;
  }

  try {
    await api.ackImageBinding(shopName, thirdPlatformItemId);
    return { ...binding, bindStatus: "ACTIVE" };
  } catch {
    // fall through — ack can fail while confirm(auto:false) still works
  }

  const offerProductId = binding.tangbuyProductId?.trim();
  if (!offerProductId) {
    throw new Error("PENDING binding missing tangbuyProductId");
  }

  return api.confirmImageMatch({
    shopName,
    thirdPlatformItemId,
    offerProductId,
    offerSkuId: binding.tangbuySkuId ?? null,
    detailUrl: binding.detailUrl ?? null,
    similarityScore:
      typeof binding.matchScore === "number" ? binding.matchScore : null,
    imageSource: binding.imageSource ?? null,
    querySource: binding.querySource ?? null,
    appliedQuery: binding.appliedQuery ?? null,
    offerImageUrl: binding.offerImageUrl ?? null,
    offerPrice: binding.offerPrice ?? null,
    offerTitle: binding.offerTitle ?? null,
    auto: false,
  });
}
