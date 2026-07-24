import type { SourcingSearchHit } from "@/lib/sourcing/types";

export interface SourcingSessionSnapshot {
  shopName: string;
  hits: SourcingSearchHit[];
  updatedAt: string;
}

const sessions = new Map<string, SourcingSessionSnapshot>();

function key(shopName: string): string {
  return shopName.trim().toLowerCase();
}

export function setSourcingSession(
  shopName: string,
  hits: SourcingSearchHit[]
): SourcingSessionSnapshot {
  const snap: SourcingSessionSnapshot = {
    shopName,
    hits: hits.map((h, i) => ({ ...h, listIndex: i + 1 })),
    updatedAt: new Date().toISOString(),
  };
  sessions.set(key(shopName), snap);
  return snap;
}

export function getSourcingSession(
  shopName: string
): SourcingSessionSnapshot | null {
  return sessions.get(key(shopName)) ?? null;
}

export function resolveHitByListIndex(
  shopName: string,
  index: number
): SourcingSearchHit | null {
  const snap = getSourcingSession(shopName);
  if (!snap || index < 1) return null;
  return snap.hits[index - 1] ?? null;
}

export function resolveHitByHint(
  shopName: string,
  hint: string
): SourcingSearchHit | null {
  const snap = getSourcingSession(shopName);
  if (!snap) return null;
  const t = hint.trim().toLowerCase();
  if (!t) return null;

  const ordMatch = t.match(/第?\s*(\d+)\s*个?/);
  if (ordMatch) {
    const n = Number(ordMatch[1]);
    if (Number.isFinite(n)) return resolveHitByListIndex(shopName, n);
  }

  const hit = snap.hits.find(
    (h) =>
      h.title.toLowerCase().includes(t) ||
      h.offerId1688 === hint.trim() ||
      h.candidateId === hint.trim()
  );
  return hit ?? null;
}
