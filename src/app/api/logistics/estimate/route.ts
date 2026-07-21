import { NextResponse } from "next/server";
import type { LogisticsEstimateRequest } from "@/lib/api";
import { normalizeTangbuyEstimateResponse } from "@/lib/logistics/estimate-normalize";
import {
  resolveMallGatewayBaseUrl,
  resolveServerMallToken,
} from "@/lib/logistics/mall-gateway-auth";
import { resolveCountryId } from "@/lib/logistics/template-params";
import type { QuoteStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Legacy server-side estimate (local dev with TANG_PLUGIN_TANGBUY_MALL_TOKEN only).
 * Production UI calls tangbuy.cc from the browser — Render cannot reach .cc domains.
 */
export async function POST(request: Request) {
  let body: LogisticsEstimateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const { shopName, countryCode, shippingOption, variants } = body;
  const code = countryCode?.trim().toUpperCase();

  if (!shopName || !code) {
    return NextResponse.json(
      { error: "缺少必要参数：shopName, countryCode" },
      { status: 400 }
    );
  }

  const countryId = body.countryId?.trim() || resolveCountryId(code);
  if (!countryId) {
    return NextResponse.json(
      {
        error: `未配置国家 ${code} 的 countryId，请在模板中选择已支持市场或配置 TANGBUY_COUNTRY_IDS`,
      },
      { status: 400 }
    );
  }

  if (!variants || variants.length === 0) {
    return NextResponse.json({ error: "请提供至少一个 variant" }, { status: 400 });
  }

  const token = resolveServerMallToken();
  if (!token) {
    return NextResponse.json(
      {
        error:
          "请在前端配置 NEXT_PUBLIC_TANGBUY_MALL_TOKEN 由浏览器直连 tangbuy.cc（Render 无法访问 .cc）。本路由仅作本地 server token 调试备用。",
      },
      { status: 503 }
    );
  }

  const tangbuyRequest = {
    countryId,
    countryCode: code,
    shippingOption: shippingOption ?? 2,
    skuList: variants.map((v) => ({
      providerType: "alibaba",
      skuId: v.tangbuySkuId,
      goodsId: v.tangbuyGoodsId,
      incrementDTO: { incrementList: v.incrementList },
      num: v.quantity ?? 1,
    })),
    needOtherLine: body.needOtherLine ?? true,
    needMeasure: body.needMeasure ?? false,
  };

  try {
    const gatewayUrl = `${resolveMallGatewayBaseUrl()}/gateway/plugin/logistic/estimateSkuSaleFeePrice`;
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        currency: "CNY",
        device: "pc",
        lang: "cn",
        "tang-request-device": "web",
        "tang-request-render": "csr",
        "tang-request-rewrite": "true",
        "x-timezone": "8",
        "x-timezone-id": "Asia/Shanghai",
      },
      body: JSON.stringify(tangbuyRequest),
    });

    const text = await res.text();
    let raw: unknown;
    try {
      raw = text ? JSON.parse(text) : undefined;
    } catch {
      raw = text;
    }

    if (!res.ok || !raw || typeof raw !== "object") {
      return NextResponse.json(
        { error: `Tangbuy 网关请求失败 (${res.status})` },
        { status: 502 }
      );
    }

    return NextResponse.json(
      normalizeTangbuyEstimateResponse(raw as Record<string, unknown>, variants)
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: (error as Error).message || "网关请求异常",
        success: false,
        results: variants.map((v) => ({
          thirdPlatformSkuId: v.thirdPlatformSkuId,
          quoteStatus: "FAILED" as QuoteStatus,
          errorMessage: (error as Error).message,
        })),
      },
      { status: 502 }
    );
  }
}
