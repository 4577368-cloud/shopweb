import { buildTangbuyProductUrl } from "@/lib/tangbuy-mall-gateway";
import { isInternalGoodsId } from "@/lib/catalog-product-resolve";
import type { CatalogRecommendation, ImageSearchProduct, ImageSearchResult } from "@/lib/types";

const REVEAL_QUEUE_PREFIX = "tangbuy.catalog-publish-reveal:v1:";
const DISPLAY_SNAPSHOT_PREFIX = "tangbuy.catalog-publish-display:v1:";

export type PublishRevealEntry = {
  thirdPlatformItemId: string;
  candidate: ImageSearchProduct;
  queuedAt: string;
};

export type PublishDisplaySnapshot = {
  imageUrl?: string | null;
  title?: string | null;
  price?: string | null;
};

function queueStorageKey(shopName: string): string {
  return `${REVEAL_QUEUE_PREFIX}${shopName.trim()}`;
}

function displaySnapshotStorageKey(shopName: string): string {
  return `${DISPLAY_SNAPSHOT_PREFIX}${shopName.trim()}`;
}

export function catalogItemToRevealCandidate(
  item: Pick<
    CatalogRecommendation,
    "candidateId" | "title" | "imageUrl" | "price" | "tangbuyUrl"
  >
): ImageSearchProduct | null {
  const internal = item.candidateId.trim();
  if (!isInternalGoodsId(internal)) return null;
  const catalogUrl = item.tangbuyUrl?.trim() || buildTangbuyProductUrl(internal);
  return {
    productId: internal,
    title: item.title?.trim() || "Tangbuy 货源",
    imageUrl: item.imageUrl ?? null,
    detailUrl: catalogUrl,
    price: item.price != null ? String(item.price) : null,
    catalogSource: true,
    internalGoodsId: internal,
    catalogItemId: internal,
    tangbuyCatalogUrl: catalogUrl,
    dataSource: "PREFERRED",
    similarityScore: null,
  };
}

export function queuePublishReveal(
  shopName: string,
  thirdPlatformItemId: string,
  item: Pick<
    CatalogRecommendation,
    "candidateId" | "title" | "imageUrl" | "price" | "tangbuyUrl"
  >
): void {
  if (typeof window === "undefined" || !shopName.trim() || !thirdPlatformItemId.trim()) {
    return;
  }
  const candidate = catalogItemToRevealCandidate(item);
  if (!candidate) return;

  const entry: PublishRevealEntry = {
    thirdPlatformItemId: thirdPlatformItemId.trim(),
    candidate,
    queuedAt: new Date().toISOString(),
  };

  writePublishDisplaySnapshot(shopName, thirdPlatformItemId, {
    imageUrl: item.imageUrl ?? null,
    title: item.title ?? null,
    price: item.price != null ? String(item.price) : null,
  });

  const existing = readPublishRevealQueue(shopName);
  const without = existing.filter(
    (e) => e.thirdPlatformItemId !== entry.thirdPlatformItemId
  );
  try {
    localStorage.setItem(
      queueStorageKey(shopName),
      JSON.stringify([entry, ...without])
    );
  } catch {
    // ignore quota / private mode
  }
}

export function readPublishRevealQueue(shopName: string): PublishRevealEntry[] {
  if (typeof window === "undefined" || !shopName.trim()) return [];
  try {
    const raw = localStorage.getItem(queueStorageKey(shopName));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is PublishRevealEntry =>
        row != null &&
        typeof row === "object" &&
        typeof (row as PublishRevealEntry).thirdPlatformItemId === "string" &&
        (row as PublishRevealEntry).candidate != null
    );
  } catch {
    return [];
  }
}

export function removePublishReveal(
  shopName: string,
  thirdPlatformItemId: string
): void {
  if (typeof window === "undefined" || !shopName.trim()) return;
  const next = readPublishRevealQueue(shopName).filter(
    (e) => e.thirdPlatformItemId !== thirdPlatformItemId.trim()
  );
  try {
    if (next.length === 0) {
      localStorage.removeItem(queueStorageKey(shopName));
    } else {
      localStorage.setItem(queueStorageKey(shopName), JSON.stringify(next));
    }
  } catch {
    // ignore
  }
}

export function writePublishDisplaySnapshot(
  shopName: string,
  thirdPlatformItemId: string,
  snapshot: PublishDisplaySnapshot
): void {
  if (typeof window === "undefined" || !shopName.trim() || !thirdPlatformItemId.trim()) {
    return;
  }
  try {
    const raw = localStorage.getItem(displaySnapshotStorageKey(shopName));
    const map =
      raw != null
        ? (JSON.parse(raw) as Record<string, PublishDisplaySnapshot>)
        : {};
    map[thirdPlatformItemId.trim()] = snapshot;
    localStorage.setItem(displaySnapshotStorageKey(shopName), JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

export function readPublishDisplaySnapshot(
  shopName: string,
  thirdPlatformItemId: string
): PublishDisplaySnapshot | null {
  if (typeof window === "undefined" || !shopName.trim() || !thirdPlatformItemId.trim()) {
    return null;
  }
  try {
    const raw = localStorage.getItem(displaySnapshotStorageKey(shopName));
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, PublishDisplaySnapshot>;
    return map[thirdPlatformItemId.trim()] ?? null;
  } catch {
    return null;
  }
}

/** Synthetic scores for the known Tangbuy 1:1 match reveal animation. */
export const PUBLISH_REVEAL_TITLE_SCORE = 94;
export const PUBLISH_REVEAL_IMAGE_SCORE = 96;

export function buildPublishRevealSearchResult(
  candidate: ImageSearchProduct
): ImageSearchResult {
  return {
    items: [candidate],
    imageSource: "ORIGINAL",
    querySource: "NONE",
    appliedQuery: "商城上架货源",
  };
}

export function publishRevealScores(candidate: ImageSearchProduct): {
  matchScores: Record<string, number>;
  imageScores: Record<string, number | null>;
} {
  const key = candidate.internalGoodsId || candidate.productId;
  return {
    matchScores: { [key]: PUBLISH_REVEAL_TITLE_SCORE, [candidate.productId]: PUBLISH_REVEAL_TITLE_SCORE },
    imageScores: { [key]: PUBLISH_REVEAL_IMAGE_SCORE, [candidate.productId]: PUBLISH_REVEAL_IMAGE_SCORE },
  };
}
