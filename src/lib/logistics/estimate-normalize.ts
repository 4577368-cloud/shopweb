import type { LogisticsLine, QuoteStatus } from "@/lib/types";
import type {
  LogisticsEstimateRequest,
  LogisticsEstimateResponse,
  LogisticsEstimateResult,
} from "@/lib/api";

export function parseLogisticsLine(raw: unknown): LogisticsLine {
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

export function normalizeTangbuyEstimateResponse(
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
      errorMessage:
        quoteStatus === "FAILED"
          ? String(result.errorMessage ?? "报价失败")
          : undefined,
      recommendedLine: mainLine ? parseLogisticsLine(mainLine) : undefined,
      alternativeLines: otherLines
        ?.map((line) => parseLogisticsLine(line))
        .filter((line): line is LogisticsLine =>
          Boolean(line.lineCode || line.lineName)
        ),
      estimatedWeightG: result.estimatedWeightG as number | undefined,
      estimatedVolumeCm3: result.estimatedVolumeCm3 as number | undefined,
    };
  });

  return { success, message, results };
}
