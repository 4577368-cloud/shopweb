"use client";

import { useEffect } from "react";
import { localeHtmlLang } from "@/i18n/config";
import { useLocale } from "@/i18n/LocaleProvider";

/** Keep <html lang> in sync when locale changes via client navigation. */
export function SyncHtmlLang() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = localeHtmlLang[locale];
  }, [locale]);
  return null;
}
