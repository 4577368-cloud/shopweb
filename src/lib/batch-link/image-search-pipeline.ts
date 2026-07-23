import { api } from "@/lib/api";
import {
  OFFER_TITLE_ENGLISH_COUNTRY,
  imageSearchCountryForLocale,
  offerDetailCountryForLocale,
} from "@/lib/batch-link/1688-title-locale";
import type { Locale } from "@/i18n/config";
import { normalizeMatchScore } from "@/lib/agents/products/match-rank";
import {
  applyImageUrlMatchFloor,
  candidateStorageKey,
  rankCandidatesWithImageGate,
  resolveTopAutoBindScore,
} from "@/lib/batch-link/image-match";
import { isAlreadySourcedProduct } from "@/lib/batch-link/publish-source";
import {
  enrich1688CandidateWithCatalogIdentity,
  extractOfferIdFromUrl,
  isInternalGoodsId,
  isOfferId1688,
} from "@/lib/catalog-product-resolve";
import type {
  ImageBindingView,
  ImageSearchProduct,
  ImageSearchResult,
  ShopMirrorProduct,
} from "@/lib/types";

export interface ImageSearchPipelineResult {
  result: ImageSearchResult | null;
  /** Title / text similarity scores (LLM or API). */
  matchScores: Record<string, number>;
  /** Visual similarity scores after gate inputs. */
  imageScores: Record<string, number | null>;
  rankedItems: ImageSearchProduct[];
  topScore: number | null;
  error: string | null;
  /** True when the product already has a Tangbuy publish source — image search skipped. */
  skippedPublishSourced?: boolean;
}

export interface ImageSearchPipelineContext {
  binding?: ImageBindingView | null;
  locale?: Locale;
}

const PUBLISH_SOURCED_SKIP_MESSAGE =
  "该商品来自 Tangbuy 上架，已对应货源，无需图搜";

function imageSearchError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "图搜失败，请稍后重试";
}

function publishSourcedSkipResult(): ImageSearchPipelineResult {
  return {
    result: null,
    matchScores: {},
    imageScores: {},
    rankedItems: [],
    topScore: null,
    error: PUBLISH_SOURCED_SKIP_MESSAGE,
    skippedPublishSourced: true,
  };
}

async function scoreTitleCandidates(
  item: Pick<ShopMirrorProduct, "title" | "primaryImageUrl">,
  items: ImageSearchProduct[],
  initialScores: Record<string, number> = {}
): Promise<Record<string, number>> {
  let scores = { ...initialScores };
  for (const c of items) {
    const key = candidateStorageKey(c);
    const n = normalizeMatchScore(c.similarityScore);
    if (n != null && scores[key] == null) scores[key] = n;
  }

  const needLlm = items.filter((c) => scores[candidateStorageKey(c)] == null);
  if (needLlm.length === 0) return scores;

  try {
    const scoreRes = await fetch("/api/agents/products/match-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopTitle: item.title ?? "",
        shopImageUrl: item.primaryImageUrl ?? "",
        candidates: needLlm.map((c) => ({
          productId: candidateStorageKey(c),
          title: c.title,
          imageUrl: c.imageUrl,
        })),
      }),
    });
    if (scoreRes.ok) {
      const body = (await scoreRes.json()) as { scores?: Record<string, number> };
      const fromLlm = body.scores ?? {};
      for (const c of needLlm) {
        const key = candidateStorageKey(c);
        const raw = fromLlm[c.productId] ?? fromLlm[key];
        if (raw != null) scores[key] = raw;
      }
    }
  } catch {
    /* keep whatever we have */
  }

  return scores;
}

async function scoreImageCandidates(
  shopImageUrl: string | null | undefined,
  items: ImageSearchProduct[]
): Promise<Record<string, number | null>> {
  const scores: Record<string, number | null> = {};
  for (const c of items) {
    const key = candidateStorageKey(c);
    const apiScore = normalizeMatchScore(c.similarityScore);
    scores[key] = apiScore;
    applyImageUrlMatchFloor(shopImageUrl, c, scores);
  }

  const needRemote = items.filter((c) => scores[candidateStorageKey(c)] == null);
  if (needRemote.length === 0 || !shopImageUrl?.trim()) return scores;

  try {
    const res = await fetch("/api/batch-link/image-match-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopImageUrl,
        candidates: needRemote.map((c) => ({
          productId: candidateStorageKey(c),
          imageUrl: c.imageUrl,
          similarityScore: c.similarityScore,
        })),
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as {
        scores?: Record<string, number | null>;
      };
      for (const c of needRemote) {
        const key = candidateStorageKey(c);
        const raw = body.scores?.[key] ?? body.scores?.[c.productId];
        if (raw != null) scores[key] = raw;
        applyImageUrlMatchFloor(shopImageUrl, c, scores);
      }
    }
  } catch {
    for (const c of needRemote) {
      applyImageUrlMatchFloor(shopImageUrl, c, scores);
    }
  }

  return scores;
}

function resolveOfferIdForDetail(
  candidate: ImageSearchProduct
): string | null {
  const offerId =
    candidate.offerId1688?.trim() ||
    (isOfferId1688(candidate.productId) ? candidate.productId : null) ||
    extractOfferIdFromUrl(candidate.detailUrl);
  if (!offerId || isInternalGoodsId(offerId)) return null;
  return offerId;
}

/** Fill titleTrans / englishTitle from offer-detail when image-search omits them. */
async function enrichCandidateDisplayTitles(
  items: ImageSearchProduct[],
  locale: Locale | undefined,
  maxEnrich = 6
): Promise<ImageSearchProduct[]> {
  if (!locale || locale === "zh") return items;

  return Promise.all(
    items.map(async (item, idx) => {
      if (idx >= maxEnrich) return item;

      const hasLocaleTitle = Boolean(
        item.titleTrans?.trim() || item.subjectTrans?.trim()
      );
      const hasEnglish = Boolean(item.englishTitle?.trim());
      if (hasLocaleTitle && (locale === "en" || hasEnglish)) return item;

      const offerId = resolveOfferIdForDetail(item);
      if (!offerId) return item;

      const localeCountry = offerDetailCountryForLocale(locale);
      const patches: Partial<ImageSearchProduct> = {};

      if (!hasLocaleTitle) {
        try {
          const detail = await api.getOfferDetail(offerId, localeCountry);
          patches.titleTrans =
            detail.subjectTrans?.trim() || detail.subject?.trim() || null;
        } catch {
          /* keep original title */
        }
      }

      if (locale !== "en" && !hasEnglish) {
        try {
          const detail = await api.getOfferDetail(
            offerId,
            OFFER_TITLE_ENGLISH_COUNTRY
          );
          patches.englishTitle =
            detail.subjectTrans?.trim() || detail.subject?.trim() || null;
        } catch {
          /* optional fallback */
        }
      } else if (locale === "en" && patches.titleTrans && !hasEnglish) {
        patches.englishTitle = patches.titleTrans;
      }

      return Object.keys(patches).length > 0 ? { ...item, ...patches } : item;
    })
  );
}

/**
 * Shared image-search pipeline:
 * 1) 1688 图搜（后端 image-search API）
 * 2) Title score (LLM auxiliary) + image score (API / URL / pHash / vision)
 * 3) Rank with image hard gate + image-first ordering
 *
 * Tangbuy 商城上架商品（已有 1:1 货源对应）跳过图搜。
 */
export async function runImageSearchPipeline(
  shopName: string,
  item: Pick<ShopMirrorProduct, "thirdPlatformItemId" | "title" | "primaryImageUrl">,
  limit = 5,
  context?: ImageSearchPipelineContext
): Promise<ImageSearchPipelineResult> {
  if (
    isAlreadySourcedProduct(
      context?.binding,
      shopName,
      item.thirdPlatformItemId
    )
  ) {
    return publishSourcedSkipResult();
  }

  try {
    const country = context?.locale
      ? imageSearchCountryForLocale(context.locale)
      : undefined;
    const res = await api.imageSearch(
      shopName,
      item.thirdPlatformItemId,
      limit,
      country ? { country } : undefined
    );

    const enriched1688 = await Promise.all(
      res.items.map((c) =>
        enrich1688CandidateWithCatalogIdentity(c, item.title, shopName)
      )
    );
    const localizedItems = await enrichCandidateDisplayTitles(
      enriched1688,
      context?.locale,
      limit
    );

    const titleScores = await scoreTitleCandidates(item, localizedItems);
    const imageScores = await scoreImageCandidates(
      item.primaryImageUrl,
      localizedItems
    );
    const ranked = rankCandidatesWithImageGate(
      localizedItems,
      titleScores,
      imageScores
    );
    const topScore = resolveTopAutoBindScore(ranked, titleScores, imageScores);

    return {
      result: { ...res, items: ranked },
      matchScores: titleScores,
      imageScores,
      rankedItems: ranked,
      topScore,
      error: null,
    };
  } catch (err) {
    return {
      result: null,
      matchScores: {},
      imageScores: {},
      rankedItems: [],
      topScore: null,
      error: imageSearchError(err),
    };
  }
}
