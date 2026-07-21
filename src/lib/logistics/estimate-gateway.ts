import type { LogisticsEstimateRequest, LogisticsEstimateResponse } from "@/lib/api";
import { normalizeTangbuyEstimateResponse } from "@/lib/logistics/estimate-normalize";
import { resolveCountryId } from "@/lib/logistics/template-params";
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

function buildTangbuyEstimateBody(body: LogisticsEstimateRequest) {
  const code = body.countryCode?.trim().toUpperCase();
  if (!code) {
    throw new Error("缺少 countryCode");
  }
  const countryId = body.countryId?.trim() || resolveCountryId(code);
  if (!countryId) {
    throw new Error(
      `未配置国家 ${code} 的 countryId，请在物流模板中选择已支持市场`
    );
  }

  return {
    countryId,
    countryCode: code,
    shippingOption: body.shippingOption ?? 2,
    skuList: body.variants.map((v) => ({
      providerType: "alibaba",
      skuId: v.tangbuySkuId,
      goodsId: v.tangbuyGoodsId,
      incrementDTO: {
        incrementList: v.incrementList,
      },
      num: v.quantity ?? 1,
    })),
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

  const tangbuyRequest = buildTangbuyEstimateBody(body);
  const url = `${gatewayBaseUrl()}${ESTIMATE_PATH}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayToken()}`,
      Origin: "https://dropshipping.tangbuy.cc",
      Referer: "https://dropshipping.tangbuy.cc/",
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
    throw new Error(`Tangbuy 线路报价失败 (${res.status})`);
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("Tangbuy 网关返回非 JSON");
  }

  return normalizeTangbuyEstimateResponse(
    raw as Record<string, unknown>,
    body.variants
  );
}
