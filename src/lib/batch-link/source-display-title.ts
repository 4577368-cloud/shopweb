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
  candidate: Pick<ImageSearchProduct, "title" | "imageUrl" | "price">
): ImageBindingView {
  const productTitle = candidate.title?.trim() || null;
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
  snapTitle?: string | null;
  itemGetTitle?: string | null;
  offerSubjectTrans?: string | null;
  offerSubject?: string | null;
  candidateTitle?: string | null;
}): string | null {
  const {
    snapTitle,
    itemGetTitle,
    offerSubjectTrans,
    offerSubject,
    candidateTitle,
  } = input;

  const fromCandidate = candidateTitle?.trim() || null;
  if (fromCandidate) return fromCandidate;

  const snap = snapTitle?.trim() || null;
  if (snap && !isLikelySkuSpecLabel(snap)) return snap;

  const fromItemGet = itemGetTitle?.trim() || null;
  if (fromItemGet) return fromItemGet;

  const fromOffer =
    offerSubjectTrans?.trim() || offerSubject?.trim() || null;
  if (fromOffer) return fromOffer;

  return snap;
}
