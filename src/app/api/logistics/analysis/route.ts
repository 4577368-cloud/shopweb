import { NextResponse } from "next/server";
import { buildEmptyAnalysis } from "@/lib/logistics/decision-engine";
import { loadLogisticsAnalysis } from "@/lib/logistics/server-analysis";
import type { LogisticsAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shopName = searchParams.get("shopName");

  if (!shopName) {
    return NextResponse.json({ error: "缺少 shopName 参数" }, { status: 400 });
  }

  if (!API_BASE) {
    const empty = buildEmptyAnalysis(shopName) as LogisticsAnalysis;
    return NextResponse.json(empty);
  }

  try {
    const result = await loadLogisticsAnalysis(shopName, false, {
      includeSkuOverview: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(buildEmptyAnalysis(shopName), { status: 502 });
  }
}
