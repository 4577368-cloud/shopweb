import { api } from "@/lib/api";
import { extractOfferIdFromUrl, isOfferId1688 } from "@/lib/catalog-product-resolve";
import {
  DEFAULT_1688_DISPLAY_MULTIPLIER,
  type SourcingSearchHit,
} from "@/lib/sourcing/types";

export interface Offer1688SearchItem {
  offerId?: string | null;
  subject?: string | null;
  subjectTrans?: string | null;
  imageUrl?: string | null;
  price?: string | null;
  consignPrice?: string | null;
  promotionPrice?: string | null;
  companyName?: string | null;
  detailUrl?: string | null;
}

export interface Offer1688SearchResult {
  items: Offer1688SearchItem[];
  totalRecords?: number | null;
}

function parseCnyPrice(raw?: string | null): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickTitle(item: Offer1688SearchItem): string {
  return (
    item.subjectTrans?.trim() ||
    item.subject?.trim() ||
    item.offerId?.trim() ||
    "Source offer"
  );
}

function pickPrice(item: Offer1688SearchItem): number | null {
  return (
    parseCnyPrice(item.promotionPrice) ??
    parseCnyPrice(item.consignPrice) ??
    parseCnyPrice(item.price)
  );
}

/** Keyword-assisted 1688 image search (requires a public seed image). Keyword may be empty. */
export async function search1688OffersByKeyword(
  keyword: string,
  opts?: {
    seedImageUrl?: string | null;
    country?: string;
    page?: number;
    size?: number;
  }
): Promise<SourcingSearchHit[]> {
  const kw = keyword.trim();
  const seed = opts?.seedImageUrl?.trim();
  if (!seed) {
    if (typeof console !== "undefined") {
      console.warn("[sourcing/1688] keyword search skipped — no seed image");
    }
    return [];
  }

  const res = await api.search1688Offers({
    keyword: kw,
    imageUrl: seed,
    country: opts?.country,
    page: opts?.page ?? 1,
    size: opts?.size ?? 12,
  });
  const items = res.items ?? [];
  const out: SourcingSearchHit[] = [];

  for (const item of items) {
    const offerId =
      item.offerId?.trim() ||
      extractOfferIdFromUrl(item.detailUrl) ||
      null;
    if (!offerId || !isOfferId1688(offerId)) continue;
    out.push({
      hitId: `1688:${offerId}`,
      source: "1688",
      title: pickTitle(item),
      imageUrl: item.imageUrl,
      costCny: pickPrice(item),
      currency: "CNY",
      supplierShop: item.companyName,
      offerId1688: offerId,
      detailUrl1688: item.detailUrl,
      displayMultiplier: DEFAULT_1688_DISPLAY_MULTIPLIER,
    });
  }
  if (items.length > 0 && out.length === 0 && typeof console !== "undefined") {
    console.warn("[sourcing/1688] gateway returned items but none had a usable offerId", {
      raw: items.length,
      sample: items.slice(0, 2).map((i) => ({
        offerId: i.offerId,
        detailUrl: i.detailUrl,
      })),
    });
  }
  return out;
}
