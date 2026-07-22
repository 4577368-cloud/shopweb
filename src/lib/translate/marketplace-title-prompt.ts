import { normalizeTranslateLang } from "@/lib/translate/lang-codes";

const TARGET_LANG_LABELS: Record<string, string> = {
  en: "英语（美国亚马逊常用搜索习惯）",
  ja: "日语",
  ko: "韩语",
  ar: "阿拉伯语",
  es: "西班牙语",
  fr: "法语",
  de: "德语",
  ru: "俄语",
  pt: "葡萄牙语",
  it: "意大利语",
  th: "泰语",
  vi: "越南语",
  tr: "土耳其语",
  nl: "荷兰语",
  pl: "波兰语",
  hi: "印地语",
  zh: "简体中文",
  "zh-CN": "简体中文",
  "zh-TW": "繁体中文",
};

export function marketplaceTargetLangLabel(code: string): string {
  const norm = normalizeTranslateLang(code);
  return TARGET_LANG_LABELS[norm] ?? norm;
}

/** System prompt — cross-border listing title localization (Amazon-style). */
export function buildMarketplaceTitleSystemPrompt(targetLang: string): string {
  const label = marketplaceTargetLangLabel(targetLang);
  const norm = normalizeTranslateLang(targetLang);
  const isEnglish = norm === "en";

  return `你是一位精通跨境电商标题优化的资深运营专家，同时也是一位多语言翻译专家。

【任务】
将用户提供的商品原始标题，翻译为【${label}】，并进行专业化结构重组，输出符合亚马逊（Amazon）主流电商平台标准的商品标题。

【核心处理规则】

1. 【去噪过滤】
   必须删除以下类型的词汇（无论出现在标题何处）：
   - B端属性词：批发、wholesale、一件代发、drop shipping、dropshipping、工厂、factory、供货、供应商、supplier、OEM、ODM（除非是品牌名）
   - 地域指向词：跨境、欧美、美国、欧洲、出口、海外、国际、cross border、cross-border、export（除非是品牌名或不可分割的专有名词）
   - 营销夸大类虚词：爆款、热卖、畅销、顶级、优质、超级、特价、促销、bestseller、hot sale、top quality（保留功能性/特性类形容词，如 waterproof、lightweight）
   原则：标题只保留「产品本身」的描述信息，不保留「商业模式」和「销售对象」信息。

2. 【结构重组】（按以下优先级排序）
   核心品牌（如有）→ 核心关键词（主词）→ 主要材质/成分 → 核心功能/特性 → 适用场景/适用对象
   格式：各部分用空格或逗号自然分隔，不堆砌标点，不重复关键词。

3. 【风格要求】
   - 专业、简洁、可读性强
   ${
     isEnglish
       ? "- 英文标题：单词首字母大写；介词、连词、冠词（a/an/the/and/or/for/of/with/in/on）小写，符合美国 Amazon 标题惯例"
       : "- 非英文标题：遵循目标语言的电商 Listing 书写习惯与自然语序"
   }
   - 字符总数建议控制在 80–150 个字符（含空格）；硬上限 200 字符
   - 不包含促销信息、价格、数量、规格变体（尺寸/颜色等留给五点描述）

4. 【翻译要求】
   - 目标语言：${label}
   - 在目标语言中保持同样的结构逻辑，不直译无意义词或已删除的噪声词
   ${isEnglish ? "- 优先使用美国 Amazon 常见搜索词与买家用语，避免中式英语" : ""}

【输出格式】
只输出一行最终标题文本。不要引号、不要标签、不要解释、不要 Markdown。`;
}

export function buildMarketplaceTitleUserPrompt(originalTitle: string): string {
  return `【原始标题】
${originalTitle.trim()}`;
}

/** Lightweight safety net when LLM misses obvious B2B / regional noise. */
export function stripListingTitleNoise(title: string): string {
  let t = title.trim();
  if (!t) return t;

  const noisePatterns = [
    /\b(wholesale|dropshipping|drop\s*shipping|cross[\s-]?border|export)\b/gi,
    /\b(factory|supplier|oem|odm)\b/gi,
    /(批发|一件代发|供货|供应商|工厂|跨境|欧美|出口|海外|国际|爆款|热卖|畅销|顶级|优质|超级|特价|促销)/g,
    /\b(bestseller|hot\s*sale|top\s*quality)\b/gi,
  ];

  for (const p of noisePatterns) {
    t = t.replace(p, " ");
  }

  return t.replace(/\s+/g, " ").replace(/[,，]\s*[,，]/g, ",").trim();
}

export function normalizeListingTitleOutput(raw: string): string {
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "";

  return stripListingTitleNoise(
    line
      .replace(/^["'「『]|["'」』]$/g, "")
      .replace(/^(标题|输出|结果)[:：]\s*/i, "")
      .trim()
  );
}
