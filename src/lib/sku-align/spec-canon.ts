/**
 * 规格读时规范化（Phase 1 — 读时规范化 spike）
 *
 * 为什么是"读时"而非"入库时"：前端不持久化货源规格矩阵（详见调研），
 * 规格只在匹配/展示时按需从网关拉取。因此规范化放在匹配入口与映射函数处，
 * 对两侧标签对称生效，零后端依赖、可回退。
 *
 * 设计：
 *  - 网关已给的 `valueTrans`（英文翻译）优先使用，不动原逻辑。
 *  - 仅当 `valueTrans` 缺失时，用 `VALUE_TRANSLATION` 把中文值翻成规范英文
 *    （空格分隔，便于与英文侧逐 token 对齐）。这是现有 alias 注册表之外的
 *    “缺翻译兜底”，专门解决“货源中文 + 店铺自定义英文”的跨语言异形词。
 *  - `DIMENSION_CANON` 仅用于展示层（optionParts 维度名英文一致），不参与匹配。
 *
 * 本表是“种子数据”，后续可由联邦别名知识库（③）反推扩充。
 */

/** 规范化维度名（展示一致性用，不参与匹配）。键为小写归一。 */
const DIMENSION_CANON: Record<string, string> = {
  颜色: "color",
  colour: "color",
  色: "color",
  尺码: "size",
  尺寸: "size",
  号: "size",
  码: "size",
  材质: "material",
  面料: "material",
  规格: "spec",
  类型: "type",
  风格: "style",
  图案: "pattern",
  容量: "capacity",
  净重: "weight",
  重量: "weight",
  适用: "applicable",
  适合: "suitable",
  季节: "season",
  年份: "year",
  品牌: "brand",
  型号: "model",
};

/**
 * 中文规格值 → 规范英文（空格分隔）。仅收录 alias 注册表未覆盖的常见缺口词，
 * 避免与 `spec-match.ts` 的 ALIAS_GROUPS 重复。键为小写归一。
 */
const VALUE_TRANSLATION: Record<string, string> = {
  // 颜色（缺口）
  酒红: "wine red",
  酒红色: "wine red",
  玫红: "rose red",
  玫红色: "rose red",
  橘红: "orange red",
  橘色: "orange",
  浅蓝: "light blue",
  湖蓝: "lake blue",
  天蓝: "sky blue",
  深灰: "dark gray",
  浅灰: "light gray",
  银色: "silver",
  金色: "gold",
  香槟色: "champagne",
  荧光: "neon",
  渐变: "gradient",
  拼色: "color block",
  撞色: "color block",
  印花: "print",
  条纹: "stripe",
  格纹: "plaid",
  格子: "plaid",
  波点: "polka dot",
  圆点: "polka dot",
  纯色: "solid",
  碎花: "floral",
  迷彩: "camo",
  豹纹: "leopard",
  斑马纹: "zebra",
  牛仔: "denim",
  金属色: "metallic",
  // 材质（缺口）
  麻: "linen",
  亚麻: "linen",
  雪纺: "chiffon",
  涤棉: "polycotton",
  棉麻: "cotton linen",
  氨纶: "spandex",
  莱卡: "lycra",
  莫代尔: "modal",
  天丝: "tencel",
  醋酸: "acetate",
  绒: "velvet",
  丝绒: "velvet",
  毛绒: "plush",
  灯芯绒: "corduroy",
  蕾丝: "lace",
  网纱: "mesh",
  纱: "mesh",
  真丝: "silk",
  丝: "silk",
  呢: "wool blend",
  羊毛混纺: "wool blend",
  抓绒: "fleece",
  羊绒: "cashmere",
  腈纶: "acrylic",
  // 尺码/版型（缺口）
  小号: "small",
  中号: "medium",
  大号: "large",
  迷你: "mini",
  超大: "plus size",
  加小: "petite",
  标准: "standard",
  修身: "slim",
  宽松: "loose",
  常规: "regular",
  // 袖型/领型/款式（服饰常见，帮助跨语言对齐）
  长袖: "long sleeve",
  短袖: "short sleeve",
  无袖: "sleeveless",
  七分袖: "three quarter sleeve",
  九分袖: "long sleeve",
  圆领: "round neck",
  v领: "v neck",
  立领: "mandarin collar",
  翻领: "lapel",
  高领: "turtleneck",
  半高领: "mock neck",
  套头: "pullover",
  开衫: "cardigan",
  连衣裙: "dress",
  半身裙: "skirt",
  铅笔裤: "pencil pants",
  // 鞋码
  欧码: "eu",
  美码: "us",
  英码: "uk",
  宽楦: "wide",
};

/** 规范化维度名（展示用）。 */
export function canonicalizeDimensionName(name?: string | null): string {
  if (!name?.trim()) return "spec";
  const n = name.trim().toLowerCase();
  return DIMENSION_CANON[n] ?? name.trim();
}

/**
 * 规范一个规格值。
 * - `translated`（网关 valueTrans）优先：已是目标语言。
 * - 否则用 `VALUE_TRANSLATION` 把中文翻成规范英文。
 * - 都没有则原值。
 * 返回小写去空白，与 `parseSpec` 的 norm 对齐。
 */
export function canonicalizeSpecValue(
  raw?: string | null,
  translated?: string | null
): string {
  const t = translated?.trim();
  if (t) return t.toLowerCase();
  const r = raw?.trim();
  if (!r) return "";
  const key = r.toLowerCase();
  return (VALUE_TRANSLATION[key] ?? r).toLowerCase();
}

/**
 * 规范一个完整标签（按分隔符切分后逐 token 翻译）。
 * 用于 Shopify variantLabel 等无 valueTrans 上下文的读时规范化。
 * 幂等：已是英文/已规范的值不受影响。
 * 分隔符含连字符，但"数字-数字"区间（5-10kg / 170-200斤 / 110-120cm）的连字符
 * 必须保留——否则范围会被拆断、parseSpec 误判为两个离散点（回归修复）。
 * 比 parseSpec 内部的 splitTokens 更宽，有助于英文异形词对齐（Wine-Red → wine red）。
 */
export function canonicalizeLabel(label?: string | null): string {
  if (!label?.trim()) return "";
  return label
    .split(/[\s/|,，、·:：()（）【】\[\]_]+|(?<!\d)-(?!\d)/)
    .map((tok) => {
      const t = tok.trim().toLowerCase();
      if (!t) return "";
      return VALUE_TRANSLATION[t] ?? t;
    })
    .filter(Boolean)
    .join(" ");
}
