import { createTranslator } from "@/i18n/server";
import {
  PRODUCTS_INTENTS,
  type ProductsIntentId,
} from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import {
  PRODUCTS_CLASSIFY_RULES,
  PRODUCTS_INTENT_SET,
  PRODUCTS_SHORT_INPUT_MAX,
} from "@/lib/agents/products/classify-intent";
import { classifyHybrid } from "@/lib/agents/runtime";
import type { IntentClassifyResult } from "@/lib/agents/runtime/types";

/**
 * Hybrid classify for products — rules first, LLM enum-only fallback.
 */
export async function classifyProductsIntent(
  raw: string,
  locale?: string | null
): Promise<IntentClassifyResult<ProductsIntentId>> {
  const t = createTranslator(locale);
  return classifyHybrid(raw, {
    maxLength: PRODUCTS_SHORT_INPUT_MAX,
    rules: PRODUCTS_CLASSIFY_RULES,
    fallbackIntent: "summarize_shop_status",
    emptyClarify: t("api.errEmptyText"),
    missClarify: t("api.errNotRecognized"),
    intents: PRODUCTS_INTENTS,
    allowed: PRODUCTS_INTENT_SET,
    logPrefix: "[products-intent-classify]",
    defaultClarify: t("productsAgent.errTryAnother"),
    fallbackLocale: locale,
  });
}

/** Stable fingerprint of context fields that affect agent copy/actions. */
export function productsContextFingerprint(ctx: ProductsPageContext): string {
  return [
    ctx.phase,
    ctx.tab,
    ctx.shopFilter,
    ctx.authorized ? "1" : "0",
    ctx.shopName,
    ctx.analyzedCount,
    ctx.matchedCount,
    ctx.pendingCount,
    ctx.unboundCount,
    ctx.analysisReady ? "1" : "0",
    ctx.recommendedCategoryNames.join(","),
    ctx.filterSummary.join(","),
    ctx.pricing.configured ? "1" : "0",
    ctx.pricing.summaryLine,
    ctx.focusProductId ?? "",
    ctx.focusCandidateId ?? "",
    ctx.focusProduct?.bindState ?? "",
    ctx.focusCandidates.map((c) => c.productId).join(","),
    ctx.purchaseDisplay.exchangeRate,
    ctx.scanHandoff?.matchedCount ?? "",
  ].join("|");
}
