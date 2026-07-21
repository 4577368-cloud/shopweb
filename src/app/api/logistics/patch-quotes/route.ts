import { NextResponse } from "next/server";
import {
  readAcceptances,
  upsertAcceptances,
  type StoredVariantAcceptance,
} from "@/lib/logistics/accept-decisions-store";
import { loadLogisticsAnalysis } from "@/lib/logistics/server-analysis";
import type { LogisticsLine, QuoteStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchQuotesBody = {
  shopName?: string;
  quotes?: Record<
    string,
    {
      recommendedLine?: LogisticsLine;
      alternativeLines?: LogisticsLine[];
      quoteStatus?: QuoteStatus;
    }
  >;
};

export async function POST(request: Request) {
  let body: PatchQuotesBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const shopName = body.shopName?.trim();
  if (!shopName) {
    return NextResponse.json({ error: "缺少 shopName" }, { status: 400 });
  }

  const quotes = body.quotes ?? {};
  const skuIds = Object.keys(quotes).filter(Boolean);
  if (skuIds.length === 0) {
    return NextResponse.json({ error: "缺少 quotes" }, { status: 400 });
  }

  try {
    const existing = readAcceptances(shopName);
    const bySku = new Map(
      existing.map((row) => [row.thirdPlatformSkuId, row] as const)
    );

    const patches: StoredVariantAcceptance[] = [];
    for (const skuId of skuIds) {
      const prev = bySku.get(skuId);
      if (!prev) continue;
      const quote = quotes[skuId];
      if (!quote?.recommendedLine) continue;
      patches.push({
        ...prev,
        recommendedLine: quote.recommendedLine,
        alternativeLines: quote.alternativeLines,
        quoteStatus: quote.quoteStatus ?? "SUCCESS",
      });
    }

    if (patches.length === 0) {
      return NextResponse.json({ error: "没有可更新的已确认规格" }, { status: 400 });
    }

    upsertAcceptances(shopName, patches);
    const analysis = await loadLogisticsAnalysis(shopName, false);

    return NextResponse.json({
      patchedCount: patches.length,
      analysis,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "更新线路报价失败" },
      { status: 502 }
    );
  }
}
