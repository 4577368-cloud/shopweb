import type {
  BundleCampaign,
  BundlePlayType,
  MixMatchRule,
  ByobRule,
} from "@/lib/bundle/campaign-types";
import {
  fetchBundleStatusMap,
  type BundleStatusMap,
} from "@/lib/bundle/api";

async function campaignRequest<T>(
  path: string,
  init?: RequestInit,
  retried = false
): Promise<T> {
  const { resolveAuthStrategyFromLocation } = await import(
    "@/host/adapters/auth-transport"
  );
  const { refreshAccessCookie, ApiError } = await import("@/lib/api");
  const strategy = resolveAuthStrategyFromLocation();
  const auth = await strategy.prepareRequest();
  const res = await fetch(path, {
    ...init,
    credentials: init?.credentials ?? auth.credentials,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...auth.headers,
    },
  });
  if (res.status === 401 && !retried && typeof window !== "undefined") {
    let refreshed = false;
    if (strategy.kind === "session-token") {
      refreshed = await strategy.refreshAfterUnauthorized();
    } else {
      refreshed = await refreshAccessCookie();
    }
    if (refreshed) return campaignRequest<T>(path, init, true);
  }
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}): ${path}`;
    if (data && typeof data === "object" && data !== null) {
      const m =
        (data as { message?: unknown }).message ??
        (data as { msg?: unknown }).msg;
      if (typeof m === "string" && m.trim()) message = m;
    }
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

/** Fixed kits synthesized from status-map (unique by bundleId). */
export function synthesizeFixedCampaigns(
  shopName: string,
  map: BundleStatusMap
): BundleCampaign[] {
  const byId = new Map<number, BundleCampaign>();
  for (const [productId, card] of Object.entries(map.byProductId ?? {})) {
    if (!card?.asParent || card.bundleId == null) continue;
    if (byId.has(card.bundleId)) continue;
    byId.set(card.bundleId, {
      id: `fixed-${card.bundleId}`,
      shopName,
      playType: "fixed_kit",
      title: card.parentTitle?.trim() || `Kit #${card.bundleId}`,
      status: card.status as BundleCampaign["status"],
      linkedBundleId: card.bundleId,
      poolCount: card.componentCount,
      synthetic: true,
      shopifyRefsJson: JSON.stringify({
        parentProductId: card.parentProductId,
        contextHint: productId,
      }),
    });
  }
  return Array.from(byId.values());
}

export async function listCampaigns(shopName: string): Promise<{
  campaigns: BundleCampaign[];
  statusMap: BundleStatusMap;
}> {
  const statusMap = await fetchBundleStatusMap(shopName);
  const fixed = synthesizeFixedCampaigns(shopName, statusMap);
  let remote: BundleCampaign[] = [];
  try {
    const res = await campaignRequest<{ items?: BundleCampaign[] }>(
      `/api/plugin/bundle/campaign/list?${new URLSearchParams({ shopName })}`
    );
    remote = res.items ?? [];
  } catch {
    remote = [];
  }
  const remoteFixedIds = new Set(
    remote
      .filter((c) => c.playType === "fixed_kit" && c.linkedBundleId != null)
      .map((c) => c.linkedBundleId)
  );
  const merged = [
    ...remote,
    ...fixed.filter((c) => !remoteFixedIds.has(c.linkedBundleId ?? -1)),
  ];
  // Ensure BYOB placeholder always visible once
  if (!merged.some((c) => c.playType === "byob")) {
    merged.push({
      id: "byob-placeholder",
      shopName,
      playType: "byob",
      title: "Build Your Own Bundle",
      status: "COMING_SOON",
      synthetic: true,
      poolCount: 0,
    });
  }
  merged.sort((a, b) => {
    const rank = (p: BundlePlayType) =>
      ({ fixed_kit: 0, mix_match: 1, product_offer: 2, byob: 3 }[p] ?? 9);
    return rank(a.playType) - rank(b.playType);
  });
  return { campaigns: merged, statusMap };
}

export interface SaveMixCampaignInput {
  shopName: string;
  id?: string | null;
  title: string;
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  rule: MixMatchRule;
  poolProductIds: string[];
}

export function saveMixCampaign(
  body: SaveMixCampaignInput
): Promise<BundleCampaign> {
  return campaignRequest("/api/plugin/bundle/campaign/mix/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getCampaign(
  shopName: string,
  id: string
): Promise<BundleCampaign> {
  const q = new URLSearchParams({ shopName });
  return campaignRequest(`/api/plugin/bundle/campaign/${encodeURIComponent(id)}?${q}`);
}

export function archiveCampaign(
  shopName: string,
  id: string
): Promise<BundleCampaign> {
  const q = new URLSearchParams({ shopName });
  return campaignRequest(
    `/api/plugin/bundle/campaign/${encodeURIComponent(id)}/archive?${q}`,
    { method: "POST" }
  );
}

export interface SaveByobCampaignInput {
  shopName: string;
  id?: string | null;
  title: string;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
  rule: ByobRule;
}

export function saveByobCampaign(
  body: SaveByobCampaignInput
): Promise<BundleCampaign> {
  return campaignRequest("/api/plugin/bundle/campaign/byob/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
