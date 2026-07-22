import {
  buildTangbuyProductUrl,
  fetchItemDetail,
  isMallGatewayConfigured,
  type ItemGetProduct,
} from "@/lib/tangbuy-mall-gateway";

export interface VariantMeasureFields {
  weightG?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  volumeCm3?: number;
  measureSource?: string;
}

/** Parse "45*45（不含枕芯）" / "30x20x10" style size text into cm dimensions. */
export function parseSizeFromAttributeText(
  text: string | null | undefined
): Pick<VariantMeasureFields, "lengthCm" | "widthCm" | "heightCm"> {
  const raw = text?.trim();
  if (!raw) return {};

  const triple = raw.match(
    /(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/
  );
  if (triple) {
    return {
      lengthCm: Number(triple[1]),
      widthCm: Number(triple[2]),
      heightCm: Number(triple[3]),
    };
  }

  const pair = raw.match(/(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)/);
  if (pair) {
    return {
      lengthCm: Number(pair[1]),
      widthCm: Number(pair[2]),
      heightCm: 5,
    };
  }

  return {};
}

function pickSkuAttributes(
  detail: ItemGetProduct,
  tangbuySkuId: string
): string[] {
  const skus = detail.productSkus ?? [];
  const target = skus.find((s) => String(s.skuId) === String(tangbuySkuId));
  if (!target?.skuAttributes?.length) return [];

  return target.skuAttributes
    .map((a) => a.attrValueTrans ?? a.attrValue ?? "")
    .filter(Boolean);
}

function extractFromTimeInfo(detail: ItemGetProduct): VariantMeasureFields {
  const timeInfo = detail.timeInfo;
  if (!timeInfo || typeof timeInfo !== "object") return {};

  const out: VariantMeasureFields = {};
  const weight = timeInfo.weight ?? timeInfo.unPackWeight;
  const volume = timeInfo.volume ?? timeInfo.unPackVolume;

  if (typeof weight === "number" && Number.isFinite(weight) && weight > 0) {
    out.weightG = Math.round(weight);
    out.measureSource = "itemGet.timeInfo";
  }
  if (typeof volume === "number" && Number.isFinite(volume) && volume > 0) {
    out.volumeCm3 = Math.round(volume);
    out.measureSource = out.measureSource ?? "itemGet.timeInfo";
  }

  return out;
}

export function resolveMeasuresFromItemDetail(
  detail: ItemGetProduct,
  tangbuySkuId: string
): VariantMeasureFields {
  const fromTime = extractFromTimeInfo(detail);
  const attrs = pickSkuAttributes(detail, tangbuySkuId);
  let fromAttr: Pick<VariantMeasureFields, "lengthCm" | "widthCm" | "heightCm"> =
    {};

  for (const text of attrs) {
    const parsed = parseSizeFromAttributeText(text);
    if (parsed.lengthCm) {
      fromAttr = parsed;
      break;
    }
  }

  if (!fromTime.weightG && fromAttr.lengthCm && fromAttr.widthCm && fromAttr.heightCm) {
    const volume =
      fromAttr.lengthCm * fromAttr.widthCm * fromAttr.heightCm * 0.25;
    return {
      ...fromAttr,
      weightG: Math.max(100, Math.round(volume * 0.15)),
      measureSource: "itemGet.skuAttributes",
    };
  }

  if (fromTime.weightG || fromTime.volumeCm3) {
    return { ...fromTime, ...fromAttr, measureSource: fromTime.measureSource };
  }

  if (fromAttr.lengthCm) {
    return { ...fromAttr, measureSource: "itemGet.skuAttributes" };
  }

  return {};
}

export interface VariantMeasureInput {
  tangbuySkuId: string;
  tangbuyGoodsId: string;
  detailUrl?: string | null;
  weightG?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

const detailCache = new Map<string, Promise<ItemGetProduct | null>>();

function loadDetail(url: string): Promise<ItemGetProduct | null> {
  const key = url.trim();
  if (!key) return Promise.resolve(null);
  const existing = detailCache.get(key);
  if (existing) return existing;
  const pending = fetchItemDetail(key).finally(() => {
    // keep resolved cache for session
  });
  detailCache.set(key, pending);
  return pending;
}

/** Bindings store 1688 offer id as tangbuyGoodsId — itemGet expects the 1688 detail URL. */
export function buildOfferDetailUrl(goodsId: string): string {
  const id = goodsId.trim();
  if (!id) return "";
  if (/^https?:\/\//i.test(id)) return id;
  return `https://detail.1688.com/offer/${encodeURIComponent(id)}.html`;
}

function resolveDetailUrl(input: VariantMeasureInput): string {
  if (input.detailUrl?.trim()) return input.detailUrl.trim();
  const fromGoods = buildOfferDetailUrl(input.tangbuyGoodsId);
  if (fromGoods) return fromGoods;
  return buildTangbuyProductUrl(input.tangbuyGoodsId);
}

/** Fill missing weight/dimensions from itemGet before estimate. */
export async function enrichVariantsWithMeasures<
  T extends VariantMeasureInput,
>(variants: T[]): Promise<T[]> {
  if (!isMallGatewayConfigured() || variants.length === 0) return variants;

  const byUrl = new Map<string, T[]>();
  for (const variant of variants) {
    const hasAll =
      variant.weightG != null &&
      variant.lengthCm != null &&
      variant.widthCm != null &&
      variant.heightCm != null;
    if (hasAll) continue;
    const url = resolveDetailUrl(variant);
    const group = byUrl.get(url) ?? [];
    group.push(variant);
    byUrl.set(url, group);
  }

  if (byUrl.size === 0) return variants;

  await Promise.all(
    [...byUrl.entries()].map(async ([url, group]) => {
      const detail = await loadDetail(url);
      if (!detail) return;
      for (const variant of group) {
        const measures = resolveMeasuresFromItemDetail(detail, variant.tangbuySkuId);
        if (variant.weightG == null && measures.weightG != null) {
          variant.weightG = measures.weightG;
        }
        if (variant.lengthCm == null && measures.lengthCm != null) {
          variant.lengthCm = measures.lengthCm;
        }
        if (variant.widthCm == null && measures.widthCm != null) {
          variant.widthCm = measures.widthCm;
        }
        if (variant.heightCm == null && measures.heightCm != null) {
          variant.heightCm = measures.heightCm;
        }
      }
    })
  );

  return variants;
}

export function formatMeasureSummary(fields: {
  estimatedWeightG?: number | null;
  estimatedLengthCm?: number | null;
  estimatedWidthCm?: number | null;
  estimatedHeightCm?: number | null;
  measureSource?: string | null;
}): string | null {
  const parts: string[] = [];
  if (fields.estimatedWeightG != null) parts.push(`${fields.estimatedWeightG}g`);
  if (
    fields.estimatedLengthCm != null &&
    fields.estimatedWidthCm != null &&
    fields.estimatedHeightCm != null
  ) {
    parts.push(
      `${fields.estimatedLengthCm}×${fields.estimatedWidthCm}×${fields.estimatedHeightCm}cm`
    );
  }
  if (!parts.length) return null;
  return parts.join(" · ");
}
