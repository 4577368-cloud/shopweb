import type { TranslateFn } from "@/i18n/server";
// Base URL is read from NEXT_PUBLIC_API_BASE so it is injected into the browser bundle.
// Endpoints are added per milestone: M0 connectivity (health/auth-status),
// M1-5 path B (catalog recommendations, pricing template, single-candidate publish).

import type {
  CatalogRecommendation,
  ConfirmImageMatchRequest,
  ImageBindingView,
  ImageSearchResult,
  LogisticsAnalysis,
  LogisticsLine,
  LogisticsTemplate,
  LogisticsTemplateUpsert,
  LogisticsTemplateVO,
  LogisticsTypeCode,
  PackagingType,
  OfferDetail,
  PricingTemplate,
  PricingTemplateUpsert,
  ProductLogisticsProfile,
  ProductSyncResult,
  QuoteStatus,
  PublishResult,
  ShopMirrorProduct,
  ShopOrderHeader,
  ShopOrderProcurementSnapshot,
  ShopProductDetail,
  ShopProductUpdatePayload,
  SkuAutoAlignResult,
  SkuProductOverview,
  UploadedImage,
  MatchJobProgress,
} from "@/lib/types";
import type {
  RankingRow,
  RankingSnapshot,
} from "@/lib/marketing/types";
import type {
  SkuAlignAliasKnowledgeRequest,
  SkuAlignBlockVariantRequest,
  SkuAlignConfirmResult,
  SkuAlignConfirmSuggestionsRequest,
  SkuAlignManualBindRequest,
  SkuAlignOverview,
  SkuAlignProductDetail,
  SkuAlignRunAccepted,
  SkuAlignRunRequest,
  SkuAlignRunStatus,
  SkuAlignSupplementSourceRequest,
} from "@/lib/sku-align-v1/types";
import type { OrderBindingLine } from "@/lib/order/types";
import { normalizeSkuOverviewForList } from "@/lib/api/sku-overview-normalize";
import { logisticsTemplateFromVo } from "@/lib/logistics/default-template";
import { normalizeShopApiName } from "@/lib/resolve-shop-api-name";

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
 * Never surfaces raw `err.message` to users — returns a generic network/HTTP/unknown
 * fallback so backend machine codes and English stack traces stay internal.
 * Callers that need machine-code-specific copy (image search, confirm, auto-align) map first, then
 * fall back to this.
 */
export function readableError(err: unknown, t?: TranslateFn): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t ? t("auth.errorNetwork") : "Network error";
    const detail = err.message?.trim();
    // Prefer upstream/detail message when present (e.g. login required).
    if (
      detail &&
      !/^Request failed \(\d+\)/.test(detail) &&
      detail !== `Request failed (${err.status})`
    ) {
      return detail;
    }
    if (t) {
      return t("api.httpError", { status: err.status });
    }
    return `Request failed (${err.status})`;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return t ? t("api.unknownError") : "Unknown error";
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestWithRetry<T>(path, init, false);
}

/**
 * P2.1: 401 auto-refresh retry. When a protected endpoint returns 401 (access cookie expired),
 * transparently call /api/plugin/auth/refresh once, then retry the original request. If the
 * refresh also fails, surface the original 401 so the caller (and UserProvider) can sign out.
 *
 * Dedup: concurrent 401s share a single in-flight refresh promise so we never fire more than
 * one /refresh at a time. The refresh endpoint rotates the access cookie via Set-Cookie, so
 * the retried request automatically picks up the new credential.
 *
 * Loop guard: {@code retried} ensures we only retry once per call — the retry itself uses
 * {@code retried=true} so a second 401 surfaces immediately.
 */
async function requestWithRetry<T>(
  path: string,
  init: RequestInit | undefined,
  retried: boolean
): Promise<T> {
  if (!API_BASE && !path.startsWith("/api/plugin/")) {
    throw new ApiError("NEXT_PUBLIC_API_BASE is not configured", 0);
  }
  const url = path.startsWith("/api/plugin/")
    ? path
    : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

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

  // 401 on a protected endpoint → try one silent refresh, then retry.
  if (res.status === 401 && !retried && typeof window !== "undefined") {
    const refreshed = await refreshAccessCookie();
    if (refreshed) {
      return requestWithRetry<T>(path, init, true);
    }
    // refresh failed — fall through to throw the original 401
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

/**
 * Module-level access-cookie refresh with dedup. Multiple concurrent 401s coalesce into a
 * single /api/plugin/auth/refresh call. Returns true if the refresh succeeded (access cookie
 * was rotated and the retried request should pick it up), false otherwise.
 *
 * Intentionally does NOT throw — callers fall through to the original 401 on failure so
 * UserProvider's bootstrap (or the next /me) can surface the sign-out.
 *
 * Exported so UserProvider can share the same dedup point — both the /me 401 retry and
 * api.ts request 401 retries funnel through here, guaranteeing at most one in-flight
 * /refresh across the whole app.
 */
let refreshHandler: () => Promise<boolean> = defaultRefreshAccessCookie;
let inflightRefresh: Promise<boolean> | null = null;

function defaultRefreshAccessCookie(): Promise<boolean> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    try {
      const res = await fetch("/api/plugin/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

/** Shared refresh entry point used by {@link requestWithRetry} on 401. */
export function refreshAccessCookie(): Promise<boolean> {
  return refreshHandler();
}

/**
 * Lets UserProvider register its own dedup-aware refresh so all 401 retries across the app
 * (api.ts requests AND /me bootstrap) share a single in-flight /refresh.
 */
export function registerRefreshHandler(fn: () => Promise<boolean>): void {
  refreshHandler = fn;
}

/** Coalesce concurrent identical GETs and briefly cache hot read endpoints. */
const inflightRequests = new Map<string, Promise<unknown>>();
const overviewCache = new Map<
  string,
  { at: number; data: SkuProductOverview[] }
>();
const shopProductsCache = new Map<
  string,
  { at: number; data: ShopMirrorProduct[] }
>();
const OVERVIEW_CACHE_MS = 10_000;
const SHOP_PRODUCTS_CACHE_MS = 10_000;

/** Drop cached SKU overview so the next read reflects recent binds/replaces. */
export function invalidateSkuOverviewCache(shop: string): void {
  overviewCache.delete(shop);
}

/** Read the in-memory overview cache without fetching (may be stale). */
export function peekSkuOverviewCache(shop: string): SkuProductOverview[] | null {
  const cached = overviewCache.get(shop);
  if (cached && Date.now() - cached.at < OVERVIEW_CACHE_MS) {
    return cached.data;
  }
  return null;
}

function deduped<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = run().finally(() => {
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, promise);
  return promise;
}

function fetchSkuOverview(shop: string): Promise<SkuProductOverview[]> {
  const shopKey = normalizeShopApiName(shop);
  const cached = overviewCache.get(shopKey);
  if (cached && Date.now() - cached.at < OVERVIEW_CACHE_MS) {
    return Promise.resolve(cached.data);
  }
  const query = new URLSearchParams({
    shopName: shopKey,
    thumbWidth: "144",
    compact: "true",
  });
  return deduped(`sku-overview:${shopKey}`, () =>
    request<SkuProductOverview[]>(
      `/api/plugin/match/sku/overview?${query.toString()}`
    ).then((data) => {
      const normalized = normalizeSkuOverviewForList(data);
      overviewCache.set(shopKey, { at: Date.now(), data: normalized });
      return normalized;
    })
  );
}

function fetchShopProducts(shop: string): Promise<ShopMirrorProduct[]> {
  const shopKey = normalizeShopApiName(shop);
  const cached = shopProductsCache.get(shopKey);
  if (cached && Date.now() - cached.at < SHOP_PRODUCTS_CACHE_MS) {
    return Promise.resolve(cached.data);
  }
  return deduped(`shop-products:${shopKey}`, () =>
    request<ShopMirrorProduct[]>(
      `/api/plugin/product/list?shopName=${encodeURIComponent(shopKey)}`
    ).then((data) => {
      shopProductsCache.set(shopKey, { at: Date.now(), data });
      return data;
    })
  );
}

const backfillStarted = new Set<string>();

function maybeBackfillBindingSnapshots(shop: string): void {
  if (typeof window !== "undefined") {
    const key = `tangbuy.backfill.${shop}`;
    try {
      if (window.sessionStorage.getItem(key) === "1") return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
  }
  if (backfillStarted.has(shop)) return;
  backfillStarted.add(shop);
  void request(
    `/api/plugin/match/image-search/backfill-snapshots?shopName=${encodeURIComponent(shop)}`,
    { method: "POST" }
  ).catch(() => {
    backfillStarted.delete(shop);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(`tangbuy.backfill.${shop}`);
      } catch {
        // ignore
      }
    }
  });
}

async function localRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("/") ? path : `/${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (cause) {
    throw new ApiError(`Local request failed: ${url}`, 0, cause);
  }

  const text = await res.text();
  const data = text ? safeJsonParse(text) : undefined;
  if (!res.ok) {
    let message = `Request failed (${res.status}): ${url}`;
    if (data && typeof data === "object" && data !== null) {
      const err = (data as { error?: unknown; message?: unknown }).error;
      const msg = (data as { message?: unknown }).message;
      if (typeof err === "string" && err.trim()) message = err;
      else if (typeof msg === "string" && msg.trim()) message = msg;
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

export interface LogisticsEstimateRequest {
  shopName: string;
  /** Optional when countryCode is provided — resolved server-side from template market. */
  countryId?: string;
  countryCode: string;
  shippingOption: number;
  packaging?: PackagingType;
  variants: Array<{
    thirdPlatformSkuId: string;
    tangbuySkuId: string;
    tangbuyGoodsId: string;
    incrementList: string[];
    quantity: number;
    weightG?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    postalLimitClass?: string;
  }>;
  needOtherLine?: boolean;
  needMeasure?: boolean;
  /** Tangbuy `currency` header; defaults to USD in browser gateway. */
  quoteCurrency?: string;
}

export interface LogisticsEstimateResult {
  thirdPlatformSkuId: string;
  quoteStatus: QuoteStatus;
  errorMessage?: string;
  recommendedLine?: LogisticsLine;
  alternativeLines?: LogisticsLine[];
  estimatedWeightG?: number;
  estimatedVolumeCm3?: number;
  estimatedLengthCm?: number;
  estimatedWidthCm?: number;
  estimatedHeightCm?: number;
}

export interface LogisticsEstimateResponse {
  success: boolean;
  message?: string;
  results: LogisticsEstimateResult[];
}

export interface LogisticsAcceptDecisionRequest {
  shopName: string;
  targetScope?: "VARIANTS" | "ALL_READY";
  variantIds?: string[];
  quotes?: Record<
    string,
    {
      recommendedLine?: LogisticsLine;
      alternativeLines?: LogisticsLine[];
      quoteStatus?: QuoteStatus;
    }
  >;
}

export interface LogisticsAcceptDecisionResult {
  acceptedCount: number;
  analysis: LogisticsAnalysis;
}

export interface LogisticsPatchQuotesRequest {
  shopName: string;
  quotes: Record<
    string,
    {
      recommendedLine?: LogisticsLine;
      alternativeLines?: LogisticsLine[];
      quoteStatus?: QuoteStatus;
    }
  >;
}

export interface LogisticsPatchQuotesResult {
  patchedCount: number;
  analysis: LogisticsAnalysis;
}

/**
 * Absolute URL of the backend Shopify OAuth install entrypoint for a given shop domain.
 * In the browser we use same-origin `/api/plugin/...` so Next rewrites proxy to tangbuy-plugin
 * (NEXT_PUBLIC_API_BASE is only required at build time for those rewrites).
 */
export function shopifyInstallUrl(shop: string): string {
  const q = `shop=${encodeURIComponent(shop)}`;
  if (typeof window !== "undefined") {
    return `/api/plugin/shopify/auth/install?${q}`;
  }
  if (!API_BASE) {
    throw new ApiError("NEXT_PUBLIC_API_BASE is not configured", 0);
  }
  return `${API_BASE}/api/plugin/shopify/auth/install?${q}`;
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

/**
 * One row from GET /api/plugin/user/shops — the user's bound shops with auth
 * status, bind timestamp, and product count. Never includes access_token.
 *
 * `authStatus` is the underlying `shopify_store_auth.status` enum name, or
 * `"MISSING"` when the auth row is gone (e.g. shop uninstalled) but the
 * user_shop binding still exists.
 */
export interface UserShopBinding {
  shopName: string;
  shopDomain: string;
  authStatus: string;
  authorizedAt?: string;
  boundAt?: string;
  productCount?: number;
}

export interface UnbindShopResult {
  shopName: string;
  unbound: boolean;
}

function fetchLogisticsTemplateVo(shop: string) {
  return request<LogisticsTemplateVO>(
    `/api/plugin/logistics/template?shopName=${encodeURIComponent(shop)}`
  );
}

export const api = {
  /** Backend health probe — used to validate connectivity (and CORS) end to end. */
  getHealth: () => request<HealthResponse>("/api/plugin/health"),

  /** Current auth status for a shop — used to restore state after the OAuth redirect. */
  getShopStatus: (shop: string) =>
    request<ShopStatusResponse>(
      `/api/plugin/shopify/auth/status?shop=${encodeURIComponent(shop)}`
    ),

  /** All active authorized shops — sidebar multi-shop switcher (user-scoped). */
  listAuthorizedShops: () =>
    request<AuthorizedShopSummary[]>("/api/plugin/shopify/auth/shops"),

  /** Shops bound to the current user (with auth status + bind timestamp). */
  listUserShops: () =>
    request<UserShopBinding[]>("/api/plugin/user/shops"),

  /** Unbind a shop from the current user (user_shop row only; auth retained). */
  unbindUserShop: (shopName: string) =>
    request<UnbindShopResult>(
      `/api/plugin/user/shops/${encodeURIComponent(shopName)}`,
      { method: "DELETE" }
    ),

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

  /** Active "已刊登" count: Tangbuy catalog publishes still present in the Shopify product mirror. */
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
      skuAttr?: string | null;
      barcode?: string | null;
      descriptionHtml?: string | null;
      offerId1688?: string | null;
      variants?: Array<{
        skuId: string;
        price?: number | null;
        barcode?: string | null;
        imageUrl?: string | null;
        optionValues: Array<{ optionName: string; value: string }>;
      }> | null;
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
  imageSearch: (
    shopName: string,
    thirdPlatformItemId: string,
    limit = 4,
    opts?: { country?: string; searchImageUrl?: string }
  ) =>
    request<ImageSearchResult>("/api/plugin/match/image-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopName,
        thirdPlatformItemId,
        limit,
        ...(opts?.country ? { country: opts.country } : {}),
        ...(opts?.searchImageUrl?.trim()
          ? { searchImageUrl: opts.searchImageUrl.trim() }
          : {}),
      }),
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
      `/api/plugin/match/image-search/bindings?shopName=${encodeURIComponent(normalizeShopApiName(shop))}`
    ),

  /** "确认无误": promote a product's PENDING (AI-suggested) image binding to ACTIVE. */
  ackImageBinding: (shop: string, thirdPlatformItemId: string) => {
    const params = new URLSearchParams({ shopName: shop, thirdPlatformItemId });
    return request<void>(`/api/plugin/match/image-search/ack?${params.toString()}`, {
      method: "POST",
    });
  },

  /** Batch-acknowledge multiple pending image bindings. */
  batchAckImageBindings: (shop: string, thirdPlatformItemIds: string[]) =>
    request<{ success: boolean; ok: number; failed: string[] }>(
      `/api/plugin/match/image-search/batch-ack`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopName: shop, thirdPlatformItemIds }),
      }
    ),

  /** "取消关联": soft-unbind a product's image binding (PENDING or ACTIVE). */
  unbindImageBinding: (shop: string, thirdPlatformItemId: string) => {
    const params = new URLSearchParams({ shopName: shop, thirdPlatformItemId });
    return request<void>(`/api/plugin/match/image-search/unbind?${params.toString()}`, {
      method: "POST",
    });
  },

  /** Start (or return) the server-side image-auto-match queue for a shop or scoped products. */
  startMatchQueue: (
    shop: string,
    opts?: string | { thirdPlatformItemId?: string; thirdPlatformItemIds?: string[] }
  ) => {
    const params = new URLSearchParams({ shopName: shop });
    if (typeof opts === "string") {
      params.set("thirdPlatformItemId", opts);
    } else if (opts?.thirdPlatformItemId) {
      params.set("thirdPlatformItemId", opts.thirdPlatformItemId);
    } else if (opts?.thirdPlatformItemIds?.length) {
      for (const id of opts.thirdPlatformItemIds) {
        params.append("thirdPlatformItemIds", id);
      }
    }
    return request<MatchJobProgress>(`/api/plugin/match/queue/start?${params.toString()}`, {
      method: "POST",
    });
  },

  /** Poll the active RUNNING/PENDING job for a shop, if any. */
  getActiveMatchJob: async (shop: string) => {
    try {
      return await request<MatchJobProgress | null>(
        `/api/plugin/match/queue/active?shopName=${encodeURIComponent(shop)}`
      );
    } catch (err) {
      // Older plugin builds may not expose this route yet — treat as no active job.
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        return null;
      }
      throw err;
    }
  },

  /** Poll progress for a specific match job. */
  getMatchJob: (jobId: number) =>
    request<MatchJobProgress>(`/api/plugin/match/queue/${jobId}`),

  /**
   * Repair legacy bindings missing the image/price snapshot (re-search → match bound offer → else
   * derive from offer detail). One-shot, idempotent; returns per-binding counts.
   */
  backfillBindingSnapshots: (shop: string) => {
    maybeBackfillBindingSnapshots(shop);
    return Promise.resolve({
      total: 0,
      alreadyOk: 0,
      backfilled: 0,
      fromSearch: 0,
      fromDetail: 0,
      unresolved: 0,
      skipped: 0,
    });
  },

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

  /** Manual SKU pick from /sku-align picker; writes ACTIVE binding. */
  bindSkuBinding: (body: {
    shopName: string;
    thirdPlatformItemId: string;
    thirdPlatformSkuId: string;
    tangbuyProductId: string;
    tangbuySkuId: string;
    tangbuySkuSpec?: string | null;
    detailUrl?: string | null;
  }) =>
    request<void>(`/api/plugin/match/sku/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  /**
   * S1-a: SKU binding overview — products with at least one ACTIVE binding, aggregated per product
   * and expanded into Shopify variants with their current binding state (read-only).
   */
  getSkuOverview: (shop: string) => fetchSkuOverview(shop),

  // ---------------------------------------------------------------------------
  // SKU Align V1 — /api/plugin/sku-align/v1/** (legacy /match/sku/* retained)
  // ---------------------------------------------------------------------------

  skuAlignV1Overview: (shop: string, tab?: string) => {
    const params = new URLSearchParams({ shopName: shop });
    if (tab) params.set("tab", tab);
    return request<SkuAlignOverview>(`/api/plugin/sku-align/v1/overview?${params}`);
  },

  skuAlignV1ProductDetail: (shop: string, productId: string) => {
    const params = new URLSearchParams({
      shopName: shop,
      productId,
    });
    return request<SkuAlignProductDetail>(
      `/api/plugin/sku-align/v1/products/detail?${params.toString()}`
    );
  },

  skuAlignV1EnqueueRun: (body: SkuAlignRunRequest) =>
    request<SkuAlignRunAccepted>(`/api/plugin/sku-align/v1/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  skuAlignV1RunStatus: (shop: string, runId: number) =>
    request<SkuAlignRunStatus>(
      `/api/plugin/sku-align/v1/runs/${runId}?shopName=${encodeURIComponent(shop)}`
    ),

  /** Step 3 — silent stale refresh when entering /sku-align result view. */
  skuAlignV1PageEnter: (shop: string) =>
    request<SkuAlignRunAccepted>(
      `/api/plugin/sku-align/v1/page-enter?shopName=${encodeURIComponent(shop)}`,
      { method: "POST" }
    ),

  /** Step 3 — card expand refresh for a single unresolved product. */
  skuAlignV1CardExpand: (shop: string, productId: string) => {
    const params = new URLSearchParams({ shopName: shop, productId });
    return request<SkuAlignRunAccepted>(
      `/api/plugin/sku-align/v1/products/expand?${params.toString()}`,
      { method: "POST" }
    );
  },

  skuAlignV1ConfirmSuggestions: (body: SkuAlignConfirmSuggestionsRequest) =>
    request<SkuAlignConfirmResult>(`/api/plugin/sku-align/v1/confirm-suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  skuAlignV1ManualBind: (variantId: string, body: SkuAlignManualBindRequest) => {
    const params = new URLSearchParams({ variantId });
    return request<void>(
      `/api/plugin/sku-align/v1/variants/bind?${params.toString()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  },

  skuAlignV1BlockVariant: (variantId: string, body: SkuAlignBlockVariantRequest) => {
    const params = new URLSearchParams({ variantId });
    return request<void>(
      `/api/plugin/sku-align/v1/variants/block?${params.toString()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  },

  skuAlignV1AddSupplementSource: (
    productId: string,
    body: SkuAlignSupplementSourceRequest
  ) => {
    const params = new URLSearchParams({
      shopName: body.shopName,
      productId,
    });
    return request<SkuAlignRunAccepted>(
      `/api/plugin/sku-align/v1/products/supplement-source?${params.toString()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  },

  skuAlignV1RecordAlias: (body: SkuAlignAliasKnowledgeRequest) =>
    request<void>(`/api/plugin/sku-align/v1/knowledge/alias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

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

  /** 1688 keyword-assisted image search (discover tab dual-source). */
  search1688Offers: (opts: {
    keyword?: string;
    imageUrl: string;
    country?: string;
    page?: number;
    size?: number;
  }) => {
    const params = new URLSearchParams();
    if (opts.keyword?.trim()) params.set("keyword", opts.keyword.trim());
    params.set("imageUrl", opts.imageUrl);
    if (opts.country) params.set("country", opts.country);
    if (opts.page != null) params.set("page", String(opts.page));
    if (opts.size != null) params.set("size", String(opts.size));
    return request<{
      items?: Array<{
        offerId?: string | null;
        subject?: string | null;
        subjectTrans?: string | null;
        imageUrl?: string | null;
        price?: string | null;
        consignPrice?: string | null;
        promotionPrice?: string | null;
        companyName?: string | null;
        detailUrl?: string | null;
      }>;
      totalRecords?: number | null;
    }>(`/api/plugin/match/image-aop/search?${params.toString()}`);
  },

  /** List the shop's mirrored on-sale products (read-only; path A display). */
  getShopProducts: (shop: string) => fetchShopProducts(shop),

  /** P2: aggregated sync ceremony inputs (products, bindings, SKU, logistics, pricing). */
  getLaunchSummaryBundle: (shop: string) =>
    request<
      Omit<
        import("@/lib/sync/launch-summary-bundle").LaunchSummaryBundle,
        "logisticsTemplates"
      >
    >(`/api/plugin/sync/launch-summary?shopName=${encodeURIComponent(shop)}`),

  /** Persisted Shopify order headers for shop scan context (webhook-synced). */
  listShopOrders: (shop: string) =>
    request<ShopOrderHeader[]>(
      `/api/plugin/order/header/list?shopName=${encodeURIComponent(shop)}`
    ),

  /**
   * 采购子单快照（可选）。未实现时前端忽略；见 docs/ORDER_CENTER_PROCUREMENT_LINE_CONTRACT.md
   */
  listOrderProcurementSnapshots: (shop: string) =>
    request<ShopOrderProcurementSnapshot[]>(
      `/api/plugin/order/procurement/snapshots?shopName=${encodeURIComponent(shop)}`
    ),

  /**
   * 订单行的「Shopify 商品 → Tangbuy 关联货源」匹配结果（同步时已解析并落库）。
   * 返回 ThirdPlatformOrderLine：含 Shopify 行信息 + tangbuy* 绑定快照 + bindingStatus。
   * 订单中心据此展示 Tangbuy 侧货源信息，无需后端再投影 line_items。
   */
  listOrderBindingLines: (shop: string, outerOrderId: string) =>
    request<OrderBindingLine[]>(
      `/api/plugin/order/binding/lines?shopName=${encodeURIComponent(
        shop
      )}&outerOrderId=${encodeURIComponent(outerOrderId)}`
    ),

  /** Phase 1 read-only product detail (SPU + variants + media) from the local mirror. */
  getShopProductDetail: (shop: string, itemId: string, signal?: AbortSignal) =>
    request<ShopProductDetail>(
      `/api/plugin/product/detail?shopName=${encodeURIComponent(
        shop
      )}&itemId=${encodeURIComponent(itemId)}`,
      signal ? { signal } : undefined
    ),

  /** Phase 2: write editable fields back to Shopify and refresh the local mirror. */
  updateShopProduct: (
    shop: string,
    body: ShopProductUpdatePayload,
    signal?: AbortSignal
  ) =>
    request<ShopProductDetail>(
      `/api/plugin/product/detail?shopName=${encodeURIComponent(shop)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      }
    ),

  /** Trigger a Shopify product pull into the mirror; omit windowMinutes for a full pull. */
  syncShopProducts: (shop: string, windowMinutes?: number) => {
    const params = new URLSearchParams({ shopName: normalizeShopApiName(shop) });
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
    return localRequest<LogisticsAnalysis>(
      `/api/logistics/analyze?${params.toString()}`,
      { method: "POST" }
    );
  },

  getLogisticsAnalysis: (shop: string) =>
    localRequest<LogisticsAnalysis>(
      `/api/logistics/analysis?shopName=${encodeURIComponent(shop)}`
    ),

  correctLogisticsType: (
    shop: string,
    thirdPlatformItemId: string,
    logisticsType: LogisticsTypeCode
  ) =>
    localRequest<ProductLogisticsProfile>("/api/logistics/correct-type", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopName: shop, thirdPlatformItemId, logisticsType }),
    }),

  estimateLogistics: (body: LogisticsEstimateRequest, signal?: AbortSignal) =>
    import("@/lib/logistics/estimate-gateway").then((m) =>
      m.estimateLogisticsFromBrowser(body, signal)
    ),

  acceptLogisticsDecision: (body: LogisticsAcceptDecisionRequest) =>
    localRequest<LogisticsAcceptDecisionResult>("/api/logistics/accept-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  patchLogisticsQuotes: (body: LogisticsPatchQuotesRequest) =>
    localRequest<LogisticsPatchQuotesResult>("/api/logistics/patch-quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  getLogisticsTemplate: (shop: string) => fetchLogisticsTemplateVo(shop),

  /**
   * Kept list-shaped for the UI while the backend stores a single template per
   * shop. A shop that never saved gets the in-memory default back, which is
   * reported as empty so the onboarding step stays pending until a real save.
   */
  listLogisticsTemplates: async (shop: string): Promise<LogisticsTemplate[]> => {
    const vo = await fetchLogisticsTemplateVo(shop);
    if (!vo || vo.defaultTemplate) return [];
    return [logisticsTemplateFromVo(vo, shop)];
  },

  upsertLogisticsTemplate: async (
    shop: string,
    body: LogisticsTemplateUpsert
  ): Promise<LogisticsTemplate> => {
    const resolvedShop = shop.trim() || body.shopName?.trim() || "";
    if (!resolvedShop) {
      throw new Error("缺少店铺标识，请先完成店铺授权");
    }
    const vo = await request<LogisticsTemplateVO>("/api/plugin/logistics/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopName: resolvedShop,
        packaging: body.packaging,
        speedPreference: body.speedPreference,
        markets: body.markets,
      }),
    });
    return logisticsTemplateFromVo(vo, resolvedShop);
  },

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

  translateText: (
    text: string,
    targetLang?: string,
    sourceLang?: string,
    style?: "amazon" | "literal",
    signal?: AbortSignal
  ) =>
    localRequest<{
      success: boolean;
      translatedText?: string;
      sourceLang?: string;
      targetLang?: string;
      engine?: "llm" | "mymemory";
      error?: string;
      unchanged?: boolean;
    }>("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang, sourceLang, style }),
      ...(signal ? { signal } : {}),
    }),

  // ---------------------------------------------------------------------------
  // TikTok 商品榜单（/api/plugin/ranking/**，真实落库，不经过 pipispy 计费护栏）
  // ---------------------------------------------------------------------------

  /** 列出店铺的榜单快照（日期窗口），最新窗口在前。 */
  fetchRankingSnapshots: (shop: string) =>
    request<RankingSnapshot[]>(
      `/api/plugin/ranking/snapshots?shopName=${encodeURIComponent(normalizeShopApiName(shop))}`
    ),

  /** 取某快照的商品列表，可选按 L1 类目过滤；后端按 GMV 降序返回。 */
  listRankingProducts: (
    shop: string,
    opts?: { snapshotId?: number; categoryL1?: string }
  ) => {
    const params = new URLSearchParams({
      shopName: normalizeShopApiName(shop),
    });
    if (opts?.snapshotId != null) {
      params.set("snapshotId", String(opts.snapshotId));
    }
    if (opts?.categoryL1) {
      params.set("categoryL1", opts.categoryL1);
    }
    return request<RankingRow[]>(
      `/api/plugin/ranking/list?${params.toString()}`
    );
  },
};
