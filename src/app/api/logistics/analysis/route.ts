import { NextResponse } from "next/server";
import { loadLogisticsAnalysis } from "@/lib/logistics/server-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "物流服务暂时不可用，请稍后重试";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shopName = searchParams.get("shopName");

  if (!shopName) {
    return NextResponse.json({ error: "缺少 shopName 参数" }, { status: 400 });
  }

  try {
    const result = await loadLogisticsAnalysis(shopName, false, {
      includeSkuOverview: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = errorMessage(error);
    console.error("[logistics/analysis]", shopName, message, error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
