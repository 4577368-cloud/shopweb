import type { ProductsIntentId } from "@/lib/agents/products/intents";
import { PRODUCTS_INTENTS } from "@/lib/agents/products/intents";
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
  raw: string
): Promise<IntentClassifyResult<ProductsIntentId>> {
  return classifyHybrid(raw, {
    maxLength: PRODUCTS_SHORT_INPUT_MAX,
    rules: PRODUCTS_CLASSIFY_RULES,
    fallbackIntent: "summarize_shop_status",
    emptyClarify: "请输入简短问题，或直接点击上方任务。",
    missClarify:
      "暂时无法匹配到任务。可试试：当前状态 / 为什么要配定价 / 看待确认 / 去发现新品，或点击上方芯片。",
    intents: PRODUCTS_INTENTS,
    allowed: PRODUCTS_INTENT_SET,
    logPrefix: "[products-intent-classify]",
    defaultClarify:
      "暂时无法理解该问题。请点击上方任务芯片，或换个更短的说法（如「看待确认」「去发现新品」）。",
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
