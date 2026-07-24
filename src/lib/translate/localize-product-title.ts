import {
  chatCompletionJson,
  LlmUnavailableError,
} from "@/lib/agents/llm/openai-compatible";
import {
  detectTranslateSourceLang,
  normalizeTranslateLang,
} from "@/lib/translate/lang-codes";
import {
  buildMarketplaceTitleSystemPrompt,
  buildMarketplaceTitleUserPrompt,
  marketplaceTargetLangLabel,
  normalizeListingTitleOutput,
  stripListingTitleNoise,
} from "@/lib/translate/marketplace-title-prompt";

export type TitleLocalizationStyle = "amazon" | "literal";

export interface LocalizeProductTitleInput {
  text: string;
  targetLang: string;
  style?: TitleLocalizationStyle;
  sourceLang?: string;
}

export interface LocalizeProductTitleResult {
  success: boolean;
  text?: string;
  sourceLang?: string;
  targetLang?: string;
  engine?: "llm" | "mymemory";
  error?: string;
  unchanged?: boolean;
}

function normalizeComparable(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Heuristic: result should differ from source and look localized for CJK/Arabic targets. */
export function isTitleLocalizationValid(
  original: string,
  result: string,
  targetLang: string
): boolean {
  const a = normalizeComparable(original);
  const b = normalizeComparable(result);
  if (!b || b.length < 3) return false;
  if (a === b) return false;

  const tgt = normalizeTranslateLang(targetLang);
  if (tgt === "ja" && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(result)) return false;
  if (tgt === "ko" && !/[\uac00-\ud7af]/.test(result)) return false;
  if (tgt === "ar" && !/[\u0600-\u06ff]/.test(result)) return false;
  if (tgt === "zh-CN" || tgt === "zh-TW") {
    if (!/[\u4e00-\u9fff]/.test(result)) return false;
  }

  if (/INVALID LANGUAGE PAIR|QUERY LENGTH LIMIT|MYMEMORY WARNING/i.test(result)) {
    return false;
  }

  if (result.length > 200) return false;

  return true;
}

function buildLiteralSystemPrompt(targetLang: string): string {
  const label = marketplaceTargetLangLabel(targetLang);
  return `Translate the product title accurately into ${label}.
Preserve meaning; keep it concise and natural for e-commerce.
Output ONE line only — no quotes or explanation.`;
}

function parseLiteralTitleOutput(raw: string): string {
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "";
  return line.replace(/^["'「『]|["'」』]$/g, "").trim();
}

async function localizeWithLlm(
  input: LocalizeProductTitleInput,
  targetNorm: string
): Promise<string | null> {
  const style = input.style ?? "amazon";
  const system =
    style === "amazon"
      ? buildMarketplaceTitleSystemPrompt(targetNorm)
      : buildLiteralSystemPrompt(targetNorm);

  const raw = await chatCompletionJson({
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content:
          style === "amazon"
            ? buildMarketplaceTitleUserPrompt(input.text)
            : `Original title:\n${input.text.trim()}`,
      },
    ],
    temperature: 0.3,
    timeoutMs: 30_000,
  });

  const normalized =
    style === "amazon"
      ? normalizeListingTitleOutput(raw)
      : parseLiteralTitleOutput(raw);
  return normalized || null;
}

async function localizeWithMyMemory(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text
  )}&langpair=${encodeURIComponent(sourceLang)}|${encodeURIComponent(targetLang)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "ShopifySourcingAgent/1.0" },
  });
  if (!res.ok) {
    throw new Error(`翻译服务请求失败: ${res.status}`);
  }

  const data = await res.json();
  const translatedText = data?.responseData?.translatedText;
  if (!translatedText || typeof translatedText !== "string") {
    throw new Error("翻译结果为空");
  }
  if (/INVALID LANGUAGE PAIR SPECIFIED/i.test(translatedText)) {
    throw new Error(`不支持的语言组合：${sourceLang} → ${targetLang}`);
  }
  return translatedText.trim();
}

export async function localizeProductTitle(
  input: LocalizeProductTitleInput
): Promise<LocalizeProductTitleResult> {
  const text = input.text?.trim() ?? "";
  if (!text) {
    return { success: false, error: "文本不能为空" };
  }

  const targetLang = normalizeTranslateLang(input.targetLang || "en");
  const sourceLang = normalizeTranslateLang(
    input.sourceLang ?? detectTranslateSourceLang(text)
  );

  if (sourceLang === targetLang) {
    return {
      success: true,
      text,
      unchanged: true,
      sourceLang,
      targetLang,
    };
  }

  const style = input.style ?? "amazon";

  // Prefer LLM for marketplace-style titles (Amazon structure, not literal).
  if (style === "amazon") {
    try {
      const llmText = await localizeWithLlm(input, targetLang);
      if (llmText && isTitleLocalizationValid(text, llmText, targetLang)) {
        return {
          success: true,
          text: llmText,
          sourceLang,
          targetLang,
          engine: "llm",
        };
      }
    } catch (err) {
      if (!(err instanceof LlmUnavailableError)) {
        // fall through to MyMemory
      }
    }
  }

  try {
    const memTextRaw = await localizeWithMyMemory(text, sourceLang, targetLang);
    const memText =
      style === "amazon" ? stripListingTitleNoise(memTextRaw) : memTextRaw;
    if (!isTitleLocalizationValid(text, memText, targetLang)) {
      if (normalizeComparable(text) === normalizeComparable(memText)) {
        return {
          success: true,
          text,
          unchanged: true,
          sourceLang,
          targetLang,
          engine: "mymemory",
        };
      }
      return {
        success: false,
        error:
          style === "amazon"
            ? "标题未成功本土化（结果与原文相同或不符合目标语言）。可配置 LLM_MODEL_* 以启用 Amazon 风格改写。"
            : "翻译结果无效（与原文相同或语言不匹配）",
        unchanged: true,
        sourceLang,
        targetLang,
        engine: "mymemory",
      };
    }
    return {
      success: true,
      text: memText,
      sourceLang,
      targetLang,
      engine: "mymemory",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "翻译失败",
      sourceLang,
      targetLang,
    };
  }
}

export function detectTitleLocalizationStyle(
  text: string
): TitleLocalizationStyle {
  if (/直译|literal|不要改写|逐字/i.test(text)) return "literal";
  return "amazon";
}
