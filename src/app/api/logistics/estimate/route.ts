import { NextResponse } from "next/server";
import { resolveCountryId } from "@/lib/logistics/template-params";
import type {
  LogisticsLine,
  QuoteStatus,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TANGBUY_GATEWAY_URL = "https://tangbuy.cc/gateway/plugin/logistic/estimateSkuSaleFeePrice";

export interface LogisticsEstimateRequest {
  shopName: string;
  countryId?: string;
  countryCode: string;
  shippingOption: number;
  packaging?: string;
  variants: Array<{
    thirdPlatformSkuId: string;
    tangbuySkuId: string;
    tangbuyGoodsId: string;
    incrementList: string[];
    quantity: number;
  }>;
  needOtherLine?: boolean;
  needMeasure?: boolean;
}

export interface LogisticsEstimateResult {
  thirdPlatformSkuId: string;
  quoteStatus: QuoteStatus;
  errorMessage?: string;
  recommendedLine?: LogisticsLine;
  alternativeLines?: LogisticsLine[];
  estimatedWeightG?: number;
  estimatedVolumeCm3?: number;
}

export interface LogisticsEstimateResponse {
  success: boolean;
  message?: string;
  results: LogisticsEstimateResult[];
}

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

  const authToken = process.env.TANG_PLUGIN_TANGBUY_MALL_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "网关配置未就绪" }, { status: 500 });
  }

  const tangbuyRequest = {
    countryId,
    countryCode: code,
    shippingOption: shippingOption ?? 2,
    skuList: variants.map((v) => ({
      providerType: "alibaba",
      skuId: v.tangbuySkuId,
      goodsId: v.tangbuyGoodsId,
      incrementDTO: {
        incrementList: v.incrementList,
      },
      num: v.quantity ?? 1,
    })),
    needOtherLine: body.needOtherLine ?? true,
    needMeasure: body.needMeasure ?? false,
  };

  try {
    const res = await fetch(TANGBUY_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
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

    if (!res.ok) {
      return NextResponse.json(
        { error: `网关请求失败: ${res.status}`, details: raw },
        { status: res.status }
      );
    }

    const normalized = normalizeTangbuyResponse(raw as Record<string, unknown>, variants);
    return NextResponse.json(normalized);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "网关请求异常",
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

function normalizeTangbuyResponse(
  raw: Record<string, unknown>,
  requestVariants: LogisticsEstimateRequest["variants"]
): LogisticsEstimateResponse {
  const success = raw.success === true;
  const message = typeof raw.message === "string" ? raw.message : undefined;

  const data = raw.data as Record<string, unknown> | undefined;
  const rawResults = (data?.skuResults as Array<unknown>) ?? [];

  const rawResultsMap = new Map<string, unknown>();
  for (const r of rawResults) {
    const result = r as Record<string, unknown>;
    const skuId = String(result.skuId ?? "");
    if (skuId) {
      rawResultsMap.set(skuId, r);
    }
  }

  const results: LogisticsEstimateResult[] = requestVariants.map((v) => {
    const rawResult = rawResultsMap.get(v.tangbuySkuId);

    if (!rawResult) {
      return {
        thirdPlatformSkuId: v.thirdPlatformSkuId,
        quoteStatus: "FAILED",
        errorMessage: "未获取到报价结果",
      };
    }

    const result = rawResult as Record<string, unknown>;
    const priceStatus = String(result.priceStatus ?? "FAILED");

    let quoteStatus: QuoteStatus = "FAILED";
    if (priceStatus === "SUCCESS") quoteStatus = "SUCCESS";
    else if (priceStatus === "PENDING") quoteStatus = "PENDING";
    else if (priceStatus === "NOT_REQUESTED") quoteStatus = "NOT_REQUESTED";

    const mainLine = result.mainLine as Record<string, unknown> | undefined;
    const otherLines = result.otherLines as Array<unknown> | undefined;

    return {
      thirdPlatformSkuId: v.thirdPlatformSkuId,
      quoteStatus,
      errorMessage: quoteStatus === "FAILED"
        ? String(result.errorMessage ?? "报价失败")
        : undefined,
      recommendedLine: mainLine ? parseLogisticsLine(mainLine) : undefined,
      alternativeLines: otherLines?.map(parseLogisticsLine),
      estimatedWeightG: result.estimatedWeightG as number | undefined,
      estimatedVolumeCm3: result.estimatedVolumeCm3 as number | undefined,
    };
  });

  return { success, message, results };
}

function parseLogisticsLine(raw: unknown): LogisticsLine {
  const line = raw as Record<string, unknown>;
  return {
    lineCode: String(line.lineCode ?? ""),
    lineName: String(line.lineName ?? ""),
    estimatedFee: Number(line.estimatedFee ?? 0),
    currency: String(line.currency ?? "CNY"),
    estimatedDays: Number(line.estimatedDays ?? 0),
    carrier: String(line.carrier ?? ""),
    supportsBattery: line.supportsBattery === true,
    trackingAvailable: line.trackingAvailable === true,
    priority: Number(line.priority ?? 999),
  };
}
