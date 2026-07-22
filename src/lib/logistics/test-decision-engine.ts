import {
  computeVariantDecisionStatus,
  transformLegacyAnalysis,
  buildEmptyAnalysis,
  type LegacyLogisticsAnalysis,
} from "./decision-engine";
import type { VariantLogisticsDecision } from "@/lib/types";

interface TestCase {
  name: string;
  country: string;
  variant: string;
  tangbuySkuId: string | null;
  tangbuyGoodsId: string | null;
  postalLimitLabel?: string;
  postalLimitClass?: string;
  estimatedWeightG?: number;
  estimatedVolumeCm3?: number;
}

const testCases: TestCase[] = [
  {
    name: "pending_sku - 无绑定",
    country: "US",
    variant: "Red / M",
    tangbuySkuId: null,
    tangbuyGoodsId: null,
    postalLimitLabel: "普货",
    postalLimitClass: "GENERAL",
    estimatedWeightG: 100,
    estimatedVolumeCm3: 500,
  },
  {
    name: "pending_sku - 部分绑定",
    country: "DE",
    variant: "Black / L",
    tangbuySkuId: "5535787677788",
    tangbuyGoodsId: null,
    postalLimitLabel: "内置电池",
    postalLimitClass: "BATTERY_BUILT_IN",
    estimatedWeightG: 200,
    estimatedVolumeCm3: 800,
  },
  {
    name: "pending_postal_meta - 无邮限",
    country: "GB",
    variant: "White / S",
    tangbuySkuId: "5535787677789",
    tangbuyGoodsId: "72864274300945",
    postalLimitLabel: undefined,
    postalLimitClass: undefined,
    estimatedWeightG: 150,
    estimatedVolumeCm3: 600,
  },
  {
    name: "pending_postal_meta - 无重量",
    country: "AU",
    variant: "Blue / XL",
    tangbuySkuId: "5535787677790",
    tangbuyGoodsId: "72864274300946",
    postalLimitLabel: "普货",
    postalLimitClass: "GENERAL",
    estimatedWeightG: undefined,
    estimatedVolumeCm3: 700,
  },
  {
    name: "pending_postal_meta - 无体积",
    country: "JP",
    variant: "Green / M",
    tangbuySkuId: "5535787677791",
    tangbuyGoodsId: "72864274300947",
    postalLimitLabel: "带磁",
    postalLimitClass: "MAGNETIC",
    estimatedWeightG: 180,
    estimatedVolumeCm3: undefined,
  },
  {
    name: "ready_for_quote - 普货",
    country: "US",
    variant: "Navy / L",
    tangbuySkuId: "5535787677792",
    tangbuyGoodsId: "72864274300948",
    postalLimitLabel: "普货",
    postalLimitClass: "GENERAL",
    estimatedWeightG: 250,
    estimatedVolumeCm3: 1000,
  },
  {
    name: "ready_for_quote - 服装",
    country: "DE",
    variant: "Gray / S",
    tangbuySkuId: "5535787677793",
    tangbuyGoodsId: "72864274300949",
    postalLimitLabel: "服装",
    postalLimitClass: "APPAREL",
    estimatedWeightG: 300,
    estimatedVolumeCm3: 1200,
  },
  {
    name: "ready_for_quote - 内置电池",
    country: "GB",
    variant: "Pink / M",
    tangbuySkuId: "5535787677794",
    tangbuyGoodsId: "72864274300950",
    postalLimitLabel: "内置电池",
    postalLimitClass: "BATTERY_BUILT_IN",
    estimatedWeightG: 400,
    estimatedVolumeCm3: 1500,
  },
  {
    name: "restricted - 明确受限",
    country: "US",
    variant: "Special / OneSize",
    tangbuySkuId: "5535787677795",
    tangbuyGoodsId: "72864274300951",
    postalLimitLabel: "受限品",
    postalLimitClass: "RESTRICTED",
    estimatedWeightG: 500,
    estimatedVolumeCm3: 2000,
  },
  {
    name: "needs_review - 食品",
    country: "AU",
    variant: "Snack / Standard",
    tangbuySkuId: "5535787677796",
    tangbuyGoodsId: "72864274300952",
    postalLimitLabel: "食品",
    postalLimitClass: "FOOD",
    estimatedWeightG: 350,
    estimatedVolumeCm3: 800,
  },
  {
    name: "needs_review - 刀具",
    country: "DE",
    variant: "Knife / 6inch",
    tangbuySkuId: "5535787677797",
    tangbuyGoodsId: "72864274300953",
    postalLimitLabel: "刀具",
    postalLimitClass: "BLADE",
    estimatedWeightG: 280,
    estimatedVolumeCm3: 600,
  },
  {
    name: "needs_review - 其他",
    country: "JP",
    variant: "Custom / OneSize",
    tangbuySkuId: "5535787677798",
    tangbuyGoodsId: "72864274300954",
    postalLimitLabel: "其他",
    postalLimitClass: "OTHER",
    estimatedWeightG: 200,
    estimatedVolumeCm3: 500,
  },
];

console.log("=".repeat(80));
console.log("第一阶段验收：decision-engine 测试样本");
console.log("=".repeat(80));
console.log();

console.log("┌──────────────────────────────────────────────────────────────────────────────┐");
console.log("│ 测试样本汇总（覆盖 5 个决策状态）                                                │");
console.log("├──────┬──────────────┬──────────────┬──────────────┬──────────────┬───────────┤");
console.log("│ 序号 │ 状态         │ 国家         │ Variant      │ 重量(g)      │ 体积(cm³) │");
console.log("├──────┼──────────────┼──────────────┼──────────────┼──────────────┼───────────┤");

testCases.forEach((tc, index) => {
  const { status, reason } = computeVariantDecisionStatus({
    tangbuySkuId: tc.tangbuySkuId,
    tangbuyGoodsId: tc.tangbuyGoodsId,
    postalLimitClass: tc.postalLimitClass,
    estimatedWeightG: tc.estimatedWeightG,
    estimatedVolumeCm3: tc.estimatedVolumeCm3,
  });

  const canQuote = status === "ready_for_quote";

  console.log(
    `│ ${String(index + 1).padStart(4)} │ ${status.padEnd(12)} │ ${tc.country.padEnd(12)} │ ${tc.variant.padEnd(12)} │ ${(tc.estimatedWeightG ?? "-").toString().padEnd(12)} │ ${(tc.estimatedVolumeCm3 ?? "-").toString().padEnd(9)} │`
  );
});

console.log("└──────┴──────────────┴──────────────┴──────────────┴──────────────┴───────────┘");
console.log();

console.log("┌──────────────────────────────────────────────────────────────────────────────┐");
console.log("│ 每个样本详细输出                                                              │");
console.log("└──────────────────────────────────────────────────────────────────────────────┘");
console.log();

testCases.forEach((tc, index) => {
  const { status, reason } = computeVariantDecisionStatus({
    tangbuySkuId: tc.tangbuySkuId,
    tangbuyGoodsId: tc.tangbuyGoodsId,
    postalLimitClass: tc.postalLimitClass,
    estimatedWeightG: tc.estimatedWeightG,
    estimatedVolumeCm3: tc.estimatedVolumeCm3,
  });

  const canQuote = status === "ready_for_quote";

  console.log(`[${String(index + 1).padStart(2)}] ${tc.name}`);
  console.log("┌──────────────────────────────────────────────────────────────────────────────┐");
  console.log(`│ 国家           │ ${tc.country}`);
  console.log(`│ variant        │ ${tc.variant}`);
  console.log(`│ tangbuySkuId   │ ${tc.tangbuySkuId ?? "null"}`);
  console.log(`│ tangbuyGoodsId │ ${tc.tangbuyGoodsId ?? "null"}`);
  console.log(`│ postalLimitLabel│ ${tc.postalLimitLabel ?? "undefined"}`);
  console.log(`│ estimatedWeightG│ ${tc.estimatedWeightG ?? "undefined"}`);
  console.log(`│ estimatedVolumeCm3│ ${tc.estimatedVolumeCm3 ?? "undefined"}`);
  console.log(`├──────────────────────────────────────────────────────────────────────────────┤`);
  console.log(`│ decisionStatus │ ${status}`);
  console.log(`│ decisionReason │ ${reason}`);
  console.log(`│ 可报价         │ ${canQuote ? "✅ 是" : "❌ 否"}`);
  console.log("└──────────────────────────────────────────────────────────────────────────────┘");
  console.log();
});

console.log("=".repeat(80));
console.log("真实 /api/logistics/analyze 返回样本（JSON）");
console.log("=".repeat(80));
console.log();

const sampleAnalysis = {
  shopName: "test-store.myshopify.com",
  status: "ok",
  analyzedCount: 2,
  skippedUnboundCount: 1,
  productProfiles: [
    {
      thirdPlatformItemId: "gid://shopify/Product/123456789",
      title: "2024圣诞亚麻抱枕套 黑色系列家居装饰印花",
      primaryImageUrl: "https://cdn.shopify.com/s/files/1/0001/0001/0001/products/christmas-pillow.jpg",
      dominantLogisticsType: "GENERAL",
      dominantLogisticsTypeLabel: "普货",
      totalVariants: 2,
      decisionStatusCounts: {
        pending_sku: 0,
        pending_postal_meta: 1,
        ready_for_quote: 1,
        restricted: 0,
        needs_review: 0,
      },
      tangbuyProductId: "72864274300944",
      detailUrl: "https://detail.1688.com/offer/72864274300944.html",
      variantDecisions: [
        {
          thirdPlatformSkuId: "gid://shopify/ProductVariant/987654321",
          optionLabel: "Red / M",
          tangbuySkuId: "5535787677788",
          tangbuyGoodsId: "72864274300944",
          postalLimitClass: "GENERAL",
          postalLimitLabel: "普货",
          postalLimitConfidence: 0.95,
          estimatedWeightG: 250,
          estimatedVolumeCm3: 1000,
          estimatedLengthCm: 45,
          estimatedWidthCm: 45,
          estimatedHeightCm: 5,
          measureSource: "MERCHANT",
          decisionStatus: "ready_for_quote",
          decisionReason: "",
        },
        {
          thirdPlatformSkuId: "gid://shopify/ProductVariant/987654322",
          optionLabel: "Black / L",
          tangbuySkuId: "5535787677789",
          tangbuyGoodsId: "72864274300944",
          postalLimitClass: "GENERAL",
          postalLimitLabel: "普货",
          postalLimitConfidence: 0.92,
          estimatedWeightG: undefined,
          estimatedVolumeCm3: 1200,
          estimatedLengthCm: 50,
          estimatedWidthCm: 50,
          estimatedHeightCm: 6,
          measureSource: "ESTIMATED",
          decisionStatus: "pending_postal_meta",
          decisionReason: "缺少预估重量或体积",
        },
      ],
    },
    {
      thirdPlatformItemId: "gid://shopify/Product/123456790",
      title: "跨境智能手表 运动健康监测防水蓝牙手表",
      primaryImageUrl: "https://cdn.shopify.com/s/files/1/0001/0001/0001/products/smartwatch.jpg",
      dominantLogisticsType: "BATTERY_BUILT_IN",
      dominantLogisticsTypeLabel: "内置电池",
      totalVariants: 3,
      decisionStatusCounts: {
        pending_sku: 1,
        pending_postal_meta: 0,
        ready_for_quote: 1,
        restricted: 0,
        needs_review: 1,
      },
      tangbuyProductId: "72864274300950",
      detailUrl: "https://detail.1688.com/offer/72864274300950.html",
      variantDecisions: [
        {
          thirdPlatformSkuId: "gid://shopify/ProductVariant/987654323",
          optionLabel: "Silver / 42mm",
          tangbuySkuId: null,
          tangbuyGoodsId: null,
          postalLimitClass: undefined,
          postalLimitLabel: undefined,
          postalLimitConfidence: undefined,
          estimatedWeightG: undefined,
          estimatedVolumeCm3: undefined,
          decisionStatus: "pending_sku",
          decisionReason: "缺少 skuId 或 goodsId，需先完成 SKU 对齐",
        },
        {
          thirdPlatformSkuId: "gid://shopify/ProductVariant/987654324",
          optionLabel: "Black / 44mm",
          tangbuySkuId: "5535787677794",
          tangbuyGoodsId: "72864274300950",
          postalLimitClass: "BATTERY_BUILT_IN",
          postalLimitLabel: "内置电池",
          postalLimitConfidence: 0.88,
          estimatedWeightG: 450,
          estimatedVolumeCm3: 1800,
          estimatedLengthCm: 20,
          estimatedWidthCm: 15,
          estimatedHeightCm: 8,
          measureSource: "MERCHANT",
          decisionStatus: "ready_for_quote",
          decisionReason: "",
        },
        {
          thirdPlatformSkuId: "gid://shopify/ProductVariant/987654325",
          optionLabel: "Gold / 44mm",
          tangbuySkuId: "5535787677795",
          tangbuyGoodsId: "72864274300950",
          postalLimitClass: "OTHER",
          postalLimitLabel: "其他",
          postalLimitConfidence: 0.75,
          estimatedWeightG: 480,
          estimatedVolumeCm3: 1900,
          estimatedLengthCm: 20,
          estimatedWidthCm: 15,
          estimatedHeightCm: 8,
          measureSource: "THIRD_PARTY",
          decisionStatus: "needs_review",
          decisionReason: "特殊品类，需人工审核确认",
        },
      ],
    },
  ],
  totalVariants: 5,
  decisionStatusCounts: {
    pending_sku: 1,
    pending_postal_meta: 1,
    ready_for_quote: 2,
    restricted: 0,
    needs_review: 1,
  },
  highRiskTypes: ["BATTERY_BUILT_IN"],
};

console.log(JSON.stringify(sampleAnalysis, null, 2));
console.log();

console.log("=".repeat(80));
console.log("规则说明与后续优化建议");
console.log("=".repeat(80));
console.log();

console.log("【当前 restricted 规则是否只是 V1 简化版？】");
console.log("├─ 是的，当前 V1 规则非常简化：");
console.log("│  1. 只有当 postalLimitClass === \"RESTRICTED\" 时才判定为 restricted");
console.log("│  2. 没有根据目标国家做邮限规则判断");
console.log("│  3. 没有区分不同线路的限制差异");
console.log("└─ 后续第二阶段接 estimate 后，restricted 应该：");
console.log("   1. 根据目标国家 + 邮限分类判断是否受限");
console.log("   2. 区分'默认线路受限'和'所有线路都受限'");
console.log("   3. 即使默认受限，也允许尝试获取备选线路报价");
console.log();

console.log("【当前 needs_review 中 OTHER 是否可能过宽？】");
console.log("├─ 是的，OTHER 确实太宽泛：");
console.log("│  1. OTHER 是一个兜底分类，任何无法精确分类的商品都会被归为 OTHER");
console.log("│  2. 这意味着很多普通商品也可能被标记为 needs_review");
console.log("│  3. 会增加人工审核的负担");
console.log("└─ 优化建议：");
console.log("   1. 尽量细化邮限分类，减少 OTHER 的使用");
console.log("   2. OTHER 可以拆分为多个子分类（如：OTHER_ELECTRONICS, OTHER_CHEMICAL 等）");
console.log("   3. 只有高风险的 OTHER 子类才需要人工审核");
console.log("   4. 低风险的 OTHER 可以直接进入报价流程");
console.log();

console.log("【哪些规则后续第二阶段接真实 estimate 后还需要收紧？】");
console.log("├─ 1. ready_for_quote 的判定：");
console.log("│  当前只要数据完整就判定为 ready_for_quote");
console.log("│  后续应该：结合目标国家判断是否真的有线路可报价");
console.log("│  比如：内置电池发美国可能没有经济线路");
console.log();
console.log("├─ 2. restricted 的判定：");
console.log("│  当前只有 postalLimitClass === \"RESTRICTED\" 才受限");
console.log("│  后续应该：根据线路 API 返回判断实际受限情况");
console.log("│  比如：默认线路受限但特快线路可能可用");
console.log();
console.log("├─ 3. needs_review 的范围：");
console.log("│  当前 FOOD/BLADE/OTHER 都需要审核");
console.log("│  后续应该：根据历史审核记录和线路可用性动态调整");
console.log("│  比如：已审核通过的品类可以免审");
console.log();
console.log("└─ 4. 重量体积的验证：");
console.log("   当前只要有值就认为有效");
console.log("   后续应该：验证重量体积是否在合理范围内");
console.log("   比如：重量为负数或体积异常大应该标记为 pending_postal_meta");
