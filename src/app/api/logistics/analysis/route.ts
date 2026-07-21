import { NextResponse } from "next/server";
import {
  buildEmptyAnalysis,
  transformLegacyAnalysis,
  type LegacyLogisticsAnalysis,
} from "@/lib/logistics/decision-engine";
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
    const upstreamUrl = `${API_BASE}/api/plugin/logistics/analysis?shopName=${encodeURIComponent(shopName)}`;

    const res = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const text = await res.text();
    let raw: unknown;
    try {
      raw = text ? JSON.parse(text) : undefined;
    } catch {
      raw = text;
    }

    if (!res.ok) {
      return NextResponse.json(raw ?? { error: `上游请求失败 ${res.status}` }, {
        status: res.status,
      });
    }

    const legacy = raw as LegacyLogisticsAnalysis;

    if (!legacy || typeof legacy !== "object") {
      return NextResponse.json(buildEmptyAnalysis(shopName));
    }

    const transformed = transformLegacyAnalysis(legacy);
    const result: LogisticsAnalysis = {
      shopName: legacy.shopName ?? shopName,
      status: legacy.status ?? "ok",
      analyzedCount: legacy.analyzedCount ?? 0,
      skippedUnboundCount: legacy.skippedUnboundCount ?? 0,
      productProfiles: transformed.productProfiles,
      totalVariants: transformed.totalVariants,
      decisionStatusCounts: transformed.decisionStatusCounts,
      highRiskTypes: transformed.highRiskTypes,
    };

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(buildEmptyAnalysis(shopName), { status: 502 });
  }
}
