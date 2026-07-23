/**
 * spec-match 手动验证脚本
 * 运行：npx tsx src/lib/sku-align/test-spec-match.ts
 */
import { parseSpec, scoreSpecMatch } from "./spec-match";

interface Case {
  name: string;
  a: string;
  b: string;
  /** 期望区间 [min, max]（含端点）。 */
  expect: [number, number];
}

const cases: Case[] = [
  // ── 应高分（视为同款） ──
  { name: "letter 精确", a: "黑色 / M", b: "黑色 / 中码", expect: [0.99, 1] },
  { name: "颜色跨语言", a: "Black / L", b: "黑色 / 大码", expect: [0.99, 1] },
  { name: "体重区间完全一致", a: "深灰 / XL（170-200斤）", b: "深灰 / XL 170-200斤", expect: [0.99, 1] },
  { name: "体重区间子集", a: "黑色 170-200斤", b: "黑色 175-195斤", expect: [0.99, 1] },
  { name: "体重区间大部分重叠", a: "黑色 170-200斤", b: "黑色 180-210斤", expect: [0.5, 0.95] },
  { name: "年龄区间重叠", a: "蓝色 6-8岁", b: "蓝色 6-8Y", expect: [0.99, 1] },
  { name: "公斤↔斤 单位换算", a: "白色 50-60kg", b: "白色 100-120斤", expect: [0.99, 1] },
  { name: "身高 cm 区间", a: "粉色 110-120cm", b: "粉色 110cm", expect: [0.99, 1] },
  { name: "均码", a: "红色 均码", b: "红色 onesize", expect: [0.99, 1] },
  { name: "生僻色 token 兜底(同名)", a: "深燕麦 / XL", b: "深燕麦 / XL", expect: [0.99, 1] },
  { name: "鞋码 numeric", a: "黑色 42码", b: "黑色 42", expect: [0.99, 1] },
  { name: "一侧缺尺码只比颜色", a: "黑色", b: "黑色 / M", expect: [0.99, 1] },

  // ── 应低分/否决（不同款） ──
  { name: "颜色冲突否决", a: "黑色 / M", b: "白色 / M", expect: [0, 0.01] },
  { name: "letter 冲突否决", a: "黑色 / M", b: "黑色 / XXL", expect: [0, 0.01] },
  { name: "体重区间无重叠否决", a: "黑色 100-130斤", b: "黑色 170-200斤", expect: [0, 0.01] },
  { name: "年龄区间无重叠否决", a: "蓝色 2-3岁", b: "蓝色 10-12岁", expect: [0, 0.01] },
  { name: "生僻色不同(仅custom低分)", a: "深燕麦 / XL", b: "浅咖 / XL", expect: [0.3, 0.75] },

  // ── 美妆 Beauty ──
  { name: "美妆 容量 ml↔oz", a: "补水 30ml", b: "补水 1oz", expect: [0.99, 1] },
  { name: "美妆 容量冲突否决", a: "精华 30ml", b: "精华 100ml", expect: [0, 0.01] },
  { name: "美妆 色号精确", a: "口红 01号", b: "口红 01", expect: [0.99, 1] },
  { name: "美妆 色号不同否决", a: "口红 01", b: "口红 02", expect: [0, 0.01] },

  // ── 珠宝 Jewelry ──
  { name: "珠宝 925纯银", a: "925 Silver 戒指", b: "纯银 戒指", expect: [0.7, 1] },
  { name: "珠宝 18K金", a: "18K Gold", b: "18k金", expect: [0.99, 1] },
  { name: "珠宝 纯度冲突否决", a: "925银", b: "18K金", expect: [0, 0.01] },
  { name: "珠宝 宝石+纯度", a: "925银 钻石", b: "纯银 diamond", expect: [0.99, 1] },

  // ── 电子 Electronics ──
  { name: "电子 型号一致", a: "iPhone 15", b: "iphone15", expect: [0.7, 1] },
  { name: "电子 型号冲突否决", a: "iPhone 15", b: "iPhone 14", expect: [0, 0.01] },
  { name: "电子 容量 256G=256GB", a: "黑色 256G", b: "黑色 256GB", expect: [0.99, 1] },
  { name: "电子 容量冲突否决", a: "256GB", b: "128GB", expect: [0, 0.01] },
  { name: "电子 插头制式", a: "充电器 US Plug", b: "充电器 美规", expect: [0.7, 1] },
  { name: "电子 电压冲突否决", a: "110V", b: "220V", expect: [0, 0.01] },

  // ── 宠物 Pet ──
  { name: "宠物 小型犬", a: "Small Dog 牵引绳", b: "小型犬 牵引绳", expect: [0.7, 1] },
  { name: "宠物 体重 kg↔斤", a: "狗窝 5-10kg", b: "狗窝 10-20斤", expect: [0.99, 1] },
  { name: "宠物 类型冲突否决", a: "猫 用品", b: "狗 用品", expect: [0, 0.01] },

  // ── 鞋 Shoes ──
  { name: "鞋 US9=EU42", a: "黑色 US9", b: "黑色 EU42", expect: [0.99, 1] },
  { name: "鞋 EU42=265mm", a: "白色 EU42", b: "白色 265mm", expect: [0.6, 1] },
  { name: "鞋 码=EU", a: "红色 42码", b: "红色 EU42", expect: [0.99, 1] },
  { name: "鞋 尺码冲突否决", a: "黑色 EU42", b: "黑色 EU38", expect: [0, 0.01] },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const score = scoreSpecMatch(c.a, c.b);
  const ok = score >= c.expect[0] - 1e-9 && score <= c.expect[1] + 1e-9;
  if (ok) pass += 1;
  else fail += 1;
  const tag = ok ? "✓" : "✗";
  console.log(
    `${tag} ${c.name.padEnd(24)} score=${score.toFixed(3)} expect=[${c.expect[0]}, ${c.expect[1]}]`
  );
  if (!ok) {
    console.log(`    A=${JSON.stringify(parseSpec(c.a))}`);
    console.log(`    B=${JSON.stringify(parseSpec(c.b))}`);
  }
}

// ── Phase 2：学习别名 ──────────────────────────────────────
import { deriveAliasPairs, isLearnedEquivalent, recordBinding } from "./learned-aliases";
import { setLearnedAliasResolver } from "./spec-match";

console.log("\n" + "-".repeat(60));
console.log("Phase 2 学习别名");

// deriveAliasPairs: 两侧各剩 1 个 custom → 学习；否则不学
const d1 = deriveAliasPairs("深燕麦 / XL", "燕麦色 / XL");
const d1ok = d1.length === 1 && d1[0][0] === "深燕麦" && d1[0][1] === "燕麦色";
console.log(`${d1ok ? "✓" : "✗"} deriveAliasPairs 单残差学习      ${JSON.stringify(d1)}`);

const d2 = deriveAliasPairs("黑色 / M", "黑色 / 中码"); // 无残差 custom
const d2ok = d2.length === 0;
console.log(`${d2ok ? "✓" : "✗"} deriveAliasPairs 无残差不学      ${JSON.stringify(d2)}`);

const d3 = deriveAliasPairs("深燕麦 复古 / XL", "燕麦色 / XL"); // A 剩 2 个 → 不学
const d3ok = d3.length === 0;
console.log(`${d3ok ? "✓" : "✗"} deriveAliasPairs 多残差不学      ${JSON.stringify(d3)}`);

// 注入 resolver 前：深燕麦 vs 燕麦色 仅 custom 0 分（尺码相同）
setLearnedAliasResolver(isLearnedEquivalent);
const before = scoreSpecMatch("深燕麦 / XL", "燕麦色 / XL");
recordBinding("深燕麦 / XL", "燕麦色 / XL"); // 人工绑定 → 学习
const after = scoreSpecMatch("深燕麦 / XL", "燕麦色 / XL");
const boostOk = after > before && after > 0.99;
console.log(
  `${boostOk ? "✓" : "✗"} 学习后 custom 提升             before=${before.toFixed(3)} after=${after.toFixed(3)}`
);

const phase2Fail = [d1ok, d2ok, d3ok, boostOk].filter((x) => !x).length;
fail += phase2Fail;
pass += 4 - phase2Fail;

// ── Phase 3：灰区 LLM 纯函数 ───────────────────────────────
import {
  GRAY_LOW,
  GRAY_HIGH,
  grayZoneRows,
  blendSpecWithLlm,
  applyLlmToRanked,
  pairKey,
  isCrossScript,
} from "./spec-match-llm";
import type { SourceSkuRowRanked } from "@/lib/source-sku-matrix";

console.log("\n" + "-".repeat(60));
console.log("Phase 3 灰区 LLM 纯函数");

const mkRow = (specLabel: string, specScore: number): SourceSkuRowRanked => ({
  skuId: specLabel,
  specLabel,
  optionParts: [],
  imageUrl: null,
  procurementPrice: null,
  amountOnSale: null,
  matchScore: specScore * 0.7,
  specScore,
  priceScore: 0,
});

const rankedFixture = [mkRow("A", 0.95), mkRow("B", 0.7), mkRow("C", 0.6), mkRow("D", 0.3)];
// 常规灰区：非跨脚本变体只取 [GRAY_LOW, GRAY_HIGH) → B,C
const gz = grayZoneRows("Wine Red / M", rankedFixture);
const gzOk =
  gz.length === 2 && gz.every((r) => r.specScore >= GRAY_LOW && r.specScore < GRAY_HIGH);
console.log(`${gzOk ? "✓" : "✗"} grayZoneRows 只取灰区          ${gz.map((r) => r.skuId).join(",")}`);

// 跨脚本长尾：中文变体 + 0.3 行（D）应被纳入 LLM 复核
const gzCross = grayZoneRows("酒红 / XL", rankedFixture);
const crossOk =
  gzCross.some((r) => r.skuId === "D" && r.specScore === 0.3) &&
  gzCross.filter((r) => r.specScore < GRAY_LOW).length === 1;
console.log(`${crossOk ? "✓" : "✗"} 跨脚本长尾接住 D(0.3)       ${gzCross.map((r) => r.skuId).join(",")}`);

const crossDetectOk =
  isCrossScript("Wine Red / M", "酒红 / XL") && // 中↔英
  !isCrossScript("Wine Red / M", "Oatmeal / M") && // 同脚本
  !isCrossScript("酒红 / XL", "藏青 / L"); // 同脚本
console.log(`${crossDetectOk ? "✓" : "✗"} isCrossScript 判定          中↔英=跨, 同脚本=否`);

const blendUp = blendSpecWithLlm(0.6, 0.95); // LLM 高 → 抬升
const blendDown = blendSpecWithLlm(0.7, 0.1); // LLM 低 → 下压
const blendOk = blendUp > 0.6 && blendDown < 0.7;
console.log(`${blendOk ? "✓" : "✗"} blendSpecWithLlm 抬升/下压     up=${blendUp.toFixed(3)} down=${blendDown.toFixed(3)}`);

// LLM 把灰区 C(0.6) 判为高置信 → 重排应超过 B(0.7)
const llmByKey = { [pairKey("变体", "C")]: 0.98, [pairKey("变体", "B")]: 0.2 };
const reranked = applyLlmToRanked("变体", rankedFixture, llmByKey);
const rerankOk = reranked[0].skuId === "A" && reranked[1].skuId === "C";
console.log(`${rerankOk ? "✓" : "✗"} applyLlmToRanked 重排           ${reranked.map((r) => r.skuId).join(",")}`);

const phase3Fail = [gzOk, crossOk, crossDetectOk, blendOk, rerankOk].filter((x) => !x).length;
fail += phase3Fail;
pass += 5 - phase3Fail;

console.log("\n" + "=".repeat(60));
console.log(`结果: ${pass} 通过 / ${fail} 失败 / 共 ${cases.length + 4 + 3}`);
if (fail > 0) process.exitCode = 1;
