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
  ImageSearchResult,
  PlatformBreakdown,
  RankRow,
  StoreAdState,
  StoreCreative,
  StoreRow,
  TtsSalesTrendPoint,
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
    adStartedHistory: history,
    ctaType: pick(rng, CTA_BUTTONS).code,
    likeCount: randInt(rng, 5_000, 3_000_000),
    platform: plat,
    platformCode: code as 1 | 2 | 3,
    videoId: `vid_${randInt(rng, 100000, 999999)}`,
    copyUnavailable: true,
  };
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
