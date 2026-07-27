// 运营中心 · mock 数据生成（Phase A）
// 数据形状严格对齐 types.ts / pipispy 真实字段矩阵；用户接后端后本文件整体可被真实响应替换。
// 确定性伪随机（mulberry32），保证会话内分页/筛选/图表一致。

import {
  AD_CATEGORIES,
  CTA_BUTTONS,
  REGIONS,
  SHOP_TYPES,
  TTS_CATEGORIES,
} from "./enums";
import type {
  AdCard,
  AdDetail,
  AdspyDetail,
  CompetitionProductRow,
  CreativeBrief,
  ImageSearchResult,
  PlatformBreakdown,
  ProductDossier,
  RankRow,
  StoreAdState,
  StoreAdTrendPoint,
  StoreCreative,
  StoreDataAnalysis,
  StoreDeliveryAnalysis,
  StoreDossier,
  StoreFbPage,
  StoreLongestRunAd,
  StoreMostUsedAd,
  StorePlatformShare,
  StoreRegionAnalysis,
  StoreRow,
  StoreSearchResult,
  TtsSalesTrendPoint,
  TtsShopDetail,
  TtsShopRow,
  WebsiteInfo,
} from "./types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const randInt = (rng: () => number, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const randFloat = (rng: () => number, min: number, max: number) => rng() * (max - min) + min;

/** 近 12 期趋势序列（整体向上带噪，用于图表）。 */
function makeSeries(rng: () => number, base: number, vol: number, up = 0.18): number[] {
  let v = base;
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    v = Math.max(1, v + v * (up + (rng() - 0.5) * vol));
    out.push(Math.round(v));
  }
  return out;
}

const BASE = 1_750_000_000; // 固定基准 epoch（秒），保证确定性
const now = BASE;
const DAY = 86400;

const STORE_PREFIX = [
  "Glow", "Pet", "Aura", "Vital", "Nova", "Lumi", "Trend", "Bloom", "Pulse", "Zen",
  "Craft", "Ember", "Cozy", "Prime", "Vibe", "Lush", "Pure", "Peak", "Drift", "Flux",
];
const STORE_SUFFIX = [
  "Beauty", "Pets", "Home", "Tech", "Finds", "Store", "Shop", "Goods", "Lab", "Market",
  "Co", "Studio", "Outfit", "Supply", "Haus", "Mart", "Cart", "Hub", "Wear", "Deals",
];
const PRODUCTS = [
  "Portable Blender", "LED Strip Kit", "Ice Roller", "Posture Corrector", "Mini Projector",
  "Heated Vest", "Cat Water Fountain", "Magnetic Lashes", "Weighted Blanket", "Car Vacuum",
  "Neck Massager", "Smart Ring", "Desk Organizer", "Pet Hair Remover", "Sunset Lamp",
  "Foot Peel Mask", "Wireless Earbuds", "Knife Sharpener", "Bluetooth Speaker", "Yoga Wheel",
];
const ADJ = ["Pro", "Mini", "Max", "Air", "Lite", "Plus", "Eco", "Ultra", "Neo", "Smart"];

function makeName(rng: () => number) {
  return `${pick(rng, STORE_PREFIX)}${pick(rng, STORE_SUFFIX)}`;
}
function makeTitle(rng: () => number) {
  return `${pick(rng, ADJ)} ${pick(rng, PRODUCTS)}`;
}

function makeBreakdown(rng: () => number, factor: number): PlatformBreakdown {
  const dataCount = randInt(rng, 20, 3000) * factor;
  const play = randInt(rng, 50_000, 20_000_000) * factor;
  const putDays = randInt(rng, 15, 800);
  const found = now - putDays * 86400;
  const latest = now - randInt(rng, 1, 20) * 86400;
  const adState: StoreAdState = pick(rng, [1, 1, 1, 0, -1] as StoreAdState[]);
  const b: PlatformBreakdown = {
    dataCount,
    playCount: play,
    pageCount: randInt(rng, 1, 25),
    minCpm: +randFloat(rng, 4, 25).toFixed(2),
    maxCpm: +randFloat(rng, 25, 130).toFixed(2),
    minCpa: randInt(rng, 50, 1500),
    maxCpa: randInt(rng, 800, 25000),
    putDays,
    foundTime: found,
    latestFoundTime: latest,
    adState,
  };
  if (rng() > 0.5) {
    b.reach = randInt(rng, 100_000, 50_000_000);
    b.adsetActiveCount = randInt(rng, 1, 200);
    b.adActiveCount = randInt(rng, 1, 500);
    b.adInactiveCount = randInt(rng, 0, 300);
    b.adPlatform = rng() > 0.5 ? ["FACEBOOK", "INSTAGRAM"] : ["FACEBOOK"];
  }
  return b;
}

function makeWebsite(rng: () => number, rootPath: string, monthlyVisits: number, bounceRate: number, visitSeconds: number): WebsiteInfo {
  const regions = Array.from(new Set(Array.from({ length: randInt(rng, 1, 3) }, () => pick(rng, REGIONS).code)));
  return {
    url: `https://${rootPath}`,
    title: `${rootPath.split(".")[0]} — Online Store`,
    icon: "",
    monthlyVisits,
    bounceRate,
    visitSeconds,
    languages: pick(rng, [["en"], ["en", "es"], ["en", "fr", "de"], ["en", "ja"]]),
    countries: regions,
    currencies: pick(rng, [["USD"], ["USD", "EUR"], ["USD", "GBP"]]),
    summary: pick(rng, [
      "DTC brand selling viral home & beauty gadgets via paid social.",
      "Fast-growing Shopify store riding short-video trends.",
      "Pet & lifestyle products monetized through TikTok creatives.",
      "Electronics accessories brand with strong Meta presence.",
      "Beauty tools store scaling with UGC-style video ads.",
    ]),
  };
}

function makeCreatives(rng: () => number, n: number): StoreCreative[] {
  const plats = ["tiktok", "facebook", "meta"] as const;
  return Array.from({ length: n }, () => {
    const videoId = `vid_${randInt(rng, 100000, 999999)}`;
    return {
      // mock 阶段用 picsum 竖图（9:16）预览真实 cover 接通效果；接后端后由 pipispy good_source.cover 覆盖。
      cover: `https://picsum.photos/seed/${videoId}/180/270`,
      appImage: "",
      count: randInt(rng, 5_000, 3_000_000),
      videoId,
      platform: pick(rng, plats),
    };
  });
}

export function makeStores(n: number, collectSome = true): StoreRow[] {
  return Array.from({ length: n }, (_, i) => {
    const rng = mulberry32(1000 + i * 7);
    const name = makeName(rng);
    const rootPath = `${name.toLowerCase().replace(/[^a-z]/g, "")}.myshopify.com`;
    const mainPlat = pick(rng, ["tiktok", "facebook", "meta"] as const);
    const platType: ("tiktok" | "facebook" | "meta")[] = [mainPlat];
    if (rng() > 0.55) platType.push(pick(rng, ["tiktok", "facebook", "meta"] as const));
    const shopType = pick(rng, SHOP_TYPES).code;
    const putDays = randInt(rng, 20, 900);
    const adCount = randInt(rng, 40, 6000);
    const playCount = randInt(rng, 80_000, 60_000_000);
    const monthlyVisits = randInt(rng, 40_000, 6_000_000);
    const bounceRate = +randFloat(rng, 0.2, 0.72).toFixed(2);
    const visitSeconds = randInt(rng, 50, 420);
    const tiktok = platType.includes("tiktok") ? makeBreakdown(rng, 1) : null;
    const facebook = platType.includes("facebook") ? makeBreakdown(rng, 0.8) : null;
    const metaLibrary = platType.includes("meta") ? makeBreakdown(rng, 0.6) : null;
    const regions = Array.from(new Set(Array.from({ length: randInt(rng, 1, 3) }, () => pick(rng, REGIONS).code)));
    const categories = Array.from(new Set(Array.from({ length: randInt(rng, 1, 3) }, () => pick(rng, AD_CATEGORIES).code)));
    const isAi = rng() > 0.82;
    const isDrama = rng() > 0.88;
    return {
      id: `store_${i + 1}`,
      storeId: String(randInt(rng, 1000000000000, 9999999999999)),
      name,
      rootPath,
      icon: "",
      shopType,
      platform: mainPlat,
      platType,
      adCount,
      playCount,
      diggCount: randInt(rng, 1_000, 600_000),
      putDays,
      foundTime: now - putDays * 86400,
      latestFoundTime: now - randInt(rng, 1, 15) * 86400,
      cpmMin: +(randFloat(rng, 4, 22) as number).toFixed(2),
      cpmMax: +(randFloat(rng, 28, 140) as number).toFixed(2),
      cpaMin: randInt(rng, 50, 1500),
      cpaMax: randInt(rng, 800, 30000),
      pageCount: randInt(rng, 1, 30),
      adState: pick(rng, [1, 1, 1, 0, -1] as StoreAdState[]),
      monthlyVisits,
      bounceRate,
      visitSeconds,
      regions,
      categories,
      latestCreatives: makeCreatives(rng, 3),
      popularPersonCount: randInt(rng, 200, 250_000),
      isAi,
      isDrama,
      appType2: pick(rng, ["web", "app", "game"]),
      website: makeWebsite(rng, rootPath, monthlyVisits, bounceRate, visitSeconds),
      tiktok,
      facebook,
      metaLibrary,
      isCollection: collectSome && rng() > 0.7,
      growthSeries: makeSeries(rng, Math.max(100, playCount / 40), 0.5),
    };
  });
}

// --- 店铺检索（store/list，域名/店名 → 内部 ID，mock 候选生成）---

/** 13 字符 hex 内部 ID（仿 pipi 03274ebc3a519），确定性由 seed 派生。 */
function makeStoreId(rng: () => number): string {
  const chars = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 13; i++) s += chars[Math.floor(rng() * 16)];
  return s;
}

/** 店铺检索候选（store/list）：把用户输入解析成候选 store。
 * 首个候选尽力贴合输入——若输入像域名则 domain=输入，否则 name 含输入，便于解析器直取。 */
export function makeStoreSearchResults(keyword: string, n = 5): StoreSearchResult[] {
  const kw = keyword.trim().toLowerCase();
  const seed = [...kw].reduce((a, c) => a + c.charCodeAt(0), 7);
  const rng = mulberry32(seed * 131 + 9000);
  const looksLikeDomain = kw.includes(".");
  return Array.from({ length: Math.max(1, n) }, (_, i) => {
    const name = makeName(rng);
    const domain =
      i === 0 && looksLikeDomain
        ? kw
        : i === 0
          ? `${kw.replace(/[^a-z0-9]/g, "")}.myshopify.com`
          : `${name.toLowerCase().replace(/[^a-z]/g, "")}.myshopify.com`;
    const mainPlat = pick(rng, ["tiktok", "facebook", "meta"] as const);
    const platType: ("tiktok" | "facebook" | "meta")[] = [mainPlat];
    if (rng() > 0.5) platType.push(pick(rng, ["tiktok", "facebook", "meta"] as const));
    const adCount = randInt(rng, 40, 6000);
    const putDays = randInt(rng, 30, 800);
    return {
      id: makeStoreId(rng),
      name: i === 0 && !looksLikeDomain ? kw.replace(/\.myshopify\.com$/, "") : name,
      domain,
      icon: "",
      platType,
      adCount,
      region: pick(rng, REGIONS).code,
      shopType: pick(rng, SHOP_TYPES).code,
      monthlyVisits: randInt(rng, 40_000, 6_000_000),
      firstAdTime: now - putDays * DAY,
      lastAdTime: now - randInt(rng, 1, 20) * DAY,
      adState: pick(rng, [1, 1, 1, 0, -1] as StoreAdState[]),
    };
  });
}

// --- 店铺数据分析（store/data-analysis 族，mock 生成，仿 velvory 截图结构）---

/** 店铺数据分析（store/data-analysis）：播放/赞/赞率/广告数/天数/花费 + 平台占比。 */
export function makeStoreDataAnalysis(seedId: string): StoreDataAnalysis {
  const seed = [...seedId].reduce((a, c) => a + c.charCodeAt(0), 13);
  const rng = mulberry32(seed * 71 + 4242);
  const metaAds = randInt(rng, 80, 1200);
  const fbAds = rng() > 0.4 ? randInt(rng, 1, 40) : 0;
  const totalAd = metaAds + fbAds;
  const totalPlay = randInt(rng, 50_000, 9_000_000);
  const totalLike = randInt(rng, 20, 4000);
  const likeRate = totalPlay > 0 ? totalLike / totalPlay : 0; // 0..1 分数
  const totalDays = randInt(rng, 30, 400);
  const spendMin = +(randFloat(rng, 80, 400) as number).toFixed(1);
  const spendMax = +(randFloat(rng, 200, 900) as number).toFixed(1);
  const platforms: StorePlatformShare[] = [];
  if (fbAds > 0) {
    platforms.push({
      platform: "facebook",
      playCount: totalPlay,
      likeCount: totalLike,
      likeRate,
      adCount: fbAds,
      adDays: randInt(rng, 1, totalDays),
      spendMin,
      spendMax,
      share: fbAds / totalAd,
    });
  }
  platforms.push({
    platform: "meta",
    playCount: rng() > 0.7 ? randInt(rng, 1000, totalPlay) : 0,
    likeCount: 0,
    likeRate: 0,
    adCount: metaAds,
    adDays: randInt(rng, 1, totalDays),
    spendMin,
    spendMax,
    share: metaAds / totalAd,
  });
  return {
    totalPlayCount: totalPlay,
    totalLikeCount: totalLike,
    likeRate,
    totalAdCount: totalAd,
    totalAdDays: totalDays,
    spendMin,
    spendMax,
    firstAdTime: now - totalDays * DAY,
    lastAdTime: now - randInt(rng, 1, 20) * DAY,
    platforms,
  };
}

/** 广告地区分布（store/region-analysis）。 */
export function makeStoreRegionAnalysis(seedId: string): StoreRegionAnalysis[] {
  const seed = [...seedId].reduce((a, c) => a + c.charCodeAt(0), 29);
  const rng = mulberry32(seed * 53 + 771);
  const total = randInt(rng, 40, 6000);
  return [
    { region: "US", adCount: randInt(rng, 1, Math.max(2, Math.floor(total * 0.4))), playCount: randInt(rng, 1000, 5_000_000), likeCount: randInt(rng, 10, 2000) },
    { region: "OTHER", adCount: total, playCount: randInt(rng, 1000, 5_000_000), likeCount: randInt(rng, 10, 2000) },
  ];
}

/** 交付分析（store/delivery-analysis）。 */
export function makeStoreDeliveryAnalysis(seedId: string): StoreDeliveryAnalysis {
  const seed = [...seedId].reduce((a, c) => a + c.charCodeAt(0), 31);
  const rng = mulberry32(seed * 17 + 909);
  return {
    avgDeliveryDays: randInt(rng, 5, 90),
    maxDeliveryDays: randInt(rng, 90, 600),
    frequency: randInt(rng, 2, 30),
    coverage: randInt(rng, 1, 40),
    activeDays: randInt(rng, 30, 400),
  };
}

/**
 * 榜单行筛选侧信道（mock 阶段）。
 * RankRow 真实响应不含逐行 region/category/shopType（由 pipispy 服务端按请求 param 过滤），
 * 故在 mock 构造时为每行绑定一份真实枚举 code，供 api.ts 过滤 + 发现页洞察面板复用，
 * 不污染 RankRow 类型。接后端后此 Map 连同 ALL_RANK 一起被真实响应替换。
 */
export const MOCK_RANK_META: Map<string, { region: string; category: string; shopType: string }> = new Map();

export function makeAdCards(n: number): AdCard[] {
  return Array.from({ length: n }, (_, i) => {
    const rng = mulberry32(2000 + i * 11);
    const price = +randFloat(rng, 6, 240).toFixed(2);
    const country = pick(rng, REGIONS).code;
    const storeName = makeName(rng);
    const domain = `${storeName.toLowerCase().replace(/[^a-z]/g, "")}.myshopify.com`;
    const store: AdCard["store"] = {
      id: `store_${randInt(rng, 100000, 999999)}`,
      name: storeName,
      domain,
      country,
      logoUrl: "",
      adCount: randInt(rng, 100, 4000),
      adsetCount: randInt(rng, 100, 5000),
      eCommercePlatform: "shopify",
    };
    const adPlatform = Array.from(
      new Set(
        Array.from({ length: randInt(rng, 1, 3) }, () =>
          pick(rng, ["FACEBOOK", "INSTAGRAM", "AUDIENCE_NETWORK", "MESSENGER", "THREADS"] as const)
        )
      )
    );
    const startedAt = now - randInt(rng, 1, 400) * DAY;
    const endedAt = rng() > 0.5 ? now - randInt(rng, 0, 30) * DAY : null;
    const images = Array.from(
      { length: randInt(rng, 1, 5) },
      () => `https://fb-cdn.ppspy.com/images/pimg_${randInt(rng, 100000, 999999)}.png`
    );
    return {
      id: `ad_${i + 1}`,
      image: images[0],
      title: makeTitle(rng),
      price,
      currency: "USD",
      priceUsd: price,
      eCommercePlatform: "shopify",
      adPlatform,
      adCount: randInt(rng, 1, 600),
      activeAdCount: randInt(rng, 0, 300),
      adsetCount: randInt(rng, 1, 600),
      adStartedAt: startedAt,
      adEndedAt: endedAt,
      activeDays: randInt(rng, 1, 400),
      adStatus: endedAt ? 0 : 1,
      adAudienceReach: randInt(rng, 0, 5_000_000),
      adCost: randInt(rng, 0, 200_000),
      store,
      storeId: store.id,
      relatedRoot: domain,
      sourceProductLink: `https://${domain}/products/${makeTitle(rng).toLowerCase().replace(/\s+/g, "-")}`,
      images,
      isCollection: rng() > 0.8,
      userCollected: randInt(rng, 0, 5),
    };
  });
}

/** 广告文案钩子（mock 占位；pipispy 真实不提供正文，接后端后由 adspy caption 覆盖）。 */
const AD_HOOKS = [
  "This 10-second routine fixed my back pain",
  "I wish I knew this gadget sooner",
  "The hack everyone on TikTok is using",
  "Stop wasting money on the expensive version",
  "My bathroom looks 10x bigger now",
  "3 things I'd never buy again after this",
  "Why is nobody talking about this tool",
  "The $19 fix that saved me $400",
  "She tried it for 7 days — here's what happened",
  "This is the only one that actually worked",
];

/** 创意打法库条目（adspy/list / ad-library/ads，mock）。 */
export function makeCreativeBriefs(n: number): CreativeBrief[] {
  return Array.from({ length: n }, (_, i) => {
    const rng = mulberry32(8000 + i * 23);
    const plat = pick(rng, ["tiktok", "facebook", "meta"] as const);
    const platforms =
      plat === "tiktok"
        ? ["TIKTOK"]
        : plat === "facebook"
          ? rng() > 0.5
            ? ["FACEBOOK", "INSTAGRAM"]
            : ["FACEBOOK"]
          : rng() > 0.5
            ? ["AUDIENCE_NETWORK", "MESSENGER"]
            : ["THREADS"];
    const advertiser = makeName(rng);
    const coverId = `cc_${randInt(rng, 100000, 999999)}`;
    const isActive = rng() > 0.18;
    return {
      id: `cre_${i + 1}`,
      cover: `https://picsum.photos/seed/${coverId}/300/400`,
      title: makeTitle(rng),
      copy: pick(rng, AD_HOOKS),
      platform: plat,
      platforms,
      advertiser: `${advertiser} Official`,
      advertiserPage: `https://facebook.com/${advertiser.toLowerCase().replace(/[^a-z]/g, "")}`,
      likes: randInt(rng, 500, 2_400_000),
      comments: randInt(rng, 20, 80_000),
      shares: randInt(rng, 10, 140_000),
      activeDays: randInt(rng, 2, 540),
      ctaType: pick(rng, CTA_BUTTONS).code,
      isActive,
    };
  });
}

export function makeRankRows(n: number): RankRow[] {
  return Array.from({ length: n }, (_, i) => {
    const rng = mulberry32(3000 + i * 13);
    const usd = +randFloat(rng, 6, 280).toFixed(2);
    const hasCpm = rng() > 0.35;
    const region = pick(rng, REGIONS).code;
    const category = pick(rng, AD_CATEGORIES).code;
    const shopType = pick(rng, SHOP_TYPES).code;
    const id = `rank_${i + 1}`;
    MOCK_RANK_META.set(id, { region, category, shopType });
    return {
      id,
      image: "",
      title: makeTitle(rng),
      currency: "USD",
      price: usd,
      usdPrice: usd,
      countGrowth: randInt(rng, 500, 800_000),
      videoCount: randInt(rng, 1, 120),
      growthRate: +randFloat(rng, 0.03, 6.5).toFixed(4),
      minCpm: hasCpm ? +randFloat(rng, 5, 40).toFixed(2) : null,
      maxCpm: hasCpm ? +randFloat(rng, 40, 160).toFixed(2) : null,
      isCollection: rng() > 0.85,
      platform: shopType,
    };
  });
}

export function makeTtsShops(n: number): TtsShopRow[] {
  return Array.from({ length: n }, (_, i) => {
    const rng = mulberry32(4000 + i * 17);
    const gmvUsd = +randFloat(rng, 50_000, 30_000_000).toFixed(2);
    const salesVolume = randInt(rng, 100_000, 20_000_000);
    const personCount = randInt(rng, 5_000, 4_000_000);
    const region = pick(rng, REGIONS).code;
    const cat = pick(rng, TTS_CATEGORIES);
    const title = makeName(rng);
    // 近 28 天销量趋势（整体向上带噪），用于洞察面板动量图
    const trendLen = 28;
    const day0 = now - trendLen * DAY;
    let v = salesVolume / trendLen;
    const salesTrendData: TtsSalesTrendPoint[] = Array.from({ length: trendLen }, (_, k) => {
      v = Math.max(0, v + v * (0.18 + (rng() - 0.5) * 0.6));
      return { day: day0 + k * DAY, salesVolume: Math.round(v) };
    });
    const found = now - randInt(rng, 30, 600) * DAY;
    const last = now - randInt(rng, 1, 20) * DAY;
    return {
      id: `tts_${i + 1}`,
      image: "",
      title,
      salesVolume,
      score: +randFloat(rng, 3.5, 5).toFixed(1),
      currency: "USD",
      gmv: Math.round(gmvUsd * randFloat(rng, 14000, 16000)),
      gmvUsd,
      salesTrend: rng() > 0.5 ? 1 : -1,
      salesTrendData,
      personCount,
      goodsCount: randInt(rng, 20, 1200),
      goodsAdCount: randInt(rng, 0, 50),
      avgPrice: Math.round(randFloat(rng, 5, 80) * 14000),
      avgPriceUsd: +randFloat(rng, 5, 80).toFixed(2),
      videoCount: randInt(rng, 1, 2000),
      playCount: randInt(rng, 100, 50_000_000),
      shareCount: randInt(rng, 0, 5_000_000),
      minCpm: rng() > 0.3 ? +randFloat(rng, 0.1, 3).toFixed(2) : null,
      maxCpm: rng() > 0.3 ? +randFloat(rng, 3, 12).toFixed(2) : null,
      regions: [region],
      categories: [{ id: cat.code, nameZh: cat.label, nameEn: cat.label }],
      foundTime: found,
      lastFoundTime: last,
      bestSellingGoods: Array.from({ length: randInt(rng, 1, 3) }, () => ({
        productId: `pg_${randInt(rng, 100000, 999999)}`,
        image: "",
        salesVolume: randInt(rng, 1000, 200_000),
      })),
      productType: [pick(rng, ["retail", "brand", "local"] as const)],
      delivery: rng() > 0.5 ? ["standard", "express"] : [],
      isCollection: rng() > 0.85,
    };
  });
}

/** TikTok Shop 店铺详情富集 mock（列表行缺的字段）。 */
export function makeTtsShopDetail(id: string): TtsShopDetail {
  const rng = mulberry32(7400 + (id ? id.length * 53 : 11));
  const min = +randFloat(rng, 50_000, 200_000).toFixed(0);
  const max = +(min * randFloat(rng, 2, 5)).toFixed(0);
  return {
    adCost: `USD ${min.toLocaleString()} - ${(max).toLocaleString()}`,
    rootPath: `${makeName(rng).toLowerCase().replace(/\s+/g, "")}.com`,
    goodsAdRate: +randFloat(rng, 0.4, 0.95).toFixed(2),
    commissionRate: +randFloat(rng, 0.05, 0.2).toFixed(2),
    landingPage: `https://shop.tiktok.com/@${makeName(rng).toLowerCase().replace(/\s+/g, "")}`,
    desc: "Mock TikTok Shop store description.",
    keywords: "fashion,beauty,accessories",
    isManaged: rng() > 0.5,
    isInMarketplace: rng() > 0.5,
  };
}

export function makeAdDetail(id: string): AdDetail {
  const rng = mulberry32(5000 + (id ? id.length * 31 : 7));
  const usd = +randFloat(rng, 8, 220).toFixed(2);
  const plat = pick(rng, ["tiktok", "facebook", "meta"] as const);
  const code = plat === "tiktok" ? 1 : plat === "facebook" ? 2 : 3;
  const advertisers = Array.from({ length: randInt(rng, 2, 4) }, (_, k) => ({
    id: `adv_${k + 1}`,
    name: `${makeName(rng)} Ads`,
  }));
  const history = Array.from({ length: randInt(rng, 3, 6) }, (_, k) => {
    const d = new Date((now - (k + 1) * randInt(rng, 10, 120) * 86400) * 1000);
    return d.toISOString().slice(0, 10);
  });
  return {
    id,
    product: {
      id: `prod_${id}`,
      title: makeTitle(rng),
      image: "",
      appImage: "",
      price: usd,
      usdPrice: usd,
      currency: "USD",
    },
    store: { name: makeName(rng), domain: "example.myshopify.com" },
    advertisers,
    adCost: +randFloat(rng, 200, 50000).toFixed(2),
    adAudienceReach: randInt(rng, 50_000, 9_000_000),
    adForecast: pick(rng, ["测款", "放量", "盈利"]),
    adStartedHistory: history,
    ctaType: pick(rng, CTA_BUTTONS).code,
    likeCount: randInt(rng, 5_000, 3_000_000),
    platform: plat,
    platformCode: code as 1 | 2 | 3,
    videoId: `vid_${randInt(rng, 100000, 999999)}`,
    copyUnavailable: true,
  };
}

/** Adspy 创意详情（adspy/detail，按列表 video_id 取，mock 富字段，配可播样例视频）。 */
export function makeAdspyDetail(id: string): AdspyDetail {
  const rng = mulberry32(7700 + (id ? id.length * 29 : 5));
  const plat = pick(rng, ["tiktok", "facebook", "meta"] as const);
  const platforms =
    plat === "tiktok"
      ? ["TIKTOK"]
      : plat === "facebook"
        ? rng() > 0.5
          ? ["FACEBOOK", "INSTAGRAM"]
          : ["FACEBOOK"]
        : rng() > 0.5
          ? ["AUDIENCE_NETWORK", "MESSENGER"]
          : ["THREADS"];
  const advertiser = makeName(rng);
  const coverId = `ad_${randInt(rng, 100000, 999999)}`;
  const videoId = id || `vid_${randInt(rng, 100000, 999999)}`;
  const isActive = rng() > 0.18;
  const duration = randInt(rng, 8, 58);
  const tags = ["Hook", "UGC", "Testimonial", "Before/After", "Tutorial", "Unboxing", "Demo", "Story"];
  const aiAnalysis = {
    language: pick(rng, ["en", "es", "zh-cn", "pt", "fr"]),
    humanPresenter: pick(rng, ["真人出镜", "画外音", "无真人"]),
    mainHook: pick(rng, AD_HOOKS),
    script: `${pick(rng, AD_HOOKS)}. ${pick(rng, AD_HOOKS)} — 点击链接立即体验，限时优惠。`,
    tags: Array.from(new Set(Array.from({ length: randInt(rng, 2, 4) }, () => pick(rng, tags)))),
  };
  const audience = {
    region: Array.from(new Set(Array.from({ length: randInt(rng, 1, 3) }, () => pick(rng, REGIONS).code))),
    gender: pick(rng, ["female", "male", "all"]),
    age: pick(rng, ["18-24", "25-34", "35-44", "45-54", "all"]),
    category: pick(rng, AD_CATEGORIES).code,
    covered: pick(rng, ["高覆盖", "精准定向", "宽受众"]),
  };
  const contentList = Array.from({ length: randInt(rng, 1, 3) }, () => ({
    cta: pick(rng, CTA_BUTTONS).code,
    landingPage: `https://${advertiser.toLowerCase().replace(/[^a-z]/g, "")}.myshopify.com/p/landing-${randInt(rng, 100, 999)}`,
    title: makeTitle(rng),
    desc: pick(rng, AD_HOOKS),
  }));
  return {
    id: videoId,
    // mock 阶段用公开样例 MP4，接后端后由 pipispy video_url 覆盖。
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    cover: `https://picsum.photos/seed/${coverId}/360/640`,
    duration,
    videoType: 1,
    title: makeTitle(rng),
    advertiser: `${advertiser} Official`,
    advertiserPage: `https://facebook.com/${advertiser.toLowerCase().replace(/[^a-z]/g, "")}`,
    platform: plat,
    platforms,
    likes: randInt(rng, 500, 2_400_000),
    comments: randInt(rng, 20, 80_000),
    shares: randInt(rng, 10, 140_000),
    activeDays: randInt(rng, 2, 540),
    ctaType: pick(rng, CTA_BUTTONS).code,
    isActive,
    aiAnalysis,
    audience,
    contentList,
    adFee: randInt(rng, 200, 50_000),
    minCpm: +randFloat(rng, 4, 25).toFixed(2),
    maxCpm: +randFloat(rng, 25, 130).toFixed(2),
    cpa: randInt(rng, 50, 2000),
    tiktokAuthor: rng() > 0.5 ? `@${advertiser.toLowerCase().replace(/[^a-z]/g, "")}` : undefined,
    tiktokShop: rng() > 0.5 ? `https://shop.tiktok.com/@${advertiser.toLowerCase().replace(/\s+/g, "")}` : undefined,
    app: { app_name: "Demo App", app_url: "https://example.com/app" },
  };
}

/** 店下在投商品（store/detail/competition/products，免费端点，mock）。 */
export function makeCompetitionProducts(storeId: string): CompetitionProductRow[] {
  const n = 6;
  return Array.from({ length: n }, (_, i) => {
    const rng = mulberry32(7000 + (storeId ? storeId.length * 17 : 3) + i * 13);
    return {
      id: `cprod_${storeId}_${i + 1}`,
      title: makeTitle(rng),
      icon: "",
      link: "",
    };
  });
}

export function makeImageResults(n: number): ImageSearchResult[] {
  return Array.from({ length: n }, (_, i) => {
    const rng = mulberry32(6000 + i * 19);
    const plat = pick(rng, ["tiktok", "facebook", "meta"] as const);
    return {
      id: `img_${i + 1}`,
      image: "",
      title: makeTitle(rng),
      platform: plat,
      usdPrice: +randFloat(rng, 6, 220).toFixed(2),
      similarity: +(0.62 + rng() * 0.37).toFixed(2),
      store: makeName(rng),
    };
  });
}

// --- 竞店充实（store/detail 族，mock 生成，接后端后由 pipispy 真实响应替换）---

/** 广告趋势（store/ad-trend，近 12 期）。 */
export function makeStoreAdTrend(storeId: string): StoreAdTrendPoint[] {
  const rng = mulberry32(9100 + (storeId ? storeId.length * 13 : 5));
  const len = 12;
  const day0 = now - len * DAY;
  let ad = randInt(rng, 20, 120);
  let play = randInt(rng, 50_000, 3_000_000);
  return Array.from({ length: len }, (_, k) => {
    ad = Math.max(1, ad + randInt(rng, -10, 25));
    play = Math.max(1, play + randInt(rng, -100_000, 800_000));
    return { day: day0 + k * DAY, adCount: ad, playCount: play };
  });
}

/** 常青素材（store/longest-run-ads，投放最久的创意）。 */
export function makeStoreLongestRunAds(storeId: string): StoreLongestRunAd[] {
  const rng = mulberry32(9200 + (storeId ? storeId.length * 17 : 3));
  return Array.from({ length: 4 }, (_, i) => {
    const runDays = randInt(rng, 120, 900);
    const last = now - randInt(rng, 1, 20) * DAY;
    const first = last - runDays * DAY;
    const videoId = `vid_${randInt(rng, 100000, 999999)}`;
    return {
      id: `long_${storeId}_${i + 1}`,
      cover: `https://picsum.photos/seed/${videoId}/180/270`,
      title: makeTitle(rng),
      platform: pick(rng, ["tiktok", "facebook", "meta"] as const),
      firstSeen: first,
      lastSeen: last,
      runDays,
      playCount: randInt(rng, 50_000, 8_000_000),
    };
  });
}

/** 高频素材（store/most-used-ads，投放最频繁的创意）。 */
export function makeStoreMostUsedAds(storeId: string): StoreMostUsedAd[] {
  const rng = mulberry32(9300 + (storeId ? storeId.length * 19 : 7));
  return Array.from({ length: 5 }, (_, i) => {
    const videoId = `vid_${randInt(rng, 100000, 999999)}`;
    return {
      id: `used_${storeId}_${i + 1}`,
      cover: `https://picsum.photos/seed/${videoId}/180/270`,
      title: makeTitle(rng),
      platform: pick(rng, ["tiktok", "facebook", "meta"] as const),
      usedCount: randInt(rng, 20, 600),
      playCount: randInt(rng, 100_000, 12_000_000),
      cpm: +randFloat(rng, 4, 60).toFixed(2),
    };
  });
}

/** 关联 Facebook 主页（store/fb-pages）。 */
export function makeStoreFbPages(storeId: string): StoreFbPage[] {
  const rng = mulberry32(9400 + (storeId ? storeId.length * 23 : 9));
  const n = randInt(rng, 1, 3);
  return Array.from({ length: n }, (_, i) => {
    const name = makeName(rng);
    const slug = name.toLowerCase().replace(/[^a-z]/g, "");
    return {
      id: `fb_${storeId}_${i + 1}`,
      pageId: String(randInt(rng, 100000000000000, 999999999999999)),
      name: `${name} Official`,
      url: `https://facebook.com/${slug}`,
      likes: randInt(rng, 5_000, 900_000),
      followers: randInt(rng, 5_000, 1_200_000),
      category: pick(rng, ["Retail", "E-commerce", "Shopping", "Beauty", "Lifestyle"]),
    };
  });
}

// --- dossier 聚合（路由页富内容；mock 阶段本地拼装，store 头部由调用方从注册表填充）---

/** 单店富 dossier（/operations-center/store/[id]）：本地拼装 8 个 store/* 端点。 */
export function makeStoreDossier(storeId: string): StoreDossier {
  return {
    store: null,
    products: makeCompetitionProducts(storeId),
    dataAnalysis: makeStoreDataAnalysis(storeId),
    regionAnalysis: makeStoreRegionAnalysis(storeId),
    deliveryAnalysis: makeStoreDeliveryAnalysis(storeId),
    adTrend: makeStoreAdTrend(storeId),
    longest: makeStoreLongestRunAds(storeId),
    mostUsed: makeStoreMostUsedAds(storeId),
    fbPages: makeStoreFbPages(storeId),
  };
}

/** 单品富 dossier（/operations-center/product/[id]）：详情 + 市场同类创意墙。 */
export function makeProductDossier(productId: string): ProductDossier {
  return {
    detail: makeAdDetail(productId),
    relatedAds: makeCreativeBriefs(12),
  };
}
