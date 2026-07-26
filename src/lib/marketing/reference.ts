// 运营中心 · 参考数据字典（pipispy reference，免费）
// 真实环境：tangbuy-plugin 维护 marketing_pipispy_reference，前端只读
//   GET /api/plugin/marketing/reference/enums（设计文档 §189）。
// 该端点免费且静态，启动拉一次，localStorage 缓存（TTL 7 天），永不再向 pipispy 付费。
// mock 模式直接回退 enums.ts 代表性子集，保证筛选器始终可用。

import { marketingReference } from "./marketing-proxy";
import {
  AD_CATEGORIES,
  CTA_BUTTONS,
  REGIONS,
  SHOP_TYPES,
  TTS_CATEGORIES,
  type EnumItem,
} from "./enums";

export interface ReferenceDictionaries {
  /** 国家/地区（others-region）。 */
  region: EnumItem[];
  /** 广告商品类目（others-product-category）。 */
  productCategory: EnumItem[];
  /** TikTok Shop 店铺类目（others-product-category-tt-shop）。 */
  ttsCategory: EnumItem[];
  /** 店型（others-ad-shop-type）。 */
  shopType: EnumItem[];
  /** 广告 CTA 按钮（others-button）。 */
  cta: EnumItem[];
}

/** mock / 兜底字典（与 enums.ts 一致）。 */
export const MOCK_DICTS: ReferenceDictionaries = {
  region: REGIONS,
  productCategory: AD_CATEGORIES,
  ttsCategory: TTS_CATEGORIES,
  shopType: SHOP_TYPES,
  cta: CTA_BUTTONS,
};

const CACHE_KEY = "tangbuy.ops.referenceDictionaries";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const USE_MOCK = process.env.NEXT_PUBLIC_MARKETING_USE_MOCK === "true";

function readCache(): ReferenceDictionaries | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: ReferenceDictionaries };
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data: ReferenceDictionaries) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    }
  } catch {
    // 容量不足等忽略
  }
}

/** 用 mock 补齐真实响应缺失的维度，保证筛选器不缺项。 */
function fillFromMock(partial: Partial<ReferenceDictionaries>): ReferenceDictionaries {
  return {
    region: partial.region && partial.region.length ? partial.region : MOCK_DICTS.region,
    productCategory:
      partial.productCategory && partial.productCategory.length
        ? partial.productCategory
        : MOCK_DICTS.productCategory,
    ttsCategory: partial.ttsCategory && partial.ttsCategory.length ? partial.ttsCategory : MOCK_DICTS.ttsCategory,
    shopType: partial.shopType && partial.shopType.length ? partial.shopType : MOCK_DICTS.shopType,
    cta: partial.cta && partial.cta.length ? partial.cta : MOCK_DICTS.cta,
  };
}

let inflight: Promise<ReferenceDictionaries> | null = null;

/**
 * 拉取参考数据字典（免费）。
 * - 缓存命中（7 天内）直接返回，不发起任何请求；
 * - mock 模式返回 enums.ts 子集；
 * - 真实模式 GET /api/plugin/marketing/reference/enums，失败回退 mock（不阻断用户）。
 * 调用方（如 useReferenceDictionaries）无需关心缓存细节。
 */
export async function fetchReference(force = false): Promise<ReferenceDictionaries> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }
  if (USE_MOCK) {
    writeCache(MOCK_DICTS);
    return MOCK_DICTS;
  }
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await marketingReference();
        const partial = (res.data ?? {}) as Partial<ReferenceDictionaries>;
        const data = fillFromMock(partial);
        writeCache(data);
        return data;
      } catch {
        // 真实端点未就绪：回退 mock，保证筛选器可用（不阻断用户）
        const data = MOCK_DICTS;
        writeCache(data);
        return data;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}
