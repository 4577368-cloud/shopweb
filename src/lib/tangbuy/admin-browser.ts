import {
  isPreferredPoolDuplicateMessage,
  isPreferredPoolUpstreamBusinessError,
  isPreferredPoolUpstreamSuccess,
} from "@/lib/tangbuy/preferred-pool-config";

const DEFAULT_ADMIN_BASE = "https://admin.tangbuy.cc/prod-api";
const FETCH_TIMEOUT_MS = 28_000;

/** Same portal admin JWT as server TANGBUY_ADMIN_TOKEN — exposed for browser-only ingest (CORS allowlisted). */
export function isAdminBrowserIngestConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN?.trim());
}

function adminBrowserBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_TANGBUY_ADMIN_API_BASE?.trim() || DEFAULT_ADMIN_BASE
  ).replace(/\/$/, "");
}

function adminBrowserAuthorization(): string {
  let token = process.env.NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN?.trim() ?? "";
  const corruptIdx = token.search(/TANGBUY_/i);
  if (corruptIdx > 0) token = token.slice(0, corruptIdx).trim();
  if (!token.toLowerCase().startsWith("bearer ")) {
    token = `Bearer ${token}`;
  }
  return token;
}

export async function fetchTangbuyAdminFromBrowser(
  adminPath: string,
  init: RequestInit & { jsonBody?: unknown } = {}
): Promise<Response> {
  if (!isAdminBrowserIngestConfigured()) {
    throw new Error("未配置 NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN");
  }
  const path = adminPath.startsWith("/") ? adminPath : `/${adminPath}`;
  const url = `${adminBrowserBaseUrl()}${path}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", adminBrowserAuthorization());
  headers.set("Accept", "application/json, text/plain, */*");
  if (init.jsonBody !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json;charset=UTF-8");
  }
  if (!headers.has("Origin")) {
    headers.set("Origin", "https://admin.tangbuy.cc");
  }

  const body =
    init.jsonBody !== undefined ? JSON.stringify(init.jsonBody) : init.body;

  return fetch(url, {
    method: init.method ?? "POST",
    headers,
    body: body ?? undefined,
    credentials: "omit",
    signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

export interface BrowserPoolAddOutcome {
  ok: boolean;
  status?: "submitted" | "already_exists" | "upstream_rejected" | "failed";
  msg?: string;
  error?: string;
  code?: number;
  httpStatus?: number;
}

function defaultPoolAddPayload(providerItemId: string): Record<string, unknown> {
  return {
    providerItemId,
    providerType: "alibaba",
    saveSource: "LINK",
    level: "S",
    suitableCountryList: [],
    labelIdList: [],
    operateUserId: 1,
    operateUserName: "admin",
    operateDept: "100",
    ownerSource: "OPERATE",
  };
}

export async function submitPreferredPoolAddFromBrowser(
  offerId1688: string
): Promise<BrowserPoolAddOutcome> {
  const offerId = offerId1688.trim();
  if (!offerId) {
    return { ok: false, status: "failed", error: "缺少 1688 offerId" };
  }

  let upstream: Response;
  try {
    upstream = await fetchTangbuyAdminFromBrowser(
      "/product-mall/admin/preferred/pool/add",
      {
        method: "POST",
        headers: {
          Referer: "https://admin.tangbuy.cc/goods/shop/pool",
        },
        jsonBody: defaultPoolAddPayload(offerId),
      }
    );
  } catch (e) {
    return {
      ok: false,
      status: "failed",
      error: e instanceof Error ? e.message : "浏览器无法连接 admin.tangbuy.cc",
    };
  }

  const text = await upstream.text();
  let parsed: { code?: number; msg?: string } | undefined;
  try {
    parsed = text ? (JSON.parse(text) as { code?: number; msg?: string }) : undefined;
  } catch {
    parsed = undefined;
  }

  const msg = parsed?.msg ?? text ?? "";
  const code = parsed?.code;

  if (isPreferredPoolDuplicateMessage(msg)) {
    return {
      ok: true,
      status: "already_exists",
      msg: msg || "已在商品库",
      code,
      httpStatus: upstream.status,
    };
  }

  if (isPreferredPoolUpstreamSuccess(upstream.ok, code, msg)) {
    return {
      ok: true,
      status: "submitted",
      msg: msg || "成功",
      code,
      httpStatus: upstream.status,
    };
  }

  if (isPreferredPoolUpstreamBusinessError(code, msg)) {
    return {
      ok: false,
      status: "upstream_rejected",
      error: msg || `商品库登记失败（code ${code ?? "unknown"}）`,
      code,
      httpStatus: upstream.status,
    };
  }

  return {
    ok: false,
    status: "failed",
    error: msg || `商品库登记失败（HTTP ${upstream.status}）`,
    code,
    httpStatus: upstream.status,
  };
}

const INTERNAL_GOODS_ID_PATTERN = /^\d{14,}$/;

export interface BrowserAdminOfferResolve {
  internalGoodsId: string;
  tangbuyCatalogUrl: string;
  providerItemId: string;
  itemName?: string | null;
}

export async function resolveOfferViaAdminFromBrowser(
  offerId1688: string
): Promise<BrowserAdminOfferResolve | null> {
  const offerId = offerId1688.trim();
  if (!offerId || !isAdminBrowserIngestConfigured()) return null;

  let upstream: Response;
  try {
    upstream = await fetchTangbuyAdminFromBrowser(
      "/product-mall/admin/es/product/pageInfo",
      {
        method: "POST",
        headers: {
          Referer: "https://admin.tangbuy.cc/goods/summary",
        },
        jsonBody: {
          pageNum: 1,
          pageSize: 5,
          pageType: "0",
          categoryIdList: [],
          manageLabelIdList: [],
          labelIdList: [],
          providerItemId: offerId,
        },
      }
    );
  } catch {
    return null;
  }

  const text = await upstream.text();
  let parsed: {
    code?: number;
    rows?: Array<{
      itemId?: number | string;
      providerItemId?: string | number;
      detailUrl?: string | null;
      itemName?: string | null;
      status?: string | null;
    }>;
  };
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    return null;
  }

  if (parsed?.code !== 200 && parsed?.code !== 0) return null;
  const rows = parsed?.rows ?? [];

  for (const row of rows) {
    const status = row.status?.trim();
    if (status && status.toUpperCase() !== "ON") continue;

    const provider = String(row.providerItemId ?? "").trim();
    if (provider && provider !== offerId) continue;

    const rawId = row.itemId;
    if (rawId == null) continue;
    const internalGoodsId = String(rawId).trim();
    if (!INTERNAL_GOODS_ID_PATTERN.test(internalGoodsId)) continue;

    const tangbuyCatalogUrl =
      row.detailUrl?.trim() ||
      `https://www.tangbuy.cc/product?dataSource=PREFERRED&id=${internalGoodsId}`;

    return {
      internalGoodsId,
      tangbuyCatalogUrl,
      providerItemId: provider || offerId,
      itemName: row.itemName,
    };
  }

  return null;
}
