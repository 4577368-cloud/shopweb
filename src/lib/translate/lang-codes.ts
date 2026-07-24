/** Tangbuy / MyMemory-compatible language codes and aliases for user commands. */
export const TARGET_LANG_ALIASES: Record<string, string> = {
  英文: "en",
  英语: "en",
  美语: "en",
  美式: "en",
  en: "en",
  english: "en",
  中文: "zh",
  汉语: "zh",
  普通话: "zh",
  简体: "zh",
  繁体: "zh-TW",
  zh: "zh",
  chinese: "zh",
  俄文: "ru",
  俄语: "ru",
  ru: "ru",
  russian: "ru",
  日文: "ja",
  日语: "ja",
  日本语: "ja",
  日本語: "ja",
  ja: "ja",
  japanese: "ja",
  韩文: "ko",
  韩语: "ko",
  朝鲜语: "ko",
  中文简体: "zh",
  简体中文: "zh",
  简体字: "zh",
  ko: "ko",
  korean: "ko",
  阿拉伯文: "ar",
  阿拉伯语: "ar",
  阿语: "ar",
  ar: "ar",
  arabic: "ar",
  法文: "fr",
  法语: "fr",
  fr: "fr",
  french: "fr",
  德文: "de",
  德语: "de",
  de: "de",
  german: "de",
  西班牙文: "es",
  西班牙语: "es",
  西语: "es",
  es: "es",
  spanish: "es",
  葡萄牙文: "pt",
  葡萄牙语: "pt",
  葡语: "pt",
  pt: "pt",
  portuguese: "pt",
  意大利文: "it",
  意大利语: "it",
  it: "it",
  italian: "it",
  泰文: "th",
  泰语: "th",
  th: "th",
  thai: "th",
  越南文: "vi",
  越南语: "vi",
  vi: "vi",
  vietnamese: "vi",
  土耳其文: "tr",
  土耳其语: "tr",
  tr: "tr",
  turkish: "tr",
  荷兰文: "nl",
  荷兰语: "nl",
  nl: "nl",
  dutch: "nl",
  波兰文: "pl",
  波兰语: "pl",
  pl: "pl",
  polish: "pl",
  印地文: "hi",
  印地语: "hi",
  hi: "hi",
  hindi: "hi",
};

/** Normalize short codes to MyMemory langpair tokens. */
export function normalizeTranslateLang(code: string | undefined | null): string {
  const raw = code?.trim().toLowerCase() ?? "";
  if (!raw) return "en";
  if (raw === "zh" || raw === "zh-cn" || raw === "cn") return "zh-CN";
  if (raw === "zh-tw" || raw === "tw") return "zh-TW";
  return raw;
}

export function detectTranslateSourceLang(text: string): string {
  if (/[\u4e00-\u9fff]/.test(text)) return "zh-CN";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[àâäéèêëïîôùûüçœæ]/i.test(text)) return "fr";
  if (/[ñáéíóúü¿¡]/i.test(text)) return "es";
  if (/[äöüß]/i.test(text)) return "de";
  return "en";
}

function resolveLangAlias(raw: string): string | undefined {
  const key = raw.trim().toLowerCase();
  return TARGET_LANG_ALIASES[key] ?? TARGET_LANG_ALIASES[raw.trim()];
}

export function parseTargetLangFromText(text: string): string | undefined {
  const keys = Object.keys(TARGET_LANG_ALIASES).sort((a, b) => b.length - a.length);
  const langAlt = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const toLangVerb =
    "翻译成|翻译为|译到|译为|译成|翻成|修改成|修改为|改为|改成|调整为|调整成|调整至|成为|成|为|到|用";
  const patterns: RegExp[] = [
    new RegExp(`(?:${toLangVerb})\\s*(${langAlt})`, "i"),
    new RegExp(`(?:成为|成|为|到)\\s*(${langAlt})`, "i"),
    new RegExp(
      `(?:标题|商品标题|商品|文案).*?(?:${toLangVerb})\\s*(${langAlt})`,
      "i"
    ),
    new RegExp(
      `翻译\\s*(?:这个|该|当前|此)?\\s*商品.*?(?:${toLangVerb})\\s*(${langAlt})`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const code = resolveLangAlias(m[1]);
    if (code) return code;
  }
  return undefined;
}
