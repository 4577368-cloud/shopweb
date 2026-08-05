import type { ChatMessage } from "@/lib/agents/llm/openai-compatible";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";
import { createTranslator } from "@/i18n/server";
import {
  buildCommandClassifySystemPrompt,
  classifyProductCommandByRules,
  matchProductCopyCommand,
  parseProductCommandDraft,
  type CommandClassifyContext,
} from "@/lib/agents/products/classify-command";
import { parseListingPriceAdjust } from "@/lib/agents/products/listing-price-adjust";
import { refersToCurrentProductForCopy } from "@/lib/agents/products/resolve-product-target";
import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import type {
  ProductCommandClassifyResult,
  ProductCommandDraft,
} from "@/lib/agents/products/command-schema";
import { parseTargetLangFromText } from "@/lib/translate/lang-codes";
import { buildResponseLanguageRule } from "@/lib/agents/runtime/response-language";
import { canonicalizeCommandToZh } from "@/lib/agents/shared/canonicalize-command-text";

/** Prefer first successful parse across original + Chinese-canonical forms. */
function firstMatch<T>(
  texts: string[],
  parse: (t: string) => T | null | undefined
): T | null {
  for (const t of texts) {
    const v = parse(t);
    if (v != null) return v;
  }
  return null;
}

function looksLikeBatch(text: string): boolean {
  return /(所有|全部|批量|每个|所有商品|全部商品|批量商品|一次性|统一|统统|全部改成|全部换成|给所有|都给|每个商品|都改|统一改|都改掉|全部改|本页|当前页|这一页|关联商品|已关联|上架商品|已上架|最近新增|新入库|前\s*\d+|前[十百]|top\s*\d+|\ball\b|\bevery\b|\bbatch\b|\beach\b|this\s*page|current\s*page)/i.test(
    text
  );
}

function coerceProductCommandDraft(
  texts: string[],
  draft: ProductCommandDraft
): ProductCommandDraft {
  let next = draft;
  const batch = texts.some(looksLikeBatch);

  if (batch && next.intent === "update_product_copy") {
    next = {
      ...next,
      intent: "batch_update_product_copy",
      targetScope: "all",
      params: {
        ...next.params,
        batchFilter:
          next.params.batchFilter && next.params.batchFilter !== "all"
            ? next.params.batchFilter
            : "page",
      },
    };
  }

  if (
    next.intent === "batch_update_product_copy" ||
    next.intent === "batch_update_listing_price"
  ) {
    const filter = next.params.batchFilter;
    if (!filter || filter === "all") {
      next = {
        ...next,
        params: { ...next.params, batchFilter: "page" },
      };
    }
  }

  if (
    (next.intent === "update_product_copy" ||
      next.intent === "batch_update_product_copy") &&
    (next.params.copyAction ?? "translate") === "translate" &&
    !next.params.copyTargetLang
  ) {
    const lang = firstMatch(texts, parseTargetLangFromText);
    if (lang) {
      next = { ...next, params: { ...next.params, copyTargetLang: lang } };
    }
  }

  if (
    next.intent === "update_product_copy" &&
    !next.params.productTitleHint &&
    texts.some((t) => refersToCurrentProductForCopy(t))
  ) {
    next = { ...next, targetScope: "current" };
  }

  // Relative 「加1」may appear in original EN or canonical ZH.
  const adjust = firstMatch(texts, parseListingPriceAdjust);
  if (adjust) {
    if (next.intent === "update_listing_price") {
      next = {
        ...next,
        params: {
          ...next.params,
          price: undefined,
          priceDelta: adjust.delta,
          currency: adjust.currency ?? next.params.currency,
        },
      };
    } else if (next.intent === "batch_update_listing_price") {
      next = {
        ...next,
        params: {
          ...next.params,
          batchPriceFixed: undefined,
          batchPriceDelta: adjust.delta,
        },
      };
    }
  }

  return next;
}

/**
 * Hybrid command classify — canonicalize non-Chinese → ZH, then rules + LLM.
 * Server-only when LLM / canonicalize runs.
 */
export async function classifyProductCommand(
  raw: string,
  ctx?: CommandClassifyContext | null,
  locale?: string | null
): Promise<ProductCommandClassifyResult> {
  const t = createTranslator(locale);
  const text = raw.trim().slice(0, PRODUCTS_SHORT_INPUT_MAX);

  const { original, canonicalZh, translated } =
    await canonicalizeCommandToZh(text);
  const classifyText = canonicalZh;
  const texts = translated
    ? [original, canonicalZh]
    : [original];

  const copyRule = matchProductCopyCommand(classifyText);
  if (copyRule) {
    return {
      confidence: "high",
      source: "rules",
      draft: coerceProductCommandDraft(texts, copyRule),
    };
  }

  try {
    const content = await chatCompletionJson({
      messages: [
        {
          role: "system",
          content: buildCommandClassifySystemPrompt(
            ctx,
            buildResponseLanguageRule(original, locale)
          ),
        },
        {
          role: "user",
          content: JSON.stringify(
            translated
              ? {
                  userText: original,
                  canonicalZh: classifyText,
                  note: "canonicalZh is a Simplified Chinese rewrite of userText for intent matching; prefer it when mapping intents, but keep clarify replies in the user language.",
                }
              : { userText: original }
          ),
        },
      ] satisfies ChatMessage[],
      temperature: 0,
      timeoutMs: 8_000,
    });
    const draft = parseProductCommandDraft(content);
    if (draft) {
      return {
        confidence: "high",
        source: "llm",
        draft: coerceProductCommandDraft(texts, draft),
      };
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[products-command-classify]",
        err instanceof Error ? err.message : err
      );
    }
  }

  const byRules = classifyProductCommandByRules(classifyText);
  if (byRules.confidence === "high" && byRules.draft) {
    return {
      ...byRules,
      draft: coerceProductCommandDraft(texts, byRules.draft),
    };
  }

  // Last resort: rules on the original (EN patches / mixed scripts).
  if (translated) {
    const onOriginal = classifyProductCommandByRules(original);
    if (onOriginal.confidence === "high" && onOriginal.draft) {
      return {
        ...onOriginal,
        draft: coerceProductCommandDraft(texts, onOriginal.draft),
      };
    }
  }

  return {
    confidence: "none",
    source: "default",
    clarify: byRules.clarify ?? t("api.errNotRecognized"),
  };
}
