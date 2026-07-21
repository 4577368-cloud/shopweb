import { NextResponse } from "next/server";
import {
  aggregateDecisionCounts,
  computeVariantDecisionStatus,
  POSTAL_LIMIT_LABELS,
} from "@/lib/logistics/decision-engine";
import type {
  LogisticsTypeCode,
  ProductLogisticsProfile,
  SkuProductOverview,
  VariantLogisticsDecision,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

export async function POST(request: Request) {
  let body: {
    shopName?: string;
    thirdPlatformItemId?: string;
    logisticsType?: LogisticsTypeCode;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const { shopName, thirdPlatformItemId, logisticsType } = body;

  if (!shopName || !thirdPlatformItemId || !logisticsType) {
    return NextResponse.json(
      { error: "缺少必要参数：shopName, thirdPlatformItemId, logisticsType" },
      { status: 400 }
    );
  }

  if (API_BASE) {
    try {
      const upstreamUrl = `${API_BASE}/api/plugin/logistics/correct-type`;
      await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shopName, thirdPlatformItemId, logisticsType }),
      });
    } catch {
    }
  }

  const typeLabel =
    POSTAL_LIMIT_LABELS[logisticsType] || logisticsType;

  let skuOverview: SkuProductOverview | null = null;
  if (API_BASE) {
    try {
      const skuUrl = `${API_BASE}/api/plugin/match/sku/overview?shopName=${encodeURIComponent(shopName)}`;
      const skuRes = await fetch(skuUrl, {
        headers: { Accept: "application/json" },
      });
      const skuText = await skuRes.text();
      const skuRaw = skuText ? JSON.parse(skuText) : undefined;
      if (skuRes.ok && Array.isArray(skuRaw)) {
        skuOverview =
          (skuRaw as SkuProductOverview[]).find(
            (p) => p.thirdPlatformItemId === thirdPlatformItemId
          ) ?? null;
      }
    } catch {
    }
  }

  const variantDecisions: VariantLogisticsDecision[] = [];

  if (skuOverview) {
    for (const variant of skuOverview.variants) {
      const bound = variant.bound;
      const decision: Partial<VariantLogisticsDecision> = {
        tangbuySkuId: bound?.tangbuySkuId ?? null,
        tangbuyGoodsId: bound?.tangbuyProductId ?? null,
        postalLimitClass: logisticsType,
        postalLimitLabel: typeLabel,
        postalLimitConfidence: 1,
      };

      const { status, reason } = computeVariantDecisionStatus(decision);

      variantDecisions.push({
        thirdPlatformSkuId: variant.thirdPlatformSkuId,
        optionLabel: variant.optionLabel,
        tangbuySkuId: decision.tangbuySkuId ?? null,
        tangbuyGoodsId: decision.tangbuyGoodsId ?? null,
        postalLimitClass: decision.postalLimitClass,
        postalLimitLabel: decision.postalLimitLabel,
        postalLimitConfidence: decision.postalLimitConfidence,
        decisionStatus: status,
        decisionReason: reason,
      });
    }
  }

  if (variantDecisions.length === 0) {
    const baseVariant: Partial<VariantLogisticsDecision> = {
      tangbuySkuId: null,
      tangbuyGoodsId: null,
      postalLimitClass: logisticsType,
      postalLimitLabel: typeLabel,
      postalLimitConfidence: 1,
    };

    const { status, reason } = computeVariantDecisionStatus(baseVariant);

    variantDecisions.push({
      thirdPlatformSkuId: `${thirdPlatformItemId}_default`,
      optionLabel: "默认规格",
      tangbuySkuId: baseVariant.tangbuySkuId ?? null,
      tangbuyGoodsId: baseVariant.tangbuyGoodsId ?? null,
      postalLimitClass: baseVariant.postalLimitClass,
      postalLimitLabel: baseVariant.postalLimitLabel,
      postalLimitConfidence: baseVariant.postalLimitConfidence,
      decisionStatus: status,
      decisionReason: reason,
    });
  }

  const decisionStatusCounts = aggregateDecisionCounts(variantDecisions);

  const result: ProductLogisticsProfile = {
    thirdPlatformItemId,
    title: skuOverview?.title ?? null,
    primaryImageUrl: skuOverview?.imageUrl ?? null,
    dominantLogisticsType: logisticsType,
    dominantLogisticsTypeLabel: typeLabel,
    totalVariants: variantDecisions.length,
    decisionStatusCounts,
    tangbuyProductId: skuOverview?.tangbuyProductId ?? null,
    detailUrl: skuOverview?.detailUrl ?? null,
    variantDecisions,
  };

  return NextResponse.json(result);
}
