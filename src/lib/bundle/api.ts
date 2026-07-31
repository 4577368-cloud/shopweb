/** Shopify fixed product bundle — frontend client (plugin-backed). */
import { ApiError } from "@/lib/api";

export type BundleStatus =
  | "CREATING"
  | "ACTIVE"
  | "FAILED"
  | "STALE"
  | "DISSOLVED";

export interface BundlesFeature {
  eligibleForBundles: boolean;
  ineligibilityReason?: string | null;
  sellsBundles: boolean;
}

export interface BundleComponent {
  productId: string;
  quantity: number;
  title?: string | null;
  variantId?: string | null;
}

export interface ShopBundle {
  id: number;
  shopName: string;
  contextProductId: string;
  parentProductId?: string | null;
  parentVariantId?: string | null;
  parentTitle?: string | null;
  parentPrice?: number | null;
  discountPercent?: number | null;
  status: BundleStatus;
  managedByApp: boolean;
  errorMessage?: string | null;
  syncedAt?: string | null;
  components: BundleComponent[];
}

export interface BundleCardStatus {
  bundleId: number;
  status: BundleStatus;
  parentProductId?: string | null;
  parentTitle?: string | null;
  componentCount: number;
  asParent: boolean;
  asComponent: boolean;
  managedByApp: boolean;
}

export interface BundleStatusMap {
  feature: BundlesFeature;
  byProductId: Record<string, BundleCardStatus>;
}

export interface BundleComponentInput {
  productId: string;
  quantity: number;
  variantId?: string | null;
}

export interface CreateShopBundleInput {
  shopName: string;
  contextProductId: string;
  title: string;
  parentPrice?: number | null;
  discountPercent?: number | null;
  components: BundleComponentInput[];
}

export interface UpdateShopBundleInput {
  shopName: string;
  bundleId: number;
  title: string;
  parentPrice?: number | null;
  discountPercent?: number | null;
  components: BundleComponentInput[];
}

async function bundleRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { resolveAuthStrategyFromLocation } = await import(
    "@/host/adapters/auth-transport"
  );
  const strategy = resolveAuthStrategyFromLocation();
  const auth = await strategy.prepareRequest();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...auth.headers,
  };
  const res = await fetch(path, {
    ...init,
    credentials: init?.credentials ?? auth.credentials,
    headers,
  });
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
        (data as { message?: unknown; msg?: unknown }).message ??
        (data as { msg?: unknown }).msg;
      if (typeof m === "string" && m.trim()) message = m;
    }
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

export function fetchBundleStatusMap(shopName: string): Promise<BundleStatusMap> {
  const q = new URLSearchParams({ shopName });
  return bundleRequest(`/api/plugin/bundle/status-map?${q}`);
}

export function createShopBundle(
  body: CreateShopBundleInput
): Promise<ShopBundle> {
  return bundleRequest("/api/plugin/bundle/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateShopBundle(
  body: UpdateShopBundleInput
): Promise<ShopBundle> {
  return bundleRequest("/api/plugin/bundle/update", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function dissolveShopBundle(
  shopName: string,
  id: number
): Promise<ShopBundle> {
  const q = new URLSearchParams({ shopName });
  return bundleRequest(`/api/plugin/bundle/${id}/dissolve?${q}`, {
    method: "POST",
  });
}

export function getShopBundle(
  shopName: string,
  id: number
): Promise<ShopBundle> {
  const q = new URLSearchParams({ shopName });
  return bundleRequest(`/api/plugin/bundle/${id}?${q}`);
}
