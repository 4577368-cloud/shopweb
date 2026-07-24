import { NextResponse } from "next/server";
import { upsertAcceptances } from "@/lib/logistics/accept-decisions-store";
import {
  collectAcceptableVariants,
  loadLogisticsAnalysis,
} from "@/lib/logistics/server-analysis";
import { mergeAcceptancesIntoAnalysis } from "@/lib/logistics/merge-acceptances-into-analysis";
import type {
  LogisticsAcceptDecisionRequest,
  LogisticsAcceptDecisionResult,
} from "@/lib/api";
import type { QuoteStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: LogisticsAcceptDecisionRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const shopName = body.shopName?.trim();
  if (!shopName) {
    return NextResponse.json({ error: "缺少 shopName" }, { status: 400 });
  }

  const scope = body.targetScope ?? "VARIANTS";
  const variantIds = (body.variantIds ?? []).filter(Boolean);

  if (scope === "VARIANTS" && variantIds.length === 0) {
    return NextResponse.json({ error: "VARIANTS 范围需提供 variantIds" }, {
      status: 400,
    });
  }

  try {
    const analysis = await loadLogisticsAnalysis(shopName, false);
    const { readAcceptances } = await import(
      "@/lib/logistics/accept-decisions-store"
    );
    const alreadyAccepted = new Set(
      readAcceptances(shopName).map((a) => a.thirdPlatformSkuId)
    );

    const targets = collectAcceptableVariants(analysis, {
      variantIds: scope === "ALL_READY" ? undefined : variantIds,
      scope,
      alreadyAccepted,
    });

    if (targets.length === 0) {
      return NextResponse.json({
        acceptedCount: 0,
        analysis,
      } satisfies LogisticsAcceptDecisionResult);
    }

    const now = new Date().toISOString();
    const quotes = body.quotes ?? {};
    const incoming = targets.map(({ variant, productId }) => {
      const quote = quotes[variant.thirdPlatformSkuId];
      return {
        thirdPlatformSkuId: variant.thirdPlatformSkuId,
        thirdPlatformItemId: productId,
        acceptedAt: now,
        recommendedLine:
          quote?.recommendedLine ?? variant.recommendedLine ?? undefined,
        alternativeLines:
          quote?.alternativeLines ?? variant.alternativeLines ?? undefined,
        quoteStatus:
          quote?.quoteStatus ??
          variant.quoteStatus ??
          (quote?.recommendedLine || variant.recommendedLine
            ? ("SUCCESS" as QuoteStatus)
            : ("NOT_REQUESTED" as QuoteStatus)),
      };
    });

    upsertAcceptances(shopName, incoming);
    const refreshed = mergeAcceptancesIntoAnalysis(
      analysis,
      readAcceptances(shopName)
    );

    return NextResponse.json({
      acceptedCount: incoming.length,
      analysis: refreshed,
    } satisfies LogisticsAcceptDecisionResult);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "接受决策失败" },
      { status: 502 }
    );
  }
}
