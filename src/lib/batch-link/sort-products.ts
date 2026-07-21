import type { BatchLinkProgress } from "@/lib/batch-link/types";

/**
 * During「一键关联」on the「全部」tab, keep batch session items at the top:
 * 1. currently processing
 * 2. most recently completed (just-finished sits directly below the active card)
 * 3. remaining queued unbound (original order)
 * 4. other session items (safety)
 * then the rest of the catalog unchanged.
 */
export function sortProductsForBatchLink<T extends { thirdPlatformItemId: string }>(
  products: T[],
  progress: BatchLinkProgress
): T[] {
  const { sessionOrder, completionOrder, currentProductId, cardStates } = progress;
  if (sessionOrder.length === 0) return products;

  const sessionSet = new Set(sessionOrder);
  const byId = new Map(products.map((p) => [p.thirdPlatformItemId, p]));
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  const pushId = (id: string | null | undefined) => {
    if (!id || seen.has(id) || !sessionSet.has(id) || !byId.has(id)) return;
    orderedIds.push(id);
    seen.add(id);
  };

  pushId(currentProductId);

  for (let i = completionOrder.length - 1; i >= 0; i--) {
    pushId(completionOrder[i]);
  }

  for (const id of sessionOrder) {
    if (cardStates[id]?.state === "queued") pushId(id);
  }

  for (const id of sessionOrder) {
    pushId(id);
  }

  const rest = products.filter((p) => !seen.has(p.thirdPlatformItemId));
  return [...orderedIds.map((id) => byId.get(id)!), ...rest];
}
