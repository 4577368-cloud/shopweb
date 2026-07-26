import type { SkuVariant } from "@/lib/types";
import type { ShopMirrorSku } from "@/lib/types";

export const MAX_REPRESENTATIVE_SEARCH_IMAGES = 3;

export type VariantImageInput = Pick<
  SkuVariant,
  "imageUrl" | "price" | "thirdPlatformSkuId"
>;

function normalizeImageKey(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase().split("?")[0] ?? "";
  }
}

/** Collect variant image URLs with a sort key (higher price first). */
export function collectVariantImageCandidates(
  variants: Array<VariantImageInput | ShopMirrorSku>,
  primaryImageUrl?: string | null
): Array<{ url: string; sortKey: number }> {
  const byKey = new Map<string, number>();

  const add = (url: string | null | undefined, sortKey: number) => {
    const trimmed = url?.trim();
    if (!trimmed) return;
    const key = normalizeImageKey(trimmed);
    if (!key) return;
    const prev = byKey.get(key);
    if (prev == null || sortKey > prev) byKey.set(key, sortKey);
  };

  for (const v of variants) {
    const price =
      "price" in v && v.price != null && Number.isFinite(v.price)
        ? v.price
        : "priceLocal" in v && v.priceLocal != null
          ? v.priceLocal
          : 0;
    add(v.imageUrl, price);
  }

  add(primaryImageUrl, -1);

  return [...byKey.entries()].map(([key, sortKey]) => ({
    url: key,
    sortKey,
  }));
}

/**
 * Pick up to {@link MAX_REPRESENTATIVE_SEARCH_IMAGES} distinct images for图搜.
 * URL-level dedupe first; optional server pHash dedupe via callback.
 */
export async function pickRepresentativeVariantImageUrls(
  variants: Array<VariantImageInput | ShopMirrorSku>,
  primaryImageUrl?: string | null,
  dedupeByPerceptualHash?: (urls: string[]) => Promise<string[]>
): Promise<string[]> {
  const candidates = collectVariantImageCandidates(variants, primaryImageUrl)
    .sort((a, b) => b.sortKey - a.sortKey)
    .map((c) => c.url);

  if (candidates.length === 0) {
    const primary = primaryImageUrl?.trim();
    return primary ? [primary] : [];
  }

  let distinct = [...new Set(candidates)];
  if (dedupeByPerceptualHash && distinct.length > MAX_REPRESENTATIVE_SEARCH_IMAGES) {
    distinct = await dedupeByPerceptualHash(distinct);
  }

  return distinct.slice(0, MAX_REPRESENTATIVE_SEARCH_IMAGES);
}
