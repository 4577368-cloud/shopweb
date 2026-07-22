import type { LogisticsEstimateRequest, LogisticsEstimateResponse } from "@/lib/api";
import { normalizeTangbuyEstimateResponse } from "@/lib/logistics/estimate-normalize";
import {
  packagingToIncrementList,
  resolveCountryId,
} from "@/lib/logistics/template-params";
import { resolveTangbuyCountryId } from "@/lib/logistics/tangbuy-country";
import { toTangbuyPostLimitType } from "@/lib/logistics/postal-limit-map";
import { isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";

const ESTIMATE_PATH = "/gateway/plugin/logistic/estimateSkuSaleFeePrice";

function gatewayBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_TANGBUY_MALL_GATEWAY_BASE_URL ?? "https://tangbuy.cc"
  ).replace(/\/+$/, "");
}

function gatewayToken(): string {
  const token = process.env.NEXT_PUBLIC_TANGBUY_MALL_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "线路报价需在 .env.local 配置 NEXT_PUBLIC_TANGBUY_MALL_TOKEN（与 Render 上 TANG_PLUGIN_TANGBUY_MALL_TOKEN 相同；Render 无法访问 tangbuy.cc，须由浏览器直连）"
    );
  }
  return token;
}

async function buildTangbuyEstimateBody(body: LogisticsEstimateRequest) {
  const code = body.countryCode?.trim().toUpperCase();
  if (!code) {
    throw new Error("缺少 countryCode");
  }
  const countryId =
    body.countryId?.trim() ||
    (await resolveTangbuyCountryId(code)) ||
    resolveCountryId(code);
  if (!countryId) {
    throw new Error(
      `未配置国家 ${code} 的 Tangbuy countryId。请在 dropshipping.tangbuy.cc 对该市场试算一次，从网络请求复制 countryId，并写入 .env.local：TANGBUY_COUNTRY_IDS={"${code}":"..."}`
    );
  }

  const defaultIncrements = packagingToIncrementList(body.packaging);

  return {
    countryId,
    countryCode: code,
    shippingOption: body.shippingOption ?? 2,
    skuList: body.variants.map((v) => {
      const incrementList =
        v.incrementList?.length > 0 ? v.incrementList : defaultIncrements;
      const entry: Record<string, unknown> = {
        providerType: "alibaba",
        skuId: v.tangbuySkuId,
        goodsId: v.tangbuyGoodsId,
        incrementDTO: { incrementList },
        num: v.quantity ?? 1,
      };
      if (v.weightG != null && Number.isFinite(v.weightG)) entry.weight = v.weightG;
      if (v.lengthCm != null && Number.isFinite(v.lengthCm)) entry.length = v.lengthCm;
      if (v.widthCm != null && Number.isFinite(v.widthCm)) entry.width = v.widthCm;
      if (v.heightCm != null && Number.isFinite(v.heightCm)) entry.height = v.heightCm;
      const postLimit = toTangbuyPostLimitType(v.postalLimitClass);
      if (postLimit) entry.postLimitType = postLimit;
      return entry;
    }),
    needOtherLine: body.needOtherLine ?? true,
    needMeasure: body.needMeasure ?? true,
  };
}

/**
 * Browser-direct Tangbuy logistic estimate — same pattern as catalog/itemGet.
 * Render (and most PaaS) cannot reach tangbuy.cc; the user's browser can.
 */
export async function estimateLogisticsFromBrowser(
  body: LogisticsEstimateRequest
): Promise<LogisticsEstimateResponse> {
  if (!isMallGatewayConfigured()) {
    throw new Error(
      "线路报价需在 .env.local 配置 NEXT_PUBLIC_TANGBUY_MALL_TOKEN（Render 无法访问 tangbuy.cc，须浏览器直连网关）"
    );
  }
  if (!body.variants?.length) {
    throw new Error("请提供至少一个 variant");
  }

  const tangbuyRequest = await buildTangbuyEstimateBody(body);
  const url = `${gatewayBaseUrl()}${ESTIMATE_PATH}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayToken()}`,
      Origin: "https://dropshipping.tangbuy.cc",
      Referer: "https://dropshipping.tangbuy.cc/",
      currency: body.quoteCurrency?.trim().toUpperCase() || "USD",
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

  const traceId = res.headers.get("traceId") ?? res.headers.get("traceid") ?? undefined;
  const text = await res.text();
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : undefined;
  } catch {
    raw = text;
  }

  if (!res.ok) {
    throw new Error(
      traceId
        ? `Tangbuy 线路报价失败 (${res.status}) · traceId=${traceId}`
        : `Tangbuy 线路报价失败 (${res.status})`
    );
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("Tangbuy 网关返回非 JSON");
  }

  const envelope = raw as Record<string, unknown>;
  const gatewayCode = typeof envelope.code === "number" ? envelope.code : undefined;
  if (gatewayCode != null && gatewayCode !== 200) {
    const msg =
      (typeof envelope.msg === "string" && envelope.msg.trim()) ||
      (typeof envelope.message === "string" && envelope.message.trim()) ||
      `Tangbuy 线路报价失败 (${gatewayCode})`;
    throw new Error(traceId ? `${msg} · traceId=${traceId}` : msg);
  }

  const quoteCurrency = body.quoteCurrency?.trim().toUpperCase() || "USD";

  return normalizeTangbuyEstimateResponse(envelope, body.variants, {
    countryCode: body.countryCode?.trim().toUpperCase(),
    countryId: tangbuyRequest.countryId,
    traceId,
    feeCurrency: quoteCurrency,
  });
}
