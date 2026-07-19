// Minimal typed client for the tangbuy-plugin backend.
// Base URL is read from NEXT_PUBLIC_API_BASE so it is injected into the browser bundle.
// Endpoints are added per milestone: M0 connectivity (health/auth-status),
// M1-5 path B (catalog recommendations, pricing template, single-candidate publish).

import type {
  CatalogRecommendation,
  PricingTemplate,
  PricingTemplateUpsert,
  PublishResult,
} from "@/lib/types";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new ApiError("NEXT_PUBLIC_API_BASE is not configured", 0);
  }
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (cause) {
    // Network or CORS failures surface here as a TypeError with no HTTP status.
    throw new ApiError(`Network request failed: ${url}`, 0, cause);
  }

  const text = await res.text();
  const data = text ? safeJsonParse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(`Request failed (${res.status}): ${url}`, res.status, data);
  }
  return data as T;
}

export interface HealthResponse {
  app: string;
  status: string;
  persistence?: string;
  persistenceStatus?: string;
  [key: string]: unknown;
}

/**
 * Absolute URL of the backend Shopify OAuth install entrypoint for a given shop domain.
 * The browser navigates here directly; the backend answers with a 302 to Shopify's consent screen.
 * Throws when NEXT_PUBLIC_API_BASE is unset so the caller can surface a readable error.
 */
export function shopifyInstallUrl(shop: string): string {
  if (!API_BASE) {
    throw new ApiError("NEXT_PUBLIC_API_BASE is not configured", 0);
  }
  return `${API_BASE}/api/plugin/shopify/auth/install?shop=${encodeURIComponent(shop)}`;
}

/** Read-only Shopify auth status for a shop (non-sensitive fields only). */
export interface ShopStatusResponse {
  authorized: boolean;
  shopName?: string;
  shopDomain?: string;
  status?: string;
  authorizedAt?: string;
  productCount?: number;
}

export const api = {
  /** Backend health probe — used to validate connectivity (and CORS) end to end. */
  getHealth: () => request<HealthResponse>("/api/plugin/health"),

  /** Current auth status for a shop — used to restore state after the OAuth redirect. */
  getShopStatus: (shop: string) =>
    request<ShopStatusResponse>(
      `/api/plugin/shopify/auth/status?shop=${encodeURIComponent(shop)}`
    ),

  /** Read-only Tangbuy catalog recommendations with backend-computed estimatedSalePrice (M1-5). */
  getRecommendations: (shop: string, limit: number) =>
    request<CatalogRecommendation[]>(
      `/api/plugin/catalog/recommendations?shopName=${encodeURIComponent(
        shop
      )}&limit=${encodeURIComponent(String(limit))}`
    ),

  /** Effective pricing template for a shop (stored value, or system default when isDefault). */
  getPricingTemplate: (shop: string) =>
    request<PricingTemplate>(
      `/api/plugin/pricing/template?shopName=${encodeURIComponent(shop)}`
    ),

  /** Upsert the shop's single pricing template; returns the persisted effective template. */
  upsertPricingTemplate: (body: PricingTemplateUpsert) =>
    request<PricingTemplate>("/api/plugin/pricing/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  /** Publish a single catalog candidate as a sellable Shopify product; idempotent server-side. */
  publishCatalogItem: (shopName: string, candidateId: string) =>
    request<PublishResult>("/api/plugin/catalog/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopName, candidateId }),
    }),
};
