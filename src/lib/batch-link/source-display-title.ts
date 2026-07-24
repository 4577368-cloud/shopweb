import type { Locale } from "@/i18n/config";
import { resolve1688ProductTitle } from "@/lib/batch-link/1688-title-locale";
import type { ImageBindingView, ImageSearchProduct } from "@/lib/types";

/** SKU matrix labels like "Black / S" — not a product headline on the card. */
export function isLikelySkuSpecLabel(
  title: string | null | undefined
): boolean {
  const t = title?.trim();
  if (!t) return false;
  if (t.length > 72) return false;
  return /^[^/]{1,36}\s*\/\s*[^/]{1,36}$/.test(t);
}

export function snapTitleNeedsItemGetFallback(
  snapTitle: string | null | undefined
): boolean {
  return !snapTitle?.trim() || isLikelySkuSpecLabel(snapTitle);
}

export function mergeConfirmedBindingView(
  view: ImageBindingView,
  candidate: Pick<
    ImageSearchProduct,
    "title" | "titleTrans" | "subject" | "subjectTrans" | "englishTitle" | "imageUrl" | "price"
  >,
  locale: Locale = "zh"
): ImageBindingView {
  const productTitle = resolve1688ProductTitle({
    locale,
    title: candidate.title,
    titleTrans: candidate.titleTrans,
    subject: candidate.subject,
    subjectTrans: candidate.subjectTrans,
    englishTitle: candidate.englishTitle,
  });
  const viewTitle = view.offerTitle?.trim() || null;
  return {
    ...view,
    offerImageUrl: view.offerImageUrl ?? candidate.imageUrl ?? null,
    offerPrice: view.offerPrice ?? candidate.price ?? null,
    offerTitle:
      productTitle ||
      (viewTitle && !isLikelySkuSpecLabel(viewTitle) ? viewTitle : null) ||
      viewTitle ||
      null,
  };
}

export function resolveBoundSourceDisplayTitle(input: {
  locale?: Locale;
  snapTitle?: string | null;
  itemGetTitle?: string | null;
  offerSubjectTrans?: string | null;
  offerSubject?: string | null;
  candidateTitle?: string | null;
  candidateTitleTrans?: string | null;
  candidateEnglishTitle?: string | null;
}): string | null {
  const locale = input.locale ?? "zh";
  const {
    snapTitle,
    itemGetTitle,
    offerSubjectTrans,
    offerSubject,
    candidateTitle,
    candidateTitleTrans,
    candidateEnglishTitle,
  } = input;

  if (locale !== "zh") {
    const localized = resolve1688ProductTitle({
      locale,
      title: candidateTitle,
      titleTrans: candidateTitleTrans,
      subject: offerSubject,
      subjectTrans: offerSubjectTrans,
      englishTitle: candidateEnglishTitle,
    });
    if (localized) return localized;

    const fromItemGet = itemGetTitle?.trim() || null;
    if (fromItemGet) return fromItemGet;

    const snap = snapTitle?.trim() || null;
    if (snap && !isLikelySkuSpecLabel(snap)) return snap;

    return (
      candidateTitle?.trim() ||
      offerSubject?.trim() ||
      snap ||
      null
    );
  }

  const fromCandidate = candidateTitle?.trim() || null;
  if (fromCandidate) return fromCandidate;

  const snap = snapTitle?.trim() || null;
  if (snap && !isLikelySkuSpecLabel(snap)) return snap;

  const fromItemGet = itemGetTitle?.trim() || null;
  if (fromItemGet) return fromItemGet;

  const fromOffer =
    offerSubject?.trim() || offerSubjectTrans?.trim() || null;
  if (fromOffer) return fromOffer;

  return snap;
}
