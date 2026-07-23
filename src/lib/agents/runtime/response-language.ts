const LANGUAGE_NAMES: Record<string, string> = {
  zh: "简体中文",
  en: "English",
  fr: "French",
  es: "Spanish",
};

/** Infer reply language from user text, falling back to UI locale then English. */
export function detectResponseLanguage(
  text: string,
  fallbackLocale?: string | null
): string {
  const trimmed = text.trim();
  if (/[\u4e00-\u9fff]/.test(trimmed)) return "zh";
  if (/[àâçéèêëïîôùûüÿœæ]/i.test(trimmed)) return "fr";
  if (/[áéíóúñ¿¡]/i.test(trimmed)) return "es";
  const locale = (fallbackLocale ?? "en").split("-")[0]?.toLowerCase();
  if (locale && LANGUAGE_NAMES[locale]) return locale;
  return "en";
}

export function responseLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? "English";
}

/** Instruction for command / intent classifiers. */
export function buildResponseLanguageRule(
  text: string,
  fallbackLocale?: string | null
): string {
  const lang = detectResponseLanguage(text, fallbackLocale);
  const name = responseLanguageName(lang);
  return `Respond in ${name}. Understand user input in any language (English, French, Spanish, Chinese, etc.). If you must return clarify text, write it in ${name}.`;
}

/** Instruction for copy enrichment (summary / explanation / nextSteps). */
export function buildCopyResponseLanguageRule(
  text: string,
  fallbackLocale?: string | null
): string {
  const lang = detectResponseLanguage(text, fallbackLocale);
  const name = responseLanguageName(lang);
  return `Write summary, explanation, and nextSteps in ${name}. Match the language of the user's message.`;
}
