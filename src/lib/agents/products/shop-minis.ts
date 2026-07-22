import type {
  ImageBindingView,
  ShopMirrorProduct,
} from "@/lib/types";

/** Compact row for agent mini-lists (real data only). */
export interface ShopProductMini {
  productId: string;
  title: string;
  imageUrl: string | null;
  state: "pending" | "unbound" | "confirmed";
  /** Binding match score when present */
  matchScore?: number | null;
  /** Short risk / status hints from real fields only */
  hints: string[];
}

export function buildShopProductMinis(
  products: ShopMirrorProduct[],
  bindings: Record<string, ImageBindingView>
): ShopProductMini[] {
  return products.map((p) => {
    const b = bindings[p.thirdPlatformItemId];
    let state: ShopProductMini["state"] = "unbound";
    if (b?.bound) {
      state = b.bindStatus === "PENDING" ? "pending" : "confirmed";
    }
    const hints: string[] = [];
    if (state === "pending") {
      hints.push("待你确认关联");
      if (b?.matchScore != null) {
        const s = b.matchScore;
        hints.push(
          s <= 1 ? `标题综合分 ${Math.round(s * 100)}%` : `标题 ${Math.round(s)}%`
        );
      }
      if (!b?.offerImageUrl) hints.push("货源图待补全");
    } else if (state === "unbound") {
      if (!p.primaryImageUrl) hints.push("无主图，无法图搜");
      else hints.push("尚未关联货源");
    }
    return {
      productId: p.thirdPlatformItemId,
      title: (p.title ?? "").trim() || p.thirdPlatformItemId,
      imageUrl: p.primaryImageUrl ?? null,
      state,
      matchScore: b?.matchScore ?? null,
      hints,
    };
  });
}
