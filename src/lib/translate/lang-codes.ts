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
  ja: "ja",
  japanese: "ja",
  韩文: "ko",
  韩语: "ko",
  朝鲜语: "ko",
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

export function parseTargetLangFromText(text: string): string | undefined {
  const keys = Object.keys(TARGET_LANG_ALIASES).sort((a, b) => b.length - a.length);
  const langAlt = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const m = text.match(
    new RegExp(
      `(?:翻译成|译到|译为|翻成|成|用|到)(${langAlt})`,
      "i"
    )
  );
  if (m) {
    const key = m[1]!.toLowerCase();
    return TARGET_LANG_ALIASES[key] ?? TARGET_LANG_ALIASES[m[1]!];
  }
  return undefined;
}
