// Minimal typed client for the tangbuy-plugin backend.
// Base URL is read from NEXT_PUBLIC_API_BASE so it is injected into the browser bundle.
// Endpoints are added per milestone: M0 connectivity (health/auth-status),
// M1-5 path B (catalog recommendations, pricing template, single-candidate publish).

import type {
  CatalogRecommendation,
  ConfirmImageMatchRequest,
  ImageBindingView,
  ImageSearchResult,
  LogisticsAnalysis,
  LogisticsTemplate,
  LogisticsTemplateUpsert,
  LogisticsTypeCode,
  OfferDetail,
  PricingTemplate,
  PricingTemplateUpsert,
  ProductLogisticsProfile,
  ProductSyncResult,
  PublishResult,
  ShopMirrorProduct,
  ShopProductDetail,
  ShopProductUpdatePayload,
  SkuAutoAlignResult,
  SkuProductOverview,
  UploadedImage,
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

/**
 * Shared, human-readable rendering of a thrown error for toasts / inline error states.
 * Network failures (status 0) surface their own message; HTTP errors are prefixed with the status.
 * Callers that need machine-code-specific copy (image search, confirm, auto-align) map first, then
 * fall back to this.
 */
export function readableError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    return `请求失败（${err.status}）：${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "未知错误";
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
    let message = `Request failed (${res.status}): ${url}`;
    if (data && typeof data === "object" && data !== null && "message" in data) {
      const m = (data as { message: unknown }).message;
      if (typeof m === "string" && m.trim()) message = m;
    }
    throw new ApiError(message, res.status, data);
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

/** One row from GET /api/plugin/shopify/auth/shops (never includes tokens). */
export interface AuthorizedShopSummary {
  shopName: string;
  shopDomain: string;
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

  /** All active authorized shops — sidebar multi-shop switcher. */
  listAuthorizedShops: () =>
    request<AuthorizedShopSummary[]>("/api/plugin/shopify/auth/shops"),

  /** Read-only Tangbuy catalog recommendations with backend-computed estimatedSalePrice (M1-5). */
  getRecommendations: (shop: string, limit: number, offset = 0) =>
    request<CatalogRecommendation[]>(
      `/api/plugin/catalog/recommendations?shopName=${encodeURIComponent(
        shop
      )}&offset=${encodeURIComponent(String(offset))}&limit=${encodeURIComponent(
        String(limit)
      )}`
    ),

  /** Total number of Tangbuy catalog entries — the real "发现新品" count for pagination. */
  getRecommendationsCount: () =>
    request<{ count: number }>("/api/plugin/catalog/recommendations/count"),

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

  /** Soft-delete stored template; GET then returns system default (isDefault: true). */
  clearPricingTemplate: (shop: string) =>
    request<PricingTemplate>(
      `/api/plugin/pricing/template?shopName=${encodeURIComponent(shop)}`,
      { method: "DELETE" }
    ),

  /** "已刊登" count: products successfully published (listed) from the Tangbuy catalog for a shop. */
  getPublishedCount: (shop: string) =>
    request<{ count: number }>(
      `/api/plugin/catalog/published-count?shopName=${encodeURIComponent(shop)}`
    ),

  /**
   * One-shot repair: backfill the 1:1 CATALOG bindings for products published before publish-time
   * linking existed. Idempotent — products already linked are left untouched.
   */
  backfillPublishedBindings: (shop: string) =>
    request<{
      total: number;
      linked: number;
      replaced: number;
      alreadyLinked: number;
      skipped: number;
      failed: number;
    }>(
      `/api/plugin/catalog/link-published?shopName=${encodeURIComponent(shop)}`,
      { method: "POST" }
    ),

  /** Publish a single catalog candidate as a sellable Shopify product; idempotent server-side. */
  publishCatalogItem: (
    shopName: string,
    candidateId: string,
    snapshot?: {
      title: string;
      price?: number | null;
      currency?: string | null;
      imageUrl?: string | null;
      imageUrls?: string[] | null;
      tangbuyUrl?: string | null;
      supplierShop?: string | null;
      upstreamPlatform?: string | null;
    }
  ) =>
    request<PublishResult>("/api/plugin/catalog/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopName, candidateId, ...snapshot }),
    }),

  /**
   * A3-2a stateless 1688 image-search preview. The backend decides the search image + correction query
   * (original image → title → LLM) and returns candidates (top-1 first) plus how it resolved them.
   * No persistence. Defaults to 4 candidates. The UI never sends a query (backend-driven).
   */
  imageSearch: (shopName: string, thirdPlatformItemId: string, limit = 4) =>
    request<ImageSearchResult>("/api/plugin/match/image-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopName, thirdPlatformItemId, limit }),
    }),

  /**
   * A3-2b: confirm a chosen 1688 offer as the SKU-level binding for a shop product (route B). The
   * backend resolves the default variant and persists candidate + ACTIVE binding; returns the bound view.
   */
  confirmImageMatch: (req: ConfirmImageMatchRequest) =>
    request<ImageBindingView>("/api/plugin/match/image-search/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }),

  /** A3-2b回显: all live image bindings of a shop (ACTIVE + PENDING), keyed by thirdPlatformItemId. */
  listImageBindings: (shop: string) =>
    request<ImageBindingView[]>(
      `/api/plugin/match/image-search/bindings?shopName=${encodeURIComponent(shop)}`
    ),

  /** "确认无误": promote a product's PENDING (AI-suggested) image binding to ACTIVE. */
  ackImageBinding: (shop: string, thirdPlatformItemId: string) => {
    const params = new URLSearchParams({ shopName: shop, thirdPlatformItemId });
    return request<void>(`/api/plugin/match/image-search/ack?${params.toString()}`, {
      method: "POST",
    });
  },

  /** "取消关联": soft-unbind a product's image binding (PENDING or ACTIVE). */
  unbindImageBinding: (shop: string, thirdPlatformItemId: string) => {
    const params = new URLSearchParams({ shopName: shop, thirdPlatformItemId });
    return request<void>(`/api/plugin/match/image-search/unbind?${params.toString()}`, {
      method: "POST",
    });
  },

  /**
   * Repair legacy bindings missing the image/price snapshot (re-search → match bound offer → else
   * derive from offer detail). One-shot, idempotent; returns per-binding counts.
   */
  backfillBindingSnapshots: (shop: string) =>
    request<{
      total: number;
      alreadyOk: number;
      backfilled: number;
      fromSearch: number;
      fromDetail: number;
      unresolved: number;
      skipped: number;
    }>(
      `/api/plugin/match/image-search/backfill-snapshots?shopName=${encodeURIComponent(
        shop
      )}`,
      { method: "POST" }
    ),

  /** "确认无误": promote a single variant's PENDING binding to ACTIVE (SKU 对齐页). */
  ackSkuBinding: (shop: string, thirdPlatformSkuId: string) => {
    const params = new URLSearchParams({ shopName: shop, thirdPlatformSkuId });
    return request<void>(`/api/plugin/match/sku/ack?${params.toString()}`, { method: "POST" });
  },

  /** "取消关联": soft-unbind a single variant's binding (SKU 对齐页). */
  unbindSkuBinding: (shop: string, thirdPlatformSkuId: string) => {
    const params = new URLSearchParams({ shopName: shop, thirdPlatformSkuId });
    return request<void>(`/api/plugin/match/sku/unbind?${params.toString()}`, { method: "POST" });
  },

  /**
   * S1-a: SKU binding overview — products with at least one ACTIVE binding, aggregated per product
   * and expanded into Shopify variants with their current binding state (read-only).
   */
  getSkuOverview: (shop: string) =>
    request<SkuProductOverview[]>(
      `/api/plugin/match/sku/overview?shopName=${encodeURIComponent(shop)}`
    ),

  /**
   * S1-b1: auto-align a bound product's Shopify variants to the 1688 offer's SKU matrix, writing
   * per-variant RULE bindings. offerId is resolved server-side from the product-level binding.
   */
  autoAlignSku: (shop: string, thirdPlatformItemId: string) => {
    const params = new URLSearchParams({ shopName: shop, thirdPlatformItemId });
    return request<SkuAutoAlignResult>(
      `/api/plugin/match/sku/auto-align?${params.toString()}`,
      { method: "POST" }
    );
  },

  /**
   * S1-b0 read-only: fetch a 1688 offer's normalized detail (SKU matrix with per-value images/prices).
   * Used by /sku-align to render the right-hand 图/名/价 comparison on demand; no persistence.
   */
  getOfferDetail: (offerId: string, country = "en") =>
    request<OfferDetail>(
      `/api/plugin/match/sku/offer-detail?offerId=${encodeURIComponent(
        offerId
      )}&country=${encodeURIComponent(country)}`
    ),

  /** List the shop's mirrored on-sale products (read-only; path A display). */
  getShopProducts: (shop: string) =>
    request<ShopMirrorProduct[]>(
      `/api/plugin/product/list?shopName=${encodeURIComponent(shop)}`
    ),

  /** Phase 1 read-only product detail (SPU + variants + media) from the local mirror. */
  getShopProductDetail: (shop: string, itemId: string) =>
    request<ShopProductDetail>(
      `/api/plugin/product/detail?shopName=${encodeURIComponent(
        shop
      )}&itemId=${encodeURIComponent(itemId)}`
    ),

  /** Phase 2: write editable fields back to Shopify and refresh the local mirror. */
  updateShopProduct: (shop: string, body: ShopProductUpdatePayload) =>
    request<ShopProductDetail>(
      `/api/plugin/product/detail?shopName=${encodeURIComponent(shop)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),

  /** Trigger a Shopify product pull into the mirror; omit windowMinutes for a full pull. */
  syncShopProducts: (shop: string, windowMinutes?: number) => {
    const params = new URLSearchParams({ shopName: shop });
    if (windowMinutes != null) {
      params.set("windowMinutes", String(windowMinutes));
    }
    return request<ProductSyncResult>(
      `/api/plugin/product/sync?${params.toString()}`,
      { method: "POST" }
    );
  },

  /** Phase 1: classify bound products' logistics types (rule/keyword). */
  analyzeLogistics: (shop: string, force = false) => {
    const params = new URLSearchParams({
      shopName: shop,
      force: String(force),
    });
    return request<LogisticsAnalysis>(
      `/api/plugin/logistics/analyze?${params.toString()}`,
      { method: "POST" }
    );
  },

  getLogisticsAnalysis: (shop: string) =>
    request<LogisticsAnalysis>(
      `/api/plugin/logistics/analysis?shopName=${encodeURIComponent(shop)}`
    ),

  correctLogisticsType: (
    shop: string,
    thirdPlatformItemId: string,
    logisticsType: LogisticsTypeCode
  ) =>
    request<ProductLogisticsProfile>("/api/plugin/logistics/correct-type", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopName: shop, thirdPlatformItemId, logisticsType }),
    }),

  getLogisticsTemplate: (shop: string) =>
    request<LogisticsTemplate>(
      `/api/plugin/logistics/template?shopName=${encodeURIComponent(shop)}`
    ),

  upsertLogisticsTemplate: (body: LogisticsTemplateUpsert) =>
    request<LogisticsTemplate>("/api/plugin/logistics/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  /**
   * Upload an image to Tangbuy OSS via the same-origin Next.js proxy (/api/oss/upload) and get back
   * its public URL. Reusable primitive for AI chat attachments, manual sourcing images, etc.
   * Note: this hits the frontend route (same origin), not NEXT_PUBLIC_API_BASE.
   */
  uploadImage: async (file: File): Promise<UploadedImage> => {
    const fd = new FormData();
    fd.append("file", file);
    let res: Response;
    try {
      res = await fetch("/api/oss/upload", { method: "POST", body: fd });
    } catch (cause) {
      throw new ApiError("图片上传网络失败", 0, cause);
    }
    const text = await res.text();
    const data = text ? safeJsonParse(text) : undefined;
    if (!res.ok) {
      const msg = (data as { error?: string })?.error ?? `上传失败（${res.status}）`;
      throw new ApiError(msg, res.status, data);
    }
    return data as UploadedImage;
  },
};
