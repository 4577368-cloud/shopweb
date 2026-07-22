import type { LogisticsLine, QuoteStatus } from "@/lib/types";
import type {
  LogisticsEstimateRequest,
  LogisticsEstimateResponse,
  LogisticsEstimateResult,
} from "@/lib/api";

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

/** Tangbuy returns ranges like "10-20" in transitTime. */
function parseTransitDays(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const match = value.trim().match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

/** Tangbuy estimate rows return volume like "29.50*23.50*4.50" (cm). */
export function parseTangbuyVolumeDimensions(volume: unknown): {
  estimatedLengthCm?: number;
  estimatedWidthCm?: number;
  estimatedHeightCm?: number;
  estimatedVolumeCm3?: number;
} {
  const raw = typeof volume === "string" ? volume.trim() : "";
  const match = raw.match(
    /(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/
  );
  if (!match) return {};

  const estimatedLengthCm = Number(match[1]);
  const estimatedWidthCm = Number(match[2]);
  const estimatedHeightCm = Number(match[3]);
  if (![estimatedLengthCm, estimatedWidthCm, estimatedHeightCm].every(Number.isFinite)) {
    return {};
  }

  return {
    estimatedLengthCm,
    estimatedWidthCm,
    estimatedHeightCm,
    estimatedVolumeCm3: Math.round(
      estimatedLengthCm * estimatedWidthCm * estimatedHeightCm
    ),
  };
}

function extractEstimateMeasures(rawResult: Record<string, unknown>): {
  estimatedWeightG?: number;
  estimatedVolumeCm3?: number;
  estimatedLengthCm?: number;
  estimatedWidthCm?: number;
  estimatedHeightCm?: number;
} {
  const fromVolume = parseTangbuyVolumeDimensions(rawResult.volume);
  const estimatedWeightG =
    pickNumber(rawResult, ["weight", "weightG", "estimatedWeightG"]) ??
    pickNumber(rawResult, ["billWeight"]);

  return {
    estimatedWeightG,
    estimatedVolumeCm3:
      fromVolume.estimatedVolumeCm3 ??
      pickNumber(rawResult, ["estimatedVolumeCm3", "volumeCm3"]),
    estimatedLengthCm:
      fromVolume.estimatedLengthCm ??
      pickNumber(rawResult, ["estimatedLengthCm", "length", "lengthCm"]),
    estimatedWidthCm:
      fromVolume.estimatedWidthCm ??
      pickNumber(rawResult, ["estimatedWidthCm", "width", "widthCm"]),
    estimatedHeightCm:
      fromVolume.estimatedHeightCm ??
      pickNumber(rawResult, ["estimatedHeightCm", "height", "heightCm"]),
  };
}

export function parseLogisticsLine(raw: unknown, feeCurrency = "USD"): LogisticsLine {
  if (!raw || typeof raw !== "object") {
    return {
      lineCode: "",
      lineName: "",
      estimatedFee: 0,
      currency: feeCurrency,
      estimatedDays: 0,
      carrier: "",
      trackingAvailable: false,
      priority: 999,
    };
  }
  const line = raw as Record<string, unknown>;
  const transitTimeLabel = pickString(line, ["transitTime"]) || undefined;
  return {
    lineCode: pickString(line, ["lineCode", "lineId", "routeCode", "id", "code"]),
    lineName: pickString(line, ["lineName", "lineTitle", "routeName", "name", "title"]),
    estimatedFee:
      pickNumber(line, [
        "shippingFee",
        "baseFee",
        "estimatedFee",
        "saleFeePrice",
        "feePrice",
        "price",
        "totalFee",
        "logisticsFee",
      ]) ?? 0,
    currency: pickString(line, ["currency", "feeCurrency"]) || feeCurrency,
    estimatedDays:
      pickNumber(line, ["estimatedDays", "timeliness", "days", "deliveryDays", "period"]) ??
      parseTransitDays(transitTimeLabel) ??
      0,
    transitTimeLabel,
    carrier: pickString(line, ["carrier", "logisticsProvider", "providerName", "companyName"]),
    supportsBattery: line.supportsBattery === true,
    trackingAvailable: line.trackingAvailable === true || line.trackable === true,
    priority: pickNumber(line, ["index", "priority", "sort"]) ?? 999,
  };
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

function extractRawSkuResults(raw: Record<string, unknown>): {
  results: Record<string, unknown>[];
  gatewayCode?: number;
  gatewayMsg?: string | null;
} {
  const gatewayCode = typeof raw.code === "number" ? raw.code : undefined;
  const gatewayMsg =
    typeof raw.msg === "string"
      ? raw.msg
      : typeof raw.message === "string"
        ? raw.message
        : null;

  const data = raw.data;
  if (data === null) {
    return { results: [], gatewayCode, gatewayMsg: gatewayMsg ?? "INVALID_GOODS_ID" };
  }
  if (Array.isArray(data)) {
    return { results: asRecordArray(data), gatewayCode, gatewayMsg };
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["skuResults", "list", "rows", "resultList"]) {
      const arr = obj[key];
      if (Array.isArray(arr)) {
        return { results: asRecordArray(arr), gatewayCode, gatewayMsg };
      }
    }
  }
  if (Array.isArray(raw.results)) {
    return { results: asRecordArray(raw.results), gatewayCode, gatewayMsg };
  }
  return { results: [], gatewayCode, gatewayMsg };
}

function lineKey(line: LogisticsLine): string {
  return `${line.lineCode}|${line.lineName}|${line.estimatedFee}`;
}

function isTangbuyPrimaryRow(rawResult: Record<string, unknown>): boolean {
  return (
    rawResult.shippingFee != null ||
    rawResult.lineId != null ||
    rawResult.name != null
  );
}

function parsePrimaryLine(
  rawResult: Record<string, unknown>,
  feeCurrency: string
): LogisticsLine | undefined {
  if (!isTangbuyPrimaryRow(rawResult)) return undefined;
  const line = parseLogisticsLine(rawResult, feeCurrency);
  if (!line.lineCode && !line.lineName && line.estimatedFee <= 0) return undefined;
  return line;
}

function parseAlternativeLines(
  rawResult: Record<string, unknown>,
  feeCurrency: string,
  exclude?: LogisticsLine
): LogisticsLine[] {
  const singles = [
    rawResult.mainLine,
    rawResult.recommendLine,
    rawResult.recommendedLine,
    rawResult.mainRoute,
    rawResult.bestLine,
  ];
  const lists = [
    rawResult.otherSkuSalePriceVOList,
    rawResult.lineList,
    rawResult.lines,
    rawResult.routes,
    rawResult.otherLines,
    rawResult.otherLineList,
    rawResult.alternativeLines,
  ];

  const out: LogisticsLine[] = [];
  const seen = new Set<string>();
  if (exclude) seen.add(lineKey(exclude));

  const pushLine = (raw: unknown) => {
    const line = parseLogisticsLine(raw, feeCurrency);
    if (!line.lineCode && !line.lineName && line.estimatedFee <= 0) return;
    const key = lineKey(line);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(line);
  };

  for (const single of singles) {
    pushLine(single);
  }
  for (const list of lists) {
    for (const item of asRecordArray(list)) {
      pushLine(item);
    }
  }

  return out.sort((a, b) => a.estimatedFee - b.estimatedFee || a.priority - b.priority);
}

function lineCandidates(
  rawResult: Record<string, unknown>,
  feeCurrency: string
): LogisticsLine[] {
  const primary = parsePrimaryLine(rawResult, feeCurrency);
  const alternatives = parseAlternativeLines(rawResult, feeCurrency, primary);
  if (primary) return [primary, ...alternatives];
  return alternatives;
}

function resolveQuoteStatus(
  rawResult: Record<string, unknown>,
  lines: LogisticsLine[]
): QuoteStatus {
  const explicit = String(rawResult.priceStatus ?? rawResult.quoteStatus ?? "").toUpperCase();
  if (explicit === "SUCCESS") return "SUCCESS";
  if (explicit === "PENDING") return "PENDING";
  if (explicit === "NOT_REQUESTED") return "NOT_REQUESTED";
  if (lines.length > 0) return "SUCCESS";
  return "FAILED";
}

const TANGBUY_DELIVERY_PRESET_URL =
  "https://dropshipping.tangbuy.cc/setting/delivery-preset";

function buildInvalidGoodsIdMessage(offerHint?: string): string {
  const offer = offerHint?.trim();
  return (
    `Tangbuy 网关拒绝报价（data: null）—— goodsId 不是商品库 internal ID。` +
    (offer ? `当前绑定 offerId=${offer}。` : "") +
    `1688 图搜绑定的 offerId 不能直接用于 estimateSkuSaleFeePrice；` +
    `请先在 dropshipping.tangbuy.cc 将商品加入商品库，或使用商品库 goodsId（如 72417809760272）试算。`
  );
}

function buildEmptyDataMessage(
  gatewayMsg: string | null | undefined,
  countryCode?: string,
  countryId?: string,
  traceId?: string
): string {
  if (gatewayMsg === "INVALID_GOODS_ID") {
    return buildInvalidGoodsIdMessage();
  }
  if (gatewayMsg?.trim()) {
    return traceId ? `${gatewayMsg.trim()} · traceId=${traceId}` : gatewayMsg.trim();
  }
  const market = countryCode?.trim() ? `（${countryCode.trim()}）` : "";
  const idHint = countryId?.trim() ? ` countryId=${countryId.trim()}，` : " ";
  const trace = traceId ? ` traceId=${traceId}，` : " ";
  return (
    `Tangbuy 网关返回空线路${market}（HTTP 200 / data: []）。` +
    `${idHint}常见原因：` +
    `① countryId 与 countryCode 不匹配（请用 areaListGroup 或 dropshipping 试算核对）；` +
    `② 发货预设未配置该目的国线路（${TANGBUY_DELIVERY_PRESET_URL}）；` +
    `③ SKU 缺重量/尺寸。` +
    `${trace}请在 dropshipping 后台对同一市场手动试算，核对请求里的 countryId 是否与 App 一致。`
  );
}

function parseSkuResult(
  rawResult: Record<string, unknown>,
  thirdPlatformSkuId: string,
  emptyDataMessage?: string,
  feeCurrency = "USD"
): LogisticsEstimateResult {
  const primary = parsePrimaryLine(rawResult, feeCurrency);
  const alternatives = parseAlternativeLines(rawResult, feeCurrency, primary);
  const lines = primary ? [primary, ...alternatives] : lineCandidates(rawResult, feeCurrency);
  const quoteStatus = resolveQuoteStatus(rawResult, lines);
  const recommendedLine = primary ?? lines[0];
  const alternativeLines = primary ? alternatives : lines.slice(1);

  return {
    thirdPlatformSkuId,
    quoteStatus,
    errorMessage:
      quoteStatus === "FAILED"
        ? String(
            rawResult.errorMessage ??
              rawResult.msg ??
              rawResult.message ??
              emptyDataMessage ??
              "报价失败"
          )
        : undefined,
    recommendedLine,
    alternativeLines: alternativeLines.length ? alternativeLines : undefined,
    ...extractEstimateMeasures(rawResult),
  };
}

function indexResultsBySkuId(
  results: Record<string, unknown>[]
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const result of results) {
    const skuId = pickString(result, ["skuId", "offerSkuId", "tangbuySkuId"]);
    if (skuId) map.set(skuId, result);
  }
  return map;
}

export function normalizeTangbuyEstimateResponse(
  raw: Record<string, unknown>,
  requestVariants: LogisticsEstimateRequest["variants"],
  options?: { countryCode?: string; countryId?: string; traceId?: string; feeCurrency?: string }
): LogisticsEstimateResponse {
  const feeCurrency = options?.feeCurrency?.trim().toUpperCase() || "USD";
  const { results: rawResults, gatewayCode, gatewayMsg } = extractRawSkuResults(raw);
  const success =
    raw.success === true ||
    gatewayCode === 200 ||
    (gatewayCode == null && rawResults.length > 0);
  const message =
    gatewayMsg?.trim() ||
    (typeof raw.message === "string" ? raw.message : undefined);

  const emptyDataMessage =
    rawResults.length === 0
      ? buildEmptyDataMessage(
          gatewayMsg,
          options?.countryCode,
          options?.countryId,
          options?.traceId
        )
      : undefined;

  if (rawResults.length === 0) {
    return {
      success,
      message,
      results: requestVariants.map((variant) => ({
        thirdPlatformSkuId: variant.thirdPlatformSkuId,
        quoteStatus: "FAILED",
        errorMessage: emptyDataMessage,
      })),
    };
  }

  const bySkuId = indexResultsBySkuId(rawResults);

  const results: LogisticsEstimateResult[] = requestVariants.map((variant, index) => {
    const rawResult =
      bySkuId.get(variant.tangbuySkuId) ??
      (requestVariants.length === rawResults.length ? rawResults[index] : undefined);

    if (!rawResult) {
      return {
        thirdPlatformSkuId: variant.thirdPlatformSkuId,
        quoteStatus: "FAILED",
        errorMessage: emptyDataMessage ?? "未获取到报价结果",
      };
    }

    return parseSkuResult(
      rawResult,
      variant.thirdPlatformSkuId,
      emptyDataMessage,
      feeCurrency
    );
  });

  return { success, message, results };
}
