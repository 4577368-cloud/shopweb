import type { ShopMirrorProduct } from "@/lib/types";
import type { RecommendedCategory } from "@/lib/catalog-sourcing-types";

/**
 * Heuristic category buckets derived from shop product titles.
 * Placeholder until a real category-stats API exists on the backend.
 */
const CATEGORY_RULES: { id: string; name: string; patterns: RegExp[] }[] = [
  {
    id: "home",
    name: "家居",
    patterns: [/家居|收纳|窗帘|地毯|床上|枕|被|桌|椅|灯|花瓶|置物/i],
  },
  {
    id: "apparel-women",
    name: "女装",
    patterns: [/女装|连衣裙|女裤|女裙|女上衣|女士|女式|文胸|内衣/i],
  },
  {
    id: "pet",
    name: "宠物",
    patterns: [/宠物|猫|狗|猫砂|猫粮|狗粮|牵引|项圈/i],
  },
  {
    id: "beauty",
    name: "美妆",
    patterns: [/美妆|护肤|口红|面膜|化妆|精华|洗面奶/i],
  },
  {
    id: "digital",
    name: "数码",
    patterns: [/数码|充电|耳机|手机壳|数据线|支架|蓝牙|音箱/i],
  },
  {
    id: "kids",
    name: "母婴",
    patterns: [/母婴|婴儿|童装|奶瓶|纸尿|玩具/i],
  },
  {
    id: "sports",
    name: "运动户外",
    patterns: [/运动|户外|健身|瑜伽|跑步|登山/i],
  },
];

/**
 * Derive Top-N recommended categories from currently listed shop products.
 * Returns empty when there are no products / no keyword hits (caller may fall back).
 */
export function deriveRecommendedCategories(
  products: ShopMirrorProduct[],
  topN = 3
): RecommendedCategory[] {
  if (!products.length) {
    return mockFallbackCategories();
  }

  const counts = new Map<string, { name: string; count: number }>();
  let matched = 0;

  for (const p of products) {
    const title = p.title ?? "";
    let hit: (typeof CATEGORY_RULES)[number] | null = null;
    for (const rule of CATEGORY_RULES) {
      if (rule.patterns.some((re) => re.test(title))) {
        hit = rule;
        break;
      }
    }
    if (!hit) continue;
    matched += 1;
    const prev = counts.get(hit.id);
    if (prev) prev.count += 1;
    else counts.set(hit.id, { name: hit.name, count: 1 });
  }

  if (matched === 0) {
    return mockFallbackCategories();
  }

  const total = products.length;
  return Array.from(counts.entries())
    .map(([id, v]) => ({
      id,
      name: v.name,
      count: v.count,
      share: v.count / total,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/** Stable placeholders so UI can ship before shop products are analyzed. */
function mockFallbackCategories(): RecommendedCategory[] {
  return [
    { id: "home", name: "家居", share: 0.42, count: 0 },
    { id: "apparel-women", name: "女装", share: 0.28, count: 0 },
    { id: "pet", name: "宠物", share: 0.15, count: 0 },
  ];
}
