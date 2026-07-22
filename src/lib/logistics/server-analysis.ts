import {
  aggregateDecisionCounts,
  type LegacyLogisticsAnalysis,
  transformLegacyAnalysis,
} from "@/lib/logistics/decision-engine";
import { readAcceptances, type StoredVariantAcceptance } from "@/lib/logistics/accept-decisions-store";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  ProductLogisticsProfile,
  QuoteStatus,
  SkuProductOverview,
  VariantLogisticsDecision,
} from "@/lib/types";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

const UPSTREAM_RETRIES = 2;
const UPSTREAM_TIMEOUT_MS = 45_000;

async function fetchUpstream(
  url: string,
  init?: RequestInit
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= UPSTREAM_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
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

const ACCEPTABLE: Set<LogisticsDecisionStatus> = new Set([
  "ready_for_quote",
  "needs_review",
  "restricted",
  "pending_postal_meta",
]);

export function mergeAcceptancesIntoAnalysis(
  analysis: LogisticsAnalysis,
  acceptances: StoredVariantAcceptance[]
): LogisticsAnalysis {
  if (!acceptances.length) return analysis;
  const bySku = new Map(
    acceptances.map((a) => [a.thirdPlatformSkuId, a] as const)
  );

  const productProfiles = (analysis.productProfiles ?? []).map((product) =>
    applyAcceptancesToProduct(product, bySku)
  );

  const totalVariants = productProfiles.reduce(
    (sum, p) => sum + p.totalVariants,
    0
  );
  const decisionStatusCounts: Record<LogisticsDecisionStatus, number> = {
    pending_sku: 0,
    pending_postal_meta: 0,
    ready_for_quote: 0,
    confirmed: 0,
    restricted: 0,
    needs_review: 0,
  };
  for (const p of productProfiles) {
    for (const [status, count] of Object.entries(p.decisionStatusCounts)) {
      decisionStatusCounts[status as LogisticsDecisionStatus] += count;
    }
  }

  return {
    ...analysis,
    productProfiles,
    totalVariants,
    decisionStatusCounts,
  };
}

function resolveAcceptedQuoteStatus(
  acceptance: StoredVariantAcceptance,
  variant: VariantLogisticsDecision
): QuoteStatus {
  const line = acceptance.recommendedLine ?? variant.recommendedLine;
  const hasLine = Boolean(line?.lineName?.trim() || line?.lineCode?.trim());
  const status = acceptance.quoteStatus ?? variant.quoteStatus;
  if (hasLine) return status ?? "SUCCESS";
  if (status === "SUCCESS") return "NOT_REQUESTED";
  return status ?? "NOT_REQUESTED";
}

function applyAcceptancesToProduct(
  product: ProductLogisticsProfile,
  bySku: Map<string, StoredVariantAcceptance>
): ProductLogisticsProfile {
  const variantDecisions = (product.variantDecisions ?? []).map((variant) => {
    const acceptance = bySku.get(variant.thirdPlatformSkuId);
    if (!acceptance) return variant;
    return {
      ...variant,
      decisionStatus: "confirmed" as const,
      decisionReason: "已接受 AI 决策",
      decisionConfirmed: true,
      acceptedAt: acceptance.acceptedAt,
      quoteStatus: resolveAcceptedQuoteStatus(acceptance, variant),
      recommendedLine: acceptance.recommendedLine ?? variant.recommendedLine,
      alternativeLines:
        acceptance.alternativeLines ?? variant.alternativeLines,
    };
  });

  return {
    ...product,
    variantDecisions,
    decisionStatusCounts: aggregateDecisionCounts(variantDecisions),
  };
}

export async function loadLogisticsAnalysis(
  shopName: string,
  force: boolean,
  options?: { includeSkuOverview?: boolean }
): Promise<LogisticsAnalysis> {
  if (!API_BASE) {
    const { buildEmptyAnalysis } = await import("@/lib/logistics/decision-engine");
    return mergeAcceptancesIntoAnalysis(
      buildEmptyAnalysis(shopName) as LogisticsAnalysis,
      readAcceptances(shopName)
    );
  }

  const analyzeUrl = `${API_BASE}/api/plugin/logistics/${force ? "analyze" : "analysis"}?shopName=${encodeURIComponent(shopName)}${force ? "&force=true" : ""}`;
  const skuOverviewUrl = `${API_BASE}/api/plugin/match/sku/overview?shopName=${encodeURIComponent(shopName)}`;

  const includeSku = options?.includeSkuOverview !== false;
  const [analysisRes, skuRes] = await Promise.all([
    fetchUpstream(analyzeUrl, {
      method: force ? "POST" : "GET",
    }),
    includeSku
      ? fetchUpstream(skuOverviewUrl, { method: "GET" })
      : Promise.resolve(null),
  ]);

  const analysisText = await analysisRes.text();
  let analysisRaw: unknown;
  try {
    analysisRaw = analysisText ? JSON.parse(analysisText) : undefined;
  } catch {
    analysisRaw = analysisText;
  }

  if (!analysisRes.ok) {
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

  return mergeAcceptancesIntoAnalysis(base, readAcceptances(shopName));
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
