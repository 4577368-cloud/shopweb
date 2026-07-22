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

/**
 * True when V1 alignment endpoints are missing — fall back to legacy auto-align.
 * 收紧回退条件：仅当 V1 路由明确不存在（404 或静态资源 miss）才回退，
 * 网络抖动/500 错误不再回退，避免 V1 状态不一致。
 */
export function shouldFallbackToLegacyAlign(err: unknown): boolean {
  return isSkuAlignV1Unavailable(err);
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

/** Prefer V1 manual bind; fall back to legacy /match/sku/bind only when V1 route is undeployed. */
export async function manualBindWithFallback(
  variantId: string,
  body: SkuAlignManualBindRequest,
  legacy: { detailUrl?: string | null }
): Promise<void> {
  try {
    await api.skuAlignV1ManualBind(variantId, {
      ...body,
      detailUrl: body.detailUrl ?? legacy.detailUrl ?? undefined,
    });
  } catch (err) {
    if (!isSkuAlignV1Unavailable(err)) throw err;
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

/** Prefer V1 block (unbind); fall back to legacy /match/sku/unbind only when V1 route is undeployed. */
export async function unbindWithFallback(
  shopName: string,
  variantId: string,
  thirdPlatformItemId: string
): Promise<void> {
  try {
    await api.skuAlignV1BlockVariant(variantId, { shopName, thirdPlatformItemId });
  } catch (err) {
    if (!isSkuAlignV1Unavailable(err)) throw err;
    await api.unbindSkuBinding(shopName, variantId);
  }
}
