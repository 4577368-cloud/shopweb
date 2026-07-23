// i18n configuration — zero-dependency, URL-prefix based (always-prefix).
// Locales: en (default) | fr | es | zh. Every route carries a prefix.

export const locales = ["en", "fr", "es", "zh"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  zh: "中文",
};

/** Compact country / region code shown in the language switcher. */
export const localeCodes: Record<Locale, string> = {
  en: "EN",
  fr: "FR",
  es: "ES",
  zh: "ZH",
};

// Short tag used for <html lang> and Accept-Language matching.
export const localeHtmlLang: Record<Locale, string> = {
  en: "en",
  fr: "fr",
  es: "es",
  zh: "zh-CN",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : defaultLocale;
}
