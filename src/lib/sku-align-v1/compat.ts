import { api, ApiError } from "@/lib/api";
import type {
  SkuAlignConfirmResult,
  SkuAlignConfirmSuggestionsRequest,
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
