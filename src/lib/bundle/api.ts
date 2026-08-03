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
  /** Shopify product ids of kit components (when asParent). */
  componentProductIds?: string[] | null;
  asParent: boolean;
  asComponent: boolean;
  managedByApp: boolean;
}

/** Parent kit card: sources come from components — do not rematch. */
export function isBundleParentKit(
  status?: BundleCardStatus | null
): boolean {
  if (!status?.asParent) return false;
  return (
    status.status === "ACTIVE" ||
    status.status === "STALE" ||
    status.status === "CREATING"
  );
}

/** Product has a kit setup worth showing a badge / manage CTA (incl. failed). */
export function hasConfiguredBundle(
  status?: BundleCardStatus | null
): boolean {
  if (!status?.asParent) return false;
  return (
    status.status === "ACTIVE" ||
    status.status === "STALE" ||
    status.status === "CREATING" ||
    status.status === "FAILED"
  );
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
  /** Pins optionSelections for the base (context) component when set. */
  contextVariantId?: string | null;
  title: string;
  parentPrice?: number | null;
  discountPercent?: number | null;
  components: BundleComponentInput[];
}

export interface UpdateShopBundleInput {
  shopName: string;
  bundleId: number;
  /** Pins optionSelections for the base (context) component when set. */
  contextVariantId?: string | null;
  title: string;
  parentPrice?: number | null;
  discountPercent?: number | null;
  components: BundleComponentInput[];
}

async function bundleRequest<T>(
  path: string,
  init?: RequestInit,
  retried = false
): Promise<T> {
  const { resolveAuthStrategyFromLocation } = await import(
    "@/host/adapters/auth-transport"
  );
  const { refreshAccessCookie } = await import("@/lib/api");
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

  if (res.status === 401 && !retried && typeof window !== "undefined") {
    let refreshed = false;
    if (strategy.kind === "session-token") {
      refreshed = await strategy.refreshAfterUnauthorized();
    } else {
      refreshed = await refreshAccessCookie();
    }
    if (refreshed) {
      return bundleRequest<T>(path, init, true);
    }
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

export type SameProductComboKind = "qty_discount" | "variant_pair";

export interface SaveSameProductComboInput {
  shopName: string;
  productId: string;
  kind: SameProductComboKind;
  qty?: number | null;
  discountPercent?: number | null;
  variantIds?: string[] | null;
  label?: string | null;
}

export interface SaveSameProductComboResult {
  productId: string;
  kind: string;
  saved: boolean;
  checkoutPending: boolean;
  message?: string | null;
}

export function saveSameProductCombo(
  body: SaveSameProductComboInput
): Promise<SaveSameProductComboResult> {
  return bundleRequest("/api/plugin/bundle/combo/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface SaveGiftRuleInput {
  shopName: string;
  productId: string;
  kind?: "qty_gift";
  minQty?: number | null;
  giftProductId: string;
  giftVariantId: string;
  giftQty?: number | null;
  label?: string | null;
}

export interface SaveGiftRuleResult {
  productId: string;
  kind: string;
  saved: boolean;
  checkoutPending: boolean;
  message?: string | null;
}

export function saveGiftRule(
  body: SaveGiftRuleInput
): Promise<SaveGiftRuleResult> {
  return bundleRequest("/api/plugin/bundle/gift/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
