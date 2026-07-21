import { api, ApiError } from "@/lib/api";
import type {
  SkuAlignConfirmResult,
  SkuAlignConfirmSuggestionsRequest,
  SkuAlignManualBindRequest,
} from "./types";

/** Render / older backends return 500 with Spring static-resource miss for undeployed V1 routes. */
export function isSkuAlignV1Unavailable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 404) return true;
  const message = err.message;
  if (typeof message !== "string") return false;
  return (
    message.includes("NoResourceFoundException") ||
    message.includes("No static resource api/plugin/sku-align/v1")
  );
}

/** True when V1 alignment endpoints are missing or cannot start runs — fall back to legacy auto-align. */
export function shouldFallbackToLegacyAlign(err: unknown): boolean {
  if (isSkuAlignV1Unavailable(err)) return true;
  if (!(err instanceof ApiError)) return false;
  if (err.status === 404) return true;
  const message = err.message;
  if (typeof message !== "string") return false;
  return (
    message.includes("InvalidDataAccessApiUsageException") ||
    message.includes("alignment_run") ||
    message.includes("/sku-align/v1/runs")
  );
}

/**
 * Prefer V1 confirm-suggestions; when the backend has not deployed V1 yet, promote legacy PENDING
 * bindings via /match/sku/ack for the supplied variant ids.
 */
export async function confirmSuggestionsWithFallback(
  body: SkuAlignConfirmSuggestionsRequest,
  legacyPendingVariantIds: string[]
): Promise<SkuAlignConfirmResult> {
  try {
    return await api.skuAlignV1ConfirmSuggestions(body);
  } catch (err) {
    if (!isSkuAlignV1Unavailable(err)) throw err;
    const pending = legacyPendingVariantIds.filter(Boolean);
    if (!pending.length) {
      return { confirmedCount: 0 };
    }
    let confirmed = 0;
    for (const variantId of pending) {
      await api.ackSkuBinding(body.shopName, variantId);
      confirmed++;
    }
    return { confirmedCount: confirmed };
  }
}

/** Prefer V1 manual bind; fall back to legacy /match/sku/bind when V1 route fails. */
export async function manualBindWithFallback(
  variantId: string,
  body: SkuAlignManualBindRequest,
  legacy: { detailUrl?: string | null }
): Promise<void> {
  try {
    await api.skuAlignV1ManualBind(variantId, body);
  } catch (err) {
    const networkOrV1 =
      shouldFallbackToLegacyAlign(err) ||
      (err instanceof ApiError && err.status === 0);
    if (!networkOrV1) throw err;
    await api.bindSkuBinding({
      shopName: body.shopName,
      thirdPlatformItemId: body.thirdPlatformItemId,
      thirdPlatformSkuId: variantId,
      tangbuyProductId: body.offerId,
      tangbuySkuId: body.offerSkuId,
      tangbuySkuSpec: body.reason ?? null,
      detailUrl: legacy.detailUrl ?? null,
    });
  }
}
