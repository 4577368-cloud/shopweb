/**
 * 结构化 SKU 规格解析与属性无关匹配（Phase 1）
 *
 * 设计原则（不"大而全"）：类目/属性值/表达方式都是开集，但"匹配模式"是闭集。
 * 我们不为每个类目写匹配器，只维护少量**可复用机制**，靠数据播种 + 反馈成长：
 *
 *   模式          机制                         覆盖场景
 *   ─────────────────────────────────────────────────────────────
 *   alias 别名    ALIAS_GROUPS 注册表          颜色/材质/纯度/插头/宠物类型/宝石
 *   range 区间    区间重叠                     年龄/体重/身高（含单位换算）
 *   unit  换算    UNIT 换算 + 鞋码转换表        容量ml·存储GB·电压V·鞋码US/EU/mm
 *   exact 精确    identity token 判定          型号/色号（冲突即否决）
 *   fuzzy 兜底    token 重叠                    功效/风格/图案/生僻色
 *
 * 匹配"属性无关"：只对两侧共有的维度比对；一侧缺失的维度降权而非扣分；
 * 已知维度冲突（颜色不同 / 尺码无重叠 / 型号不同）直接否决为 0。
 */

import { canonicalizeLabel } from "@/lib/sku-align/spec-canon";

export type SizeSystem =
  | "letter"
  | "free"
  | "weight" // 归一「斤」
  | "age" // 归一「岁」
  | "height" // 归一「cm」
  | "volume" // 归一「ml」
  | "capacity" // 归一「GB」
  | "voltage" // 「V」
  | "shoe"; // 归一「EU 码」

export type SizeSpec =
  | { system: "letter"; code: string; ord: number }
  | { system: "free" }
  | { system: "weight"; min: number; max: number }
  | { system: "age"; min: number; max: number }
  | { system: "height"; min: number; max: number }
  | { system: "volume"; min: number; max: number }
  | { system: "capacity"; min: number; max: number }
  | { system: "voltage"; min: number; max: number }
  | { system: "shoe"; eu: number };

export interface ParsedSpec {
  raw: string;
  /** 别名归一后的属性 {类型, 规范键}，如 {color, black} / {purity, silver925}。 */
  aliases: Array<{ type: AliasType; key: string }>;
  /** 各尺码/单位体系。 */
  sizes: SizeSpec[];
  /** 精确型 token（含数字的型号/色号，如 iphone15 / 256 / 01）。 */
  identities: string[];
  /** 未归类 token（生僻色/功效/图案等），走兜底重叠。 */
  custom: string[];
}

// ── 归一化基础 ─────────────────────────────────────────────
function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}
function splitTokens(label: string): string[] {
  return label.split(/[\s/|,，、·:：()（）【】\[\]]+/).map(norm).filter(Boolean);
}

// ── alias 别名注册表（新类目 = 往这里加数据，不改代码） ─────
export type AliasType =
  | "color"
  | "material"
  | "purity"
  | "plug"
  | "petType"
  | "gemstone"
  | "style";

/** conflict: reject=同型冲突整体否决；penalize=冲突仅该维度 0 分。 */
const ALIAS_TYPE_CFG: Record<AliasType, { weight: number; conflict: "reject" | "penalize" }> = {
  color: { weight: 0.5, conflict: "reject" },
  purity: { weight: 0.5, conflict: "reject" },
  plug: { weight: 0.4, conflict: "reject" },
  petType: { weight: 0.4, conflict: "reject" },
  material: { weight: 0.3, conflict: "penalize" },
  gemstone: { weight: 0.3, conflict: "penalize" },
  style: { weight: 0.2, conflict: "penalize" },
};

const ALIAS_GROUPS: Array<{ type: AliasType; key: string; aliases: string[] }> = [
  // 颜色（服装/美妆/箱包/鞋 通用）
  { type: "color", key: "red", aliases: ["红", "红色", "大红", "red", "rouge", "rojo"] },
  { type: "color", key: "blue", aliases: ["蓝", "蓝色", "宝蓝", "blue", "bleu", "azul"] },
  { type: "color", key: "navy", aliases: ["藏青", "藏蓝", "深蓝", "navy"] },
  { type: "color", key: "green", aliases: ["绿", "绿色", "军绿", "green", "vert"] },
  { type: "color", key: "yellow", aliases: ["黄", "黄色", "yellow", "jaune"] },
  { type: "color", key: "black", aliases: ["黑", "黑色", "纯黑", "black", "jetblack", "noir"] },
  { type: "color", key: "white", aliases: ["白", "白色", "white", "blanc", "blanco"] },
  { type: "color", key: "purple", aliases: ["紫", "紫色", "purple", "violet"] },
  { type: "color", key: "pink", aliases: ["粉", "粉色", "粉红", "pink", "rose"] },
  { type: "color", key: "gray", aliases: ["灰", "灰色", "gray", "grey", "gris"] },
  { type: "color", key: "orange", aliases: ["橙", "橙色", "orange"] },
  { type: "color", key: "brown", aliases: ["棕", "棕色", "褐色", "咖色", "咖啡色", "brown", "cafe"] },
  { type: "color", key: "beige", aliases: ["米", "米色", "米白", "杏色", "beige"] },
  { type: "color", key: "khaki", aliases: ["卡其", "khaki"] },
  // 材质（服装/箱包/珠宝）
  { type: "material", key: "genuineLeather", aliases: ["真皮", "头层牛皮", "牛皮", "genuineleather", "leather"] },
  { type: "material", key: "puLeather", aliases: ["pu", "人造革", "仿皮", "pu皮", "puleather", "faux"] },
  { type: "material", key: "canvas", aliases: ["帆布", "canvas"] },
  { type: "material", key: "nylon", aliases: ["尼龙", "nylon"] },
  { type: "material", key: "cotton", aliases: ["纯棉", "棉", "cotton"] },
  { type: "material", key: "polyester", aliases: ["涤纶", "聚酯", "polyester"] },
  { type: "material", key: "wool", aliases: ["羊毛", "wool"] },
  { type: "material", key: "silicone", aliases: ["硅胶", "silicone"] },
  { type: "material", key: "stainless", aliases: ["不锈钢", "stainlesssteel", "stainless"] },
  { type: "material", key: "ceramic", aliases: ["陶瓷", "ceramic"] },
  // 纯度（珠宝）
  { type: "purity", key: "silver925", aliases: ["925", "925银", "925silver", "s925", "纯银", "sterlingsilver"] },
  { type: "purity", key: "silver999", aliases: ["999", "999银", "足银", "999silver"] },
  { type: "purity", key: "gold18k", aliases: ["18k", "18k金", "18kgold", "au750", "750"] },
  { type: "purity", key: "gold14k", aliases: ["14k", "14k金", "14kgold"] },
  { type: "purity", key: "gold24k", aliases: ["24k", "24k金", "足金", "黄金", "gold"] },
  { type: "purity", key: "platinum", aliases: ["铂金", "pt950", "platinum"] },
  { type: "purity", key: "roseGold", aliases: ["玫瑰金", "rosegold"] },
  // 插头制式（电子/家电）
  { type: "plug", key: "us", aliases: ["美规", "美标", "美插", "usplug", "us"] },
  { type: "plug", key: "eu", aliases: ["欧规", "欧标", "欧插", "euplug", "eu"] },
  { type: "plug", key: "uk", aliases: ["英规", "英标", "ukplug", "uk"] },
  { type: "plug", key: "au", aliases: ["澳规", "澳标", "auplug", "au"] },
  { type: "plug", key: "cn", aliases: ["国标", "国插", "cnplug", "cn"] },
  // 宠物类型（宠物）
  { type: "petType", key: "smallDog", aliases: ["小型犬", "小狗", "smalldog"] },
  { type: "petType", key: "mediumDog", aliases: ["中型犬", "mediumdog"] },
  { type: "petType", key: "largeDog", aliases: ["大型犬", "largedog"] },
  { type: "petType", key: "dog", aliases: ["狗", "犬", "狗狗", "dog"] },
  { type: "petType", key: "cat", aliases: ["猫", "猫咪", "cat"] },
  // 宝石（珠宝）
  { type: "gemstone", key: "diamond", aliases: ["钻石", "钻", "diamond"] },
  { type: "gemstone", key: "pearl", aliases: ["珍珠", "pearl"] },
  { type: "gemstone", key: "crystal", aliases: ["水晶", "crystal"] },
  { type: "gemstone", key: "zircon", aliases: ["锆石", "zircon", "cz"] },
  { type: "gemstone", key: "jade", aliases: ["翡翠", "玉", "jade"] },
];

const ALIAS_TOKEN_MAP = new Map<string, { type: AliasType; key: string }>();
for (const g of ALIAS_GROUPS) {
  for (const a of g.aliases) {
    const t = norm(a);
    // 首个占位者优先；插头 us/eu/uk 等短码可能与其它冲突，靠上下文正则先消费
    if (!ALIAS_TOKEN_MAP.has(t)) ALIAS_TOKEN_MAP.set(t, { type: g.type, key: g.key });
  }
}

// ── L2 letter 尺码 & 均码 ──────────────────────────────────
const LETTER_SIZES: Array<{ code: string; ord: number; aliases: string[] }> = [
  { code: "xs", ord: 1, aliases: ["xs", "特小", "xsmall"] },
  { code: "s", ord: 2, aliases: ["s", "小", "小码", "small"] },
  { code: "m", ord: 3, aliases: ["m", "中", "中码", "medium"] },
  { code: "l", ord: 4, aliases: ["l", "大", "大码", "large"] },
  { code: "xl", ord: 5, aliases: ["xl", "1xl", "加大", "xlarge"] },
  { code: "xxl", ord: 6, aliases: ["xxl", "2xl", "加加大"] },
  { code: "xxxl", ord: 7, aliases: ["xxxl", "3xl", "加加加大"] },
  { code: "xxxxl", ord: 8, aliases: ["xxxxl", "4xl"] },
  { code: "xxxxxl", ord: 9, aliases: ["xxxxxl", "5xl"] },
];
const LETTER_TOKEN_TO_SIZE = new Map<string, { code: string; ord: number }>();
for (const s of LETTER_SIZES) {
  for (const a of s.aliases) LETTER_TOKEN_TO_SIZE.set(norm(a), { code: s.code, ord: s.ord });
}
const FREE_TOKENS = new Set(["均码", "均", "onesize", "free", "统一码", "均一码"].map(norm));

// ── 单位换算 ───────────────────────────────────────────────
function toJin(v: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "斤") return v;
  if (u === "公斤" || u === "千克" || u === "kg") return v * 2;
  if (u === "磅" || u === "lb" || u === "lbs") return v * 0.9072;
  return v;
}
function toMl(v: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "ml" || u === "毫升") return v;
  if (u === "l" || u === "升") return v * 1000;
  if (u === "oz" || u === "盎司") return v * 29.5735;
  return v;
}
function toGb(v: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "gb" || u === "g") return v;
  if (u === "tb" || u === "t") return v * 1024;
  if (u === "mb") return v / 1024;
  return v;
}
/** 鞋码统一到 EU（近似）。 */
function shoeToEu(system: string, value: number): number {
  const s = system.toLowerCase();
  if (s === "eu" || s === "码") return value;
  if (s === "us") return value + 33; // 男码近似（US9≈EU42）
  if (s === "uk") return value + 34; // UK8≈EU42
  if (s === "mm") return Math.round((value / 6.6 + 2.2) * 2) / 2; // 265mm≈EU42
  return value;
}
const STORAGE_SET = new Set([2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]);

// ── 区间抽取正则 ───────────────────────────────────────────
const RANGE = "(\\d+(?:\\.\\d+)?)\\s*[-~～－—到至]\\s*(\\d+(?:\\.\\d+)?)";
const WEIGHT_RANGE = new RegExp(`${RANGE}\\s*(公斤|千克|kg|斤|磅|lbs|lb)`, "gi");
const WEIGHT_ONE = /(\d+(?:\.\d+)?)\s*(公斤|千克|kg|斤|磅|lbs|lb)/gi;
const AGE_RANGE = new RegExp(`${RANGE}\\s*(周?岁|个?月|岁|y|years?|months?)`, "gi");
const AGE_ONE = /(\d+(?:\.\d+)?)\s*(周?岁|个?月|岁|years?|months?)/gi;
const HEIGHT_RANGE = new RegExp(`${RANGE}\\s*(cm|厘米|公分)`, "gi");
const HEIGHT_ONE = /(\d+(?:\.\d+)?)\s*(cm|厘米|公分)/gi;
const VOLUME_ONE = /(\d+(?:\.\d+)?)\s*(ml|毫升|oz|盎司|l|升)\b/gi;
const CAPACITY_ONE = /(\d+(?:\.\d+)?)\s*(tb|gb|mb)\b/gi;
const CAPACITY_G = /(\d+)\s*g\b/gi; // 裸 g 仅当命中常见存储档
const VOLTAGE_ONE = /(\d{2,3})\s*v\b/gi;
const SHOE_SYS = /\b(us|uk|eu)\s*(\d{1,2}(?:\.\d)?)/gi;
const SHOE_MM = /(\d{3})\s*mm/gi;
const SHOE_MA = /(\d{2})\s*码/gi;

/** 解析规格标签为结构化属性。 */
export function parseSpec(label: string | null | undefined): ParsedSpec {
  const raw = (label ?? "").trim();
  const sizes: SizeSpec[] = [];
  let working = raw;

  // fn 显式返回 false 时保留该匹配（不从 working 移除），交给后续阶段处理
  const consume = (re: RegExp, fn: (m: RegExpExecArray) => unknown) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    const hits: string[] = [];
    while ((m = re.exec(working)) !== null) {
      if (fn(m) !== false) hits.push(m[0]);
    }
    for (const s of hits) working = working.replace(s, " ");
  };

  const isMonth = (u: string) => /月|month/i.test(u);
  // 区间优先，避免单值正则吃掉区间端点
  consume(WEIGHT_RANGE, (m) =>
    sizes.push({ system: "weight", min: toJin(+m[1], m[3]), max: toJin(+m[2], m[3]) })
  );
  consume(AGE_RANGE, (m) => {
    const f = isMonth(m[3]) ? 1 / 12 : 1;
    sizes.push({ system: "age", min: +m[1] * f, max: +m[2] * f });
  });
  consume(HEIGHT_RANGE, (m) => sizes.push({ system: "height", min: +m[1], max: +m[2] }));
  consume(SHOE_SYS, (m) => sizes.push({ system: "shoe", eu: shoeToEu(m[1], +m[2]) }));
  consume(SHOE_MM, (m) => sizes.push({ system: "shoe", eu: shoeToEu("mm", +m[1]) }));
  consume(SHOE_MA, (m) => sizes.push({ system: "shoe", eu: shoeToEu("码", +m[1]) }));
  consume(VOLUME_ONE, (m) => {
    const v = toMl(+m[1], m[2]);
    sizes.push({ system: "volume", min: v, max: v });
  });
  consume(CAPACITY_ONE, (m) => {
    const v = toGb(+m[1], m[2]);
    sizes.push({ system: "capacity", min: v, max: v });
  });
  consume(CAPACITY_G, (m) => {
    const v = +m[1];
    if (!STORAGE_SET.has(v)) return false; // 非存储档保留给 token 阶段
    sizes.push({ system: "capacity", min: v, max: v });
  });
  consume(VOLTAGE_ONE, (m) => sizes.push({ system: "voltage", min: +m[1], max: +m[1] }));
  consume(WEIGHT_ONE, (m) => {
    const v = toJin(+m[1], m[2]);
    sizes.push({ system: "weight", min: v, max: v });
  });
  consume(AGE_ONE, (m) => {
    const f = isMonth(m[2]) ? 1 / 12 : 1;
    sizes.push({ system: "age", min: +m[1] * f, max: +m[1] * f });
  });
  consume(HEIGHT_ONE, (m) => sizes.push({ system: "height", min: +m[1], max: +m[1] }));

  // 剩余 token：先做别名 n-gram 合并（"small dog"→smalldog），再逐 token 分类
  const aliases: Array<{ type: AliasType; key: string }> = [];
  const identities: string[] = [];
  const custom: string[] = [];
  const addAlias = (a: { type: AliasType; key: string }) => {
    if (!aliases.some((x) => x.type === a.type && x.key === a.key)) aliases.push(a);
  };
  const toks = splitTokens(working);
  let i = 0;
  while (i < toks.length) {
    // 别名多词优先（3→2→1 gram），避免 "small dog" 的 small 被当尺码 S
    let matched = false;
    for (let n = Math.min(3, toks.length - i); n >= 1; n--) {
      const alias = ALIAS_TOKEN_MAP.get(toks.slice(i, i + n).join(""));
      if (alias) {
        addAlias(alias);
        i += n;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const t = toks[i];
    i += 1;
    if (FREE_TOKENS.has(t)) {
      if (!sizes.some((s) => s.system === "free")) sizes.push({ system: "free" });
      continue;
    }
    const letter = LETTER_TOKEN_TO_SIZE.get(t);
    if (letter) {
      sizes.push({ system: "letter", code: letter.code, ord: letter.ord });
      continue;
    }
    if (/^\d{2}$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= 34 && n <= 48) {
        sizes.push({ system: "shoe", eu: n });
        continue;
      }
    }
    // 含数字的 token 视为精确型（型号/色号）
    if (/\d/.test(t)) {
      identities.push(t);
      continue;
    }
    custom.push(t);
  }

  return { raw, aliases, sizes, identities, custom };
}

// ── 学习别名解析器（Phase 2 反馈沉淀，可注入，保持本模块纯净可测） ──
let learnedEquiv: ((a: string, b: string) => boolean) | null = null;

/**
 * 注入"学习别名"判等函数（由 `@/lib/sku-align/learned-aliases` 在浏览器侧提供）。
 * 未注入时匹配退化为无学习增益，行为不变。
 */
export function setLearnedAliasResolver(fn: ((a: string, b: string) => boolean) | null): void {
  learnedEquiv = fn;
}

// ── 匹配打分 ───────────────────────────────────────────────
function overlapScore(
  a: { min: number; max: number },
  b: { min: number; max: number },
  opt?: { tolFrac?: number; tolAbs?: number }
): number {
  const aLo = Math.min(a.min, a.max);
  const aHi = Math.max(a.min, a.max);
  const bLo = Math.min(b.min, b.max);
  const bHi = Math.max(b.min, b.max);
  const spanA = aHi - aLo;
  const spanB = bHi - bLo;
  if (spanA === 0 && spanB === 0) {
    const diff = Math.abs(aLo - bLo);
    const ref = Math.max(aLo, bLo, 1);
    const tol = Math.max(opt?.tolAbs ?? 0, (opt?.tolFrac ?? 0) * ref);
    return diff <= tol ? 1 : 0;
  }
  const overlap = Math.min(aHi, bHi) - Math.max(aLo, bLo);
  if (overlap < 0) return 0;
  const minSpan = Math.min(spanA, spanB);
  if (minSpan <= 0) return 1; // 点落在区间内
  return Math.min(1, overlap / minSpan);
}

const SYSTEM_TOL: Partial<Record<SizeSystem, { tolFrac?: number; tolAbs?: number }>> = {
  volume: { tolFrac: 0.08 },
  capacity: { tolAbs: 0.01 },
  voltage: { tolAbs: 0 },
  weight: { tolAbs: 0 },
  age: { tolAbs: 0 },
  height: { tolAbs: 0 },
};

function bySystem(sizes: SizeSpec[]): Map<SizeSystem, SizeSpec[]> {
  const m = new Map<SizeSystem, SizeSpec[]>();
  for (const s of sizes) {
    const arr = m.get(s.system) ?? [];
    arr.push(s);
    m.set(s.system, arr);
  }
  return m;
}

/** 同体系尺码比对 0–1；冲突返回 0。 */
function scoreSizeSystem(system: SizeSystem, as: SizeSpec[], bs: SizeSpec[]): number {
  if (system === "free") return 1;
  if (system === "letter") {
    const bCodes = new Set(bs.map((s) => (s as { code: string }).code));
    return as.some((s) => bCodes.has((s as { code: string }).code)) ? 1 : 0;
  }
  if (system === "shoe") {
    let best = 0;
    for (const a of as as Array<{ eu: number }>) {
      for (const b of bs as Array<{ eu: number }>) {
        const diff = Math.abs(a.eu - b.eu);
        best = Math.max(best, diff <= 0.5 ? 1 : diff <= 1.5 ? 0.6 : 0);
      }
    }
    return best;
  }
  let best = 0;
  for (const a of as as Array<{ min: number; max: number }>) {
    for (const b of bs as Array<{ min: number; max: number }>) {
      best = Math.max(best, overlapScore(a, b, SYSTEM_TOL[system]));
    }
  }
  return best;
}

function tokenOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let hits = 0;
  for (const t of a) {
    if (setB.has(t)) hits += 1;
    else if (b.some((bt) => bt.length > 1 && (bt.startsWith(t) || t.startsWith(bt)))) hits += 1;
  }
  return hits / Math.max(a.length, b.length);
}

/** custom 兜底重叠：相等/前缀外，额外查"学习别名"（深燕麦≈燕麦色）。 */
function customOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const equiv = learnedEquiv;
  let hits = 0;
  for (const t of a) {
    if (setB.has(t)) hits += 1;
    else if (b.some((bt) => bt.length > 1 && (bt.startsWith(t) || t.startsWith(bt)))) hits += 1;
    else if (equiv && b.some((bt) => equiv(t, bt))) hits += 1;
  }
  return hits / Math.max(a.length, b.length);
}

/** 精确型 token 重叠：相等或互相包含（"15" ↔ "iphone15"）视为命中。 */
function identityOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  let hits = 0;
  for (const t of a) {
    const hit = b.some(
      (x) => x === t || (t.length >= 2 && x.length >= 2 && (x.includes(t) || t.includes(x)))
    );
    if (hit) hits += 1;
  }
  return hits / Math.max(a.length, b.length);
}

const IDENTITY_WEIGHT = 0.55;
const CUSTOM_WEIGHT = 0.2;

/**
 * 属性无关匹配：0–1。
 *  - 双方均有的维度才参与；一侧缺失 → 降权（不进分母）。
 *  - 颜色/纯度/插头/宠物类型冲突、尺码同体系无交集、型号冲突 → 直接 0（否决）。
 *  - 材质/宝石/风格冲突 → 该维度 0 分但不否决。
 *  - 无任何结构维度时退化为 token 兜底。
 */
export function scoreParsedSpec(a: ParsedSpec, b: ParsedSpec): number {
  const dims: Array<{ score: number; weight: number }> = [];

  // 别名维度：按类型分组，仅共有类型参与
  const aAlias = new Map<AliasType, Set<string>>();
  const bAlias = new Map<AliasType, Set<string>>();
  for (const x of a.aliases) (aAlias.get(x.type) ?? aAlias.set(x.type, new Set()).get(x.type)!).add(x.key);
  for (const x of b.aliases) (bAlias.get(x.type) ?? bAlias.set(x.type, new Set()).get(x.type)!).add(x.key);
  for (const [type, aKeys] of aAlias) {
    const bKeys = bAlias.get(type);
    if (!bKeys) continue; // 仅一侧有该类型 → 降权跳过
    const cfg = ALIAS_TYPE_CFG[type];
    const overlap = [...aKeys].some((k) => bKeys.has(k));
    if (overlap) dims.push({ score: 1, weight: cfg.weight });
    else if (cfg.conflict === "reject") return 0;
    else dims.push({ score: 0, weight: cfg.weight });
  }

  // 尺码维度：逐共有体系
  const aSys = bySystem(a.sizes);
  const bSys = bySystem(b.sizes);
  for (const [system, as] of aSys) {
    const bs = bSys.get(system);
    if (!bs) continue;
    const sc = scoreSizeSystem(system, as, bs);
    if (sc === 0) return 0;
    dims.push({ score: sc, weight: 0.5 });
  }

  // 精确型 identity（型号/色号）：双方均有且无交集 → 否决
  if (a.identities.length && b.identities.length) {
    const sc = identityOverlap(a.identities, b.identities);
    if (sc === 0) return 0;
    dims.push({ score: sc, weight: IDENTITY_WEIGHT });
  }

  // custom 兜底（不否决，含学习别名增益）
  if (a.custom.length || b.custom.length) {
    dims.push({ score: customOverlap(a.custom, b.custom), weight: CUSTOM_WEIGHT });
  }

  if (!dims.length) {
    return tokenOverlap(splitTokens(a.raw), splitTokens(b.raw));
  }
  const wsum = dims.reduce((s, d) => s + d.weight, 0);
  return dims.reduce((s, d) => s + d.score * d.weight, 0) / wsum;
}

/** 便捷入口：两个标签字符串 → 0–1 规格匹配分。 */
export function scoreSpecMatch(labelA: string, labelB: string): number {
  return scoreParsedSpec(parseSpec(canonicalizeLabel(labelA)), parseSpec(canonicalizeLabel(labelB)));
}
