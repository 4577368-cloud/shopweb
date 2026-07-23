#!/usr/bin/env node
/** Patch agent* namespaces with proper zh translations. */
import { readFileSync, writeFileSync } from "fs";
import { zh } from "../src/i18n/messages/zh.ts";

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== "object") target[k] = {};
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
}

const agentLogisticsZh = {
  clarifyNoIssues: "当前没有需要人工确认的问题项。",
  clarifyNoReadyPlans: "当前没有待确认的报价方案，请先完成运费预估。",
  clarifyNotImplemented: "该命令暂未实现。",
  clarifySelectProductForQuote:
    "请先在列表中点选商品，或在命令里写出商品名（如：解释「拖鞋」的报价）。",
  detailAcceptCount: "将接受 {{count}} 个已有线路报价的 SKU 方案",
  detailAcceptRecommend: "采用 AI 推荐线路，标记为已确认",
  detailApplyTemplate: "将应用当前选中的物流模板",
  detailExplainQuote: "将解释「{{title}}」的物流报价明细与依据",
  detailFetchLine1: "为每个规格向 Tangbuy 拉取线路运费",
  detailFetchLine2: "更新推荐线路与运费估算",
  detailFocusIssues: "将筛选 {{count}} 个需人工复核的项",
  detailFocusStatus: "将筛选状态为「{{status}}」的商品",
  detailOpenTemplateLine1: "打开物流模板配置抽屉",
  detailOpenTemplateLine2: "可调整包装方式、时效偏好、销售市场等",
  filterAll: "全部商品",
  filterIssues: "问题项",
  noProductSelected: "未选中商品",
  opAcceptAllReady: "批量接受方案",
  opApplyTemplate: "应用物流模板",
  opExecute: "执行命令",
  opExplainQuote: "解释报价",
  opFetchQuotes: "运费预估",
  opFocusIssues: "查看问题项",
  opFocusStatus: "聚焦状态",
  opOpenTemplate: "打开物流模板",
  productFallback: "商品 {{id}}",
  targetCurrentTemplate: "当前模板",
  targetFetchAll: "全部可报价项",
  targetIssues: "问题项",
  targetIssuesCount: "问题项 · {{count}}",
  targetPendingPlans: "待确认方案",
  targetPendingPlansCount: "待确认方案 · {{count}}",
  targetTemplateConfig: "物流模板配置",
  statusConfirmed: "已确认",
  statusNeedsReview: "需审核",
  statusPendingPostalMeta: "等待邮限",
  statusPendingSku: "等待 SKU",
  statusReadyForQuote: "可报价",
  statusRestricted: "受限",
};

const agentProductsZh = {
  actionBatchProductField: "批量{{action}}商品{{field}}",
  actionFocusProduct: "聚焦商品",
  actionLocalize: "本土化",
  actionLocalizeLang: "为 {{lang}}",
  actionOptimize: "优化",
  actionPricingStrategy: "定价策略",
  actionProductField: "{{action}}商品{{field}}",
  actionRerunCandidates: "重搜候选",
  actionRewrite: "改写",
  clarifyAlreadyStatus: "「{{title}}」已是 {{status}}，无需操作。",
  clarifyAmbiguous: "找到多个相似商品，请点选其中一个后重试：{{matches}}",
  clarifyCannotExecute: "无法执行该命令。",
  clarifyInvalidPrice: "请提供有效的 Shopify 售价，例如「改价为 9.9 美元」。",
  clarifyMissingLang: "请说明目标语言，例如「把标题翻译成英文」。",
  clarifyMissingLangBatch: "请说明目标语言，例如「把所有商品标题翻译成英文」。",
  clarifyMissingPricing:
    "请说明定价方式，例如「所有商品定价改为采购价 2 倍」或「所有商品售价改成 9.9」。",
  clarifyNoActiveInScope: "「{{label}}」范围内没有在售商品可操作。",
  clarifyNoProductsInScope: "「{{label}}」范围内没有商品，无法执行批量操作。",
  clarifyNotFound: "未找到匹配「{{hint}}」的商品，请在列表中点选或使用更完整的标题。",
  clarifyPriceOutOfRange: "售价超出允许范围，请检查金额是否正确。",
  clarifySelectForCopy:
    "请先在列表中点选目标商品（右侧会显示「已选 · 商品名」），再说「翻译这个商品标题」。",
  clarifySelectForExplain:
    "请先在列表中点选商品，或在命令里写出商品名（如：解释「拖鞋」的推荐依据）。",
  clarifySelectForFocus:
    "请先在列表中点选商品，或在命令里写出商品名（如：把「拖鞋」改价为 9.9）。",
  clarifySelectForPrice:
    "请先在列表中点选目标商品（右侧会显示「已选 · 商品名」），再说「把这个商品售价改为 22.9」。",
  clarifySelectForRerun:
    "请先在列表中点选商品，或在命令里写出商品名（如：为「拖鞋」再找更多候选）。",
  clarifySelectForStatus:
    "请先在列表中点选目标商品，或在命令里写出商品名（如：把「拖鞋」放到草稿）。",
  detailActionType: "操作类型：{{action}}",
  detailBatchCopySync: "确认后将逐个生成新标题并更新到 Shopify",
  detailBatchPriceSync: "确认后将逐个更新商品售价到 Shopify",
  detailBatchScope: "范围：{{label}}（{{count}} 个在售商品）",
  detailBatchScopeProducts: "范围：{{label}}（{{count}} 个商品）",
  detailBatchSyncShopify: "确认后将逐个同步到 Shopify",
  detailContextProduct: "当前上下文：{{title}}",
  detailCopySyncShopify: "确认后将生成新标题并更新到 Shopify",
  detailCurrentStatus: "当前状态：{{status}}",
  detailExplainReason: "将说明「{{title}}」的推荐依据",
  detailExplainRisk: "将说明「{{title}}」的不确定点",
  detailExplainThenLocate: "将先定位「{{title}}」，再解释匹配依据",
  detailFieldTarget: "目标字段：{{field}}",
  detailLocateProduct: "将在列表中定位：{{title}}",
  detailModeAmazon:
    "模式：降噪 + Amazon 结构（过滤批发/跨境/营销词，非直译）",
  detailModeLiteral: "模式：直译",
  detailNewPrice: "新售价：{{currency}} {{price}}",
  detailOpenPricing: "将打开定价策略侧栏",
  detailPriceScope: "确认时将选择要修改的规格范围（全部或某一 SKU）",
  detailPricingFixed: "定价方式：固定价格 {{price}}",
  detailPricingMultiplier: "定价方式：采购价 × {{multiplier}}",
  detailRerunSearch: "将打开图搜并为「{{title}}」加载候选",
  detailSwitchFilter: "将切换到「{{filter}}」视图",
  detailSyncShopify: "确认后将同步到 Shopify",
  detailTargetLang: "目标语言：{{lang}}",
  detailTargetStatus: "目标状态：{{status}}",
  explainMatchDetail: "将解释「{{title}}」的{{mode}}",
  fieldAll: "全部文案",
  fieldDescription: "描述",
  fieldTitle: "标题",
  filterAll: "全部商品",
  filterAllActive: "全部在售商品",
  filterConfirmed: "已确认",
  filterConfirmedProducts: "已确认商品",
  filterNewArrivals: "新入库",
  filterPending: "AI 待确认",
  filterPendingProducts: "待确认商品",
  filterUnbound: "未关联",
  filterUnboundProducts: "未匹配商品",
  matchModeReason: "推荐依据",
  matchModeRisk: "不确定点",
  noProductSelected: "未选中商品",
  opArchiveProduct: "下架归档",
  opBatchArchive: "批量下架归档",
  opBatchDraft: "批量放到草稿",
  opBatchUpdateCopy: "批量修改商品文案",
  opBatchUpdatePrice: "批量修改商品售价",
  opDraftProduct: "放到草稿",
  opExecute: "执行命令",
  opExplainMatch: "解释匹配",
  opFocusProduct: "聚焦商品",
  opOpenFilter: "切换列表筛选",
  opOpenPricing: "打开定价设置",
  opRerunSearch: "重搜候选",
  productFallback: "商品 {{id}}",
  targetUnspecifiedLang: "未指定语言",
};

function formatSection(obj, indent = "    ") {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      lines.push(`${indent}${k}: {`);
      lines.push(formatSection(v, indent + "  "));
      lines.push(`${indent}},`);
    } else {
      const escaped = JSON.stringify(String(v));
      lines.push(`${indent}${k}: ${escaped},`);
    }
  }
  return lines.join("\n");
}

function replaceSection(src, sectionName, sectionObj) {
  const re = new RegExp(`(\\n  ${sectionName}: \\{)([\\s\\S]*?)(\\n  \\},)`);
  const match = src.match(re);
  if (!match) throw new Error(`Section ${sectionName} not found`);
  const body = formatSection(sectionObj);
  return src.replace(re, `\n  ${sectionName}: {\n${body}\n  },`);
}

deepMerge(zh.agentLogistics, agentLogisticsZh);
deepMerge(zh.agentProducts, agentProductsZh);

let src = readFileSync("src/i18n/messages/zh.ts", "utf8");
src = replaceSection(src, "agentLogistics", zh.agentLogistics);
src = replaceSection(src, "agentProducts", zh.agentProducts);
writeFileSync("src/i18n/messages/zh.ts", src);
console.log("patched agent zh translations");
