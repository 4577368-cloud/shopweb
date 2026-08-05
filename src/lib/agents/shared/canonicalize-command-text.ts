import type { ChatMessage } from "@/lib/agents/llm/openai-compatible";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";

/**
 * Whether free-form operator text should be rewritten to Simplified Chinese
 * before Chinese-centric rule / LLM classify.
 *
 * Already-Chinese input stays as-is. Latin / Cyrillic / Arabic / JA / KO etc. → canonicalize.
 */
export function commandTextNeedsZhCanonicalize(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[\u4e00-\u9fff]/.test(t)) return false;
  return /[A-Za-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u3040-\u30ff\uac00-\ud7af]/.test(
    t
  );
}

function cleanCanonicalOutput(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  // Strip accidental fences / quotes / JSON wrappers
  s = s.replace(/^```(?:\w+)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (s.startsWith("{") && s.includes("canonical")) {
    try {
      const obj = JSON.parse(s) as { canonicalZh?: unknown; text?: unknown };
      const v = obj.canonicalZh ?? obj.text;
      if (typeof v === "string" && v.trim()) return v.trim();
    } catch {
      /* fall through */
    }
  }
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  // First line only — models sometimes add a gloss
  const line = s.split(/\n/)[0]?.trim() ?? "";
  return line.slice(0, 200);
}

const CANONICALIZE_SYSTEM = `你是跨境电商（Shopify 选品/关联）运营指令规范化器。
把用户任意语言的操作指令改写成一行简体中文短指令，供后续中文规则引擎识别。

硬性要求：
1. 只输出一行中文指令：不要解释、不要引号、不要 Markdown、不要 JSON。
2. 保留数字、货币符号/代码、SKU、以及拉丁文商品原名（专有名词可原样保留）。
3. 目标语言写成中文名：English/EN→英文，Japanese→日语，Korean→韩语，French→法语，Spanish→西语，Chinese→中文，Russian→俄语，German→德语 等。
4. 指代当前选中商品用「这个商品」；本页批量用「本页」；全部/每个用「所有」；未匹配/未关联用「未匹配」；待确认用「待确认」。
5. 相对改价：「价格加1」「售价减2」。绝对改价：「售价改成 9.9 美元」。
6. 翻译标题：「把这个商品标题翻译成英文」。改写/优化对应「改写」「优化」。
7. 筛选：「只看待确认」「只看未匹配」「看全部」「看新入库」。
8. 草稿/下架：「把这个商品放到草稿」「下架这个商品」。
9. 重搜：「给这个商品再找候选」或「给未匹配商品再找候选」。

示例：
- Translate this product title to English → 把这个商品标题翻译成英文
- Title → EN → 把这个商品标题翻译成英文
- Set this product listing price to 9.9 USD → 把这个商品售价改成 9.9 美元
- Add 1 to the price → 把这个商品价格加1
- Show pending only → 只看待确认
- Move this product to draft → 把这个商品放到草稿
- Find more candidates for unmatched products → 给未匹配商品再找候选
- Traduire le titre de ce produit en anglais → 把这个商品标题翻译成英文
- Pon el precio de este producto a 9.9 → 把这个商品售价改成 9.9
- Traduce el título al inglés → 把这个商品标题翻译成英文`;

export type CanonicalCommandText = {
  original: string;
  /** Text to feed Chinese rules / classify prompts */
  canonicalZh: string;
  translated: boolean;
};

/**
 * Normalize operator NL to Simplified Chinese when needed.
 * On LLM failure, returns the original text unchanged (caller still tries multilingual LLM).
 */
export async function canonicalizeCommandToZh(
  text: string,
  opts?: { timeoutMs?: number }
): Promise<CanonicalCommandText> {
  const original = text.trim();
  if (!commandTextNeedsZhCanonicalize(original)) {
    return { original, canonicalZh: original, translated: false };
  }

  try {
    const content = await chatCompletionJson({
      messages: [
        { role: "system", content: CANONICALIZE_SYSTEM },
        { role: "user", content: original },
      ] satisfies ChatMessage[],
      temperature: 0,
      timeoutMs: opts?.timeoutMs ?? 5_000,
    });
    const zh = cleanCanonicalOutput(content);
    if (!zh || zh === original) {
      return { original, canonicalZh: original, translated: false };
    }
    return { original, canonicalZh: zh, translated: true };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[canonicalize-command]",
        err instanceof Error ? err.message : err
      );
    }
    return { original, canonicalZh: original, translated: false };
  }
}
