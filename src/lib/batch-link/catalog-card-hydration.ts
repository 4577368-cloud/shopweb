import { isPublishSourcedBinding } from "@/lib/batch-link/publish-source";
import type { CatalogRecommendation, ImageBindingView } from "@/lib/types";

const CANDIDATE_PUBLISHED_PREFIX = "tangbuy.catalog-candidate-published:v1:";

function candidateStorageKey(shopName: string): string {
  return `${CANDIDATE_PUBLISHED_PREFIX}${shopName.trim()}`;
}

/** Local markers keyed by catalog candidateId (survives reload before binding sync). */
export function readCatalogPublishedCandidateIds(shopName: string): Set<string> {
  if (typeof window === "undefined" || !shopName.trim()) return new Set();
  try {
    const raw = localStorage.getItem(candidateStorageKey(shopName));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is string => typeof id === "string" && id.length > 0)
    );
  } catch {
    return new Set();
  }
}

export function markCatalogCandidatePublished(
  shopName: string,
  candidateId: string
): void {
  if (typeof window === "undefined" || !shopName.trim() || !candidateId.trim()) {
    return;
  }
  const ids = readCatalogPublishedCandidateIds(shopName);
  ids.add(candidateId.trim());
  try {
    localStorage.setItem(
      candidateStorageKey(shopName),
      JSON.stringify([...ids])
    );
  } catch {
    // ignore
  }
}

const LINKED_CANDIDATE_PREFIX = "tangbuy.catalog-candidate-linked:v1:";

function linkedStorageKey(shopName: string): string {
  return `${LINKED_CANDIDATE_PREFIX}${shopName.trim()}`;
}

export function readCatalogLinkedCandidateIds(shopName: string): Set<string> {
  if (typeof window === "undefined" || !shopName.trim()) return new Set();
  try {
    const raw = localStorage.getItem(linkedStorageKey(shopName));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is string => typeof id === "string" && id.length > 0)
    );
  } catch {
    return new Set();
  }
}

export function markCatalogCandidateLinked(
  shopName: string,
  candidateId: string
): void {
  if (typeof window === "undefined" || !shopName.trim() || !candidateId.trim()) {
    return;
  }
  const ids = readCatalogLinkedCandidateIds(shopName);
  ids.add(candidateId.trim());
  try {
    localStorage.setItem(linkedStorageKey(shopName), JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

function bindingCatalogKeys(binding: ImageBindingView): string[] {
  const keys: string[] = [];
  const push = (v?: string | null) => {
    const t = v?.trim();
    if (t) keys.push(t);
  };
  push(binding.tangbuyProductId);
  const identity = binding.sourceIdentity;
  push(identity?.catalogItemId);
  push(identity?.internalGoodsId);
  push(identity?.offerId1688);
  return keys;
}

function itemCatalogKeys(item: CatalogRecommendation): Set<string> {
  const keys = new Set<string>();
  const push = (v?: string | null) => {
    const t = v?.trim();
    if (t) keys.add(t);
  };
  push(item.candidateId);
  push(item.offerId1688);
  return keys;
}

export type CatalogCardHydration = {
  published: boolean;
  linked: boolean;
};

/** Match mall card ids against shop bindings + local publish/link markers. */
export function resolveCatalogCardHydration(
  shopName: string,
  item: CatalogRecommendation,
  bindings: ImageBindingView[]
): CatalogCardHydration {
  const itemKeys = itemCatalogKeys(item);
  let published = readCatalogPublishedCandidateIds(shopName).has(
    item.candidateId.trim()
  );
  let linked = readCatalogLinkedCandidateIds(shopName).has(item.candidateId.trim());

  for (const binding of bindings) {
    if (!binding.bound) continue;
    const overlap = bindingCatalogKeys(binding).some((k) => itemKeys.has(k));
    if (!overlap) continue;
    if (isPublishSourcedBinding(binding)) published = true;
    else linked = true;
  }

  return { published, linked };
}
