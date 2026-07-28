import { NextResponse } from "next/server";
import { removeAcceptances } from "@/lib/logistics/accept-decisions-store";
import {
  loadLogisticsAnalysis,
  upstreamAuthFromRequest,
} from "@/lib/logistics/server-analysis";
import { unconfirmVariantsInAnalysis } from "@/lib/logistics/unconfirm-variants";
import type { LogisticsAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReopenBody = {
  shopName?: string;
  variantIds?: string[];
};

export async function POST(request: Request) {
  let body: ReopenBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const shopName = body.shopName?.trim();
  if (!shopName) {
    return NextResponse.json({ error: "缺少 shopName" }, { status: 400 });
  }

  const variantIds = (body.variantIds ?? []).filter(Boolean);
  if (variantIds.length === 0) {
    return NextResponse.json({ error: "缺少 variantIds" }, { status: 400 });
  }

  try {
    const auth = upstreamAuthFromRequest(request);
    await removeAcceptances(shopName, variantIds, auth);
    const loaded = await loadLogisticsAnalysis(shopName, false, { auth });
    const analysis: LogisticsAnalysis = unconfirmVariantsInAnalysis(
      loaded,
      variantIds
    );

    return NextResponse.json({
      reopenedCount: variantIds.length,
      analysis,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "重开决策失败" },
      { status: 502 }
    );
  }
}
