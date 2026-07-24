import type { Locale } from "@/i18n/config";
import type { ImageSearchProduct } from "@/lib/types";

/** 1688 cross-border image-search / offer-detail language codes. */
export type Offer1688Country =
  | "en"
  | "fr"
  | "es"
  | "zh"
  | "ja"
  | "ko"
  | "ru"
  | "vi"
  | "pt";

/** English titles when locale-specific translation is unavailable. */
export const OFFER_TITLE_ENGLISH_COUNTRY: Offer1688Country = "en";

/** Map UI locale → 1688 country. Chinese UI omits country (native subject). */
export function mapLocaleTo1688Country(
  locale: Locale
): Offer1688Country | undefined {
  switch (locale) {
    case "zh":
      return undefined;
    case "en":
      return "en";
    case "fr":
      return "fr";
    case "es":
      return "es";
    default:
      return OFFER_TITLE_ENGLISH_COUNTRY;
  }
}

/** Country for GET offer-detail — always explicit so Chinese UI does not default to English. */
export function offerDetailCountryForLocale(locale: Locale): Offer1688Country {
  return mapLocaleTo1688Country(locale) ?? "zh";
}

/** Country for POST image-search — omit for Chinese UI. */
export function imageSearchCountryForLocale(
  locale: Locale
): Offer1688Country | undefined {
  return mapLocaleTo1688Country(locale);
}

export interface Resolve1688TitleInput {
  locale: Locale;
  title?: string | null;
  titleTrans?: string | null;
  subject?: string | null;
  subjectTrans?: string | null;
  englishTitle?: string | null;
}

/** Pick the best display title: locale match → English → Chinese. */
export function resolve1688ProductTitle(
  input: Resolve1688TitleInput
): string | null {
  const chinese =
    input.subject?.trim() || input.title?.trim() || null;
  const localized =
    input.titleTrans?.trim() || input.subjectTrans?.trim() || null;
  const english = input.englishTitle?.trim() || null;

  if (input.locale === "zh") {
    return chinese || localized || english;
  }

  if (localized) return localized;
  if (english) return english;
  return chinese;
}

export function resolveImageSearchDisplayTitle(
  candidate: Pick<
    ImageSearchProduct,
    "title" | "titleTrans" | "subject" | "subjectTrans" | "englishTitle"
  >,
  locale: Locale
): string | null {
  return resolve1688ProductTitle({
    locale,
    title: candidate.title,
    titleTrans: candidate.titleTrans,
    subject: candidate.subject,
    subjectTrans: candidate.subjectTrans,
    englishTitle: candidate.englishTitle,
  });
}
