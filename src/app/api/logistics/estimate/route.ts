import { NextResponse } from "next/server";
import {
  resolveMallGatewayBaseUrl,
  resolveServerMallToken,
} from "@/lib/logistics/mall-gateway-auth";
import { resolveCountryId } from "@/lib/logistics/template-params";
import type {
  LogisticsLine,
  QuoteStatus,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

const MISSING_GATEWAY_ERROR =
  "线路报价需 Tangbuy 网关凭证：请确认 NEXT_PUBLIC_API_BASE 指向已部署的 tangbuy-plugin（Render 上配置 TANG_PLUGIN_TANGBUY_MALL_TOKEN），或在本机 .env.local 添加 TANG_PLUGIN_TANGBUY_MALL_TOKEN 供本地 Next.js 使用。";

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
    const raw = await fetchEstimateRaw(tangbuyRequest);
    const normalized = normalizeTangbuyResponse(raw, variants);
    return NextResponse.json(normalized);
  } catch (error) {
    const message = (error as Error).message || "网关请求异常";
    const status =
      message.includes("未配置") || message.includes("NEXT_PUBLIC_API_BASE")
        ? 503
        : 502;
    return NextResponse.json(
      {
        error: message,
        success: false,
        message,
        results: variants.map((v) => ({
          thirdPlatformSkuId: v.thirdPlatformSkuId,
          quoteStatus: "FAILED" as QuoteStatus,
          errorMessage: message,
        })),
      },
      { status }
    );
  }
}

async function fetchEstimateRaw(
  tangbuyRequest: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (API_BASE) {
    try {
      return await fetchEstimateViaPlugin(tangbuyRequest);
    } catch (pluginError) {
      const token = resolveServerMallToken();
      if (token) {
        return fetchEstimateDirect(tangbuyRequest, token);
      }
      throw pluginError;
    }
  }

  const token = resolveServerMallToken();
  if (!token) {
    throw new Error(MISSING_GATEWAY_ERROR);
  }
  return fetchEstimateDirect(tangbuyRequest, token);
}

async function fetchEstimateViaPlugin(
  tangbuyRequest: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/plugin/logistics/estimate`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
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
    const detail =
      raw && typeof raw === "object" && raw !== null && "message" in raw
        ? String((raw as { message?: unknown }).message ?? "")
        : "";
    if (res.status === 404) {
      throw new Error(
        "Render 后端尚未部署 /api/plugin/logistics/estimate，请更新 tangbuy-plugin 后重试"
      );
    }
    throw new Error(
      detail.trim() ||
        `Render 后端报价失败 (${res.status})，请检查 TANG_PLUGIN_TANGBUY_MALL_TOKEN`
    );
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("Render 后端返回非 JSON");
  }
  return raw as Record<string, unknown>;
}

async function fetchEstimateDirect(
  tangbuyRequest: Record<string, unknown>,
  authToken: string
): Promise<Record<string, unknown>> {
  const gatewayUrl = `${resolveMallGatewayBaseUrl()}/gateway/plugin/logistic/estimateSkuSaleFeePrice`;
  const res = await fetch(gatewayUrl, {
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
    throw new Error(`Tangbuy 网关请求失败 (${res.status})`);
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("Tangbuy 网关返回非 JSON");
  }
  return raw as Record<string, unknown>;
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
      alternativeLines: otherLines
        ?.map((line) => parseLogisticsLine(line))
        .filter((line): line is LogisticsLine => Boolean(line.lineCode || line.lineName)),
      estimatedWeightG: result.estimatedWeightG as number | undefined,
      estimatedVolumeCm3: result.estimatedVolumeCm3 as number | undefined,
    };
  });

  return { success, message, results };
}

function parseLogisticsLine(raw: unknown): LogisticsLine {
  if (!raw || typeof raw !== "object") {
    return {
      lineCode: "",
      lineName: "",
      estimatedFee: 0,
      currency: "CNY",
      estimatedDays: 0,
      carrier: "",
      trackingAvailable: false,
      priority: 999,
    };
  }
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
