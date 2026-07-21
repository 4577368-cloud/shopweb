import { NextResponse } from "next/server";
import {
  aggregateDecisionCounts,
  computeVariantDecisionStatus,
  POSTAL_LIMIT_LABELS,
} from "@/lib/logistics/decision-engine";
import type {
  LogisticsTypeCode,
  ProductLogisticsProfile,
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
      // 上游失败也继续返回前端需要的结构
    }
  }

  const typeLabel =
    POSTAL_LIMIT_LABELS[logisticsType] || logisticsType;

  const baseVariant: Partial<VariantLogisticsDecision> = {
    tangbuySkuId: null,
    tangbuyGoodsId: null,
    postalLimitClass: logisticsType,
    postalLimitLabel: typeLabel,
    postalLimitConfidence: 1,
  };

  const { status, reason } = computeVariantDecisionStatus(baseVariant);

  const singleVariant: VariantLogisticsDecision = {
    thirdPlatformSkuId: `${thirdPlatformItemId}_default`,
    optionLabel: "默认规格",
    tangbuySkuId: baseVariant.tangbuySkuId ?? null,
    tangbuyGoodsId: baseVariant.tangbuyGoodsId ?? null,
    postalLimitClass: baseVariant.postalLimitClass,
    postalLimitLabel: baseVariant.postalLimitLabel,
    postalLimitConfidence: baseVariant.postalLimitConfidence,
    decisionStatus: status,
    decisionReason: reason,
  };

  const variantDecisions = [singleVariant];
  const decisionStatusCounts = aggregateDecisionCounts(variantDecisions);

  const result: ProductLogisticsProfile = {
    thirdPlatformItemId,
    title: null,
    primaryImageUrl: null,
    dominantLogisticsType: logisticsType,
    dominantLogisticsTypeLabel: typeLabel,
    totalVariants: 1,
    decisionStatusCounts,
    tangbuyProductId: null,
    detailUrl: null,
    variantDecisions,
  };

  return NextResponse.json(result);
}
