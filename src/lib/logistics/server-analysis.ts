import {
  type LegacyLogisticsAnalysis,
  transformLegacyAnalysis,
} from "@/lib/logistics/decision-engine";
import { readAcceptances, type UpstreamAuthHeaders } from "@/lib/logistics/accept-decisions-store";
import { mergeAcceptancesIntoAnalysis } from "@/lib/logistics/merge-acceptances-into-analysis";
import { normalizeShopApiName } from "@/lib/resolve-shop-api-name";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  SkuProductOverview,
  VariantLogisticsDecision,
} from "@/lib/types";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

const UPSTREAM_RETRIES = 2;
const UPSTREAM_TIMEOUT_MS = 45_000;

export type { UpstreamAuthHeaders };

/** Pull browser auth so server→plugin calls pass JwtAuthFilter (cookie and/or Bearer). */
export function upstreamAuthFromRequest(request: Request): UpstreamAuthHeaders {
  return {
    cookie: request.headers.get("cookie"),
    authorization: request.headers.get("authorization"),
  };
}

async function fetchUpstream(
  url: string,
  init?: RequestInit,
  auth?: UpstreamAuthHeaders
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= UPSTREAM_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> | undefined),
      };
      const cookie = auth?.cookie?.trim();
      if (cookie) headers.Cookie = cookie;
      const authorization = auth?.authorization?.trim();
      if (authorization) headers.Authorization = authorization;

      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers,
      });
      if (
        res.ok ||
        attempt === UPSTREAM_RETRIES ||
        ![502, 503, 504, 408, 429].includes(res.status)
      ) {
        return res;
      }
      lastError = new Error(`上游请求失败 ${res.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === UPSTREAM_RETRIES) break;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("上游物流服务暂时不可用，请稍后重试");
}

/** SKU overview enriches variant decisions only — never block logistics analysis on it. */
async function fetchSkuOverviewOptional(
  shopKey: string,
  auth?: UpstreamAuthHeaders
): Promise<Response | null> {
  const query = new URLSearchParams({
    shopName: shopKey,
    thumbWidth: "144",
    compact: "true",
  });
  const url = `${API_BASE}/api/plugin/match/sku/overview?${query.toString()}`;
  try {
    return await fetchUpstream(url, { method: "GET" }, auth);
  } catch {
    return null;
  }
}

const ACCEPTABLE: Set<LogisticsDecisionStatus> = new Set([
  "ready_for_quote",
  "needs_review",
  "restricted",
  "pending_postal_meta",
]);

export async function loadLogisticsAnalysis(
  shopName: string,
  force: boolean,
  options?: {
    includeSkuOverview?: boolean;
    auth?: UpstreamAuthHeaders;
  }
): Promise<LogisticsAnalysis> {
  if (!API_BASE) {
    const { buildEmptyAnalysis } = await import("@/lib/logistics/decision-engine");
    return mergeAcceptancesIntoAnalysis(
      buildEmptyAnalysis(shopName) as LogisticsAnalysis,
      await readAcceptances(shopName, options?.auth)
    );
  }

  const shopKey = normalizeShopApiName(shopName);
  const analyzeUrl = `${API_BASE}/api/plugin/logistics/${force ? "analyze" : "analysis"}?shopName=${encodeURIComponent(shopKey)}${force ? "&force=true" : ""}`;
  const auth = options?.auth;

  const includeSku = options?.includeSkuOverview !== false;
  // Sequential: avoid hammering a cold Render instance with two heavy DB calls at once.
  const analysisRes = await fetchUpstream(
    analyzeUrl,
    { method: force ? "POST" : "GET" },
    auth
  );
  const skuRes =
    includeSku && shopKey
      ? await fetchSkuOverviewOptional(shopKey, auth)
      : null;

  const analysisText = await analysisRes.text();
  let analysisRaw: unknown;
  try {
    analysisRaw = analysisText ? JSON.parse(analysisText) : undefined;
  } catch {
    analysisRaw = analysisText;
  }

  if (!analysisRes.ok) {
    if (analysisRes.status === 401) {
      throw new Error("登录已失效，请刷新页面后重新登录再试物流分析");
    }
    const detail =
      typeof analysisRaw === "object" && analysisRaw && "message" in analysisRaw
        ? String((analysisRaw as { message?: string }).message)
        : analysisText?.slice(0, 200) || `HTTP ${analysisRes.status}`;
    throw new Error(`物流分析上游失败（${analysisRes.status}）：${detail}`);
  }

  const legacy = analysisRaw as LegacyLogisticsAnalysis;
  if (!legacy || typeof legacy !== "object") {
    throw new Error("物流分析上游返回了无效数据");
  }
  let skuOverview: SkuProductOverview[] = [];

  if (includeSku && skuRes) {
    try {
      const skuText = await skuRes.text();
      const skuRaw = skuText ? JSON.parse(skuText) : undefined;
      if (skuRes.ok && Array.isArray(skuRaw)) {
        skuOverview = skuRaw as SkuProductOverview[];
      }
    } catch {
      // SKU overview optional for merge path
    }
  }

  const transformed = transformLegacyAnalysis(legacy, skuOverview);
  const base: LogisticsAnalysis = {
    shopName: legacy.shopName ?? shopName,
    status: legacy.status ?? "ok",
    analyzedCount: legacy.analyzedCount ?? 0,
    skippedUnboundCount: legacy.skippedUnboundCount ?? 0,
    productProfiles: transformed.productProfiles,
    totalVariants: transformed.totalVariants,
    decisionStatusCounts: transformed.decisionStatusCounts,
    highRiskTypes: transformed.highRiskTypes,
  };

  return mergeAcceptancesIntoAnalysis(base, await readAcceptances(shopName, auth));
}

export function collectAcceptableVariants(
  analysis: LogisticsAnalysis,
  options: {
    variantIds?: string[];
    scope?: "VARIANTS" | "ALL_READY";
    alreadyAccepted?: Set<string>;
  }
): Array<{
  variant: VariantLogisticsDecision;
  productId: string;
}> {
  const idSet =
    options.variantIds && options.variantIds.length > 0
      ? new Set(options.variantIds)
      : null;
  const accepted = options.alreadyAccepted ?? new Set<string>();
  const out: Array<{ variant: VariantLogisticsDecision; productId: string }> =
    [];

  for (const product of analysis.productProfiles ?? []) {
    for (const variant of product.variantDecisions ?? []) {
      if (accepted.has(variant.thirdPlatformSkuId)) continue;
      if (idSet && !idSet.has(variant.thirdPlatformSkuId)) continue;
      if (options.scope === "ALL_READY") {
        if (variant.decisionStatus !== "ready_for_quote") continue;
      } else if (!ACCEPTABLE.has(variant.decisionStatus)) {
        continue;
      }
      out.push({ variant, productId: product.thirdPlatformItemId });
    }
  }
  return out;
}

export { ACCEPTABLE };
