import { NextResponse } from "next/server";
import { rejectUnlessAppSession } from "@/lib/auth/require-app-session";
import {
  loadLogisticsAnalysis,
  upstreamAuthFromRequest,
} from "@/lib/logistics/server-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "物流服务暂时不可用，请稍后重试";
}

export async function POST(request: Request) {
  const denied = rejectUnlessAppSession(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const shopName = searchParams.get("shopName");
  const force = searchParams.get("force") === "true";

  if (!shopName) {
    return NextResponse.json({ error: "缺少 shopName 参数" }, { status: 400 });
  }

  try {
    const result = await loadLogisticsAnalysis(shopName, force, {
      auth: upstreamAuthFromRequest(request),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = errorMessage(error);
    console.error("[logistics/analyze]", shopName, message, error);
    const status = /登录已失效|UNAUTHENTICATED|Unauthorized/i.test(message)
      ? 401
      : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
