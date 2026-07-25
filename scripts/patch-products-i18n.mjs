#!/usr/bin/env node
/**
 * Restore products-related i18n blocks corrupted by generate-missing-i18n pairing.
 * Fixes: agentProducts, productsActiveTask, productsSourcing, productsPricing
 * Run: node scripts/patch-products-i18n.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["en", "zh", "fr", "es"];
const BLOCK_NAMES = [
  "agentProducts",
  "agentSku",
  "productsActiveTask",
  "productsSourcing",
  "productsPricing",
  "productsPreview",
];

function formatValue(value, indent = 1) {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{\n${entries
      .map(([k, v]) => `${padIn}${k}: ${formatValue(v, indent + 1)}`)
      .join(",\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}

function formatBlock(name, obj) {
  return `  ${name}: ${formatValue(obj, 1)},`;
}

function replaceBlockAt(src, blockName, newContent, start) {
  let depth = 0;
  let i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        const end = src[i + 1] === "," ? i + 2 : i + 1;
        return src.slice(0, start) + newContent + src.slice(end);
      }
    }
  }
  throw new Error(`Unclosed block ${blockName}`);
}

function replaceTopLevelBlock(src, blockName, newContent) {
  const marker = `\n  ${blockName}: {`;
  const start = src.lastIndexOf(marker);
  if (start === -1) throw new Error(`Top-level block ${blockName} not found`);
  return replaceBlockAt(src, blockName, newContent, start + 1);
}

const agentProductsEn = {
  actionBatchProductField: "Batch {{action}} product {{field}}",
  actionFocusProduct: "Focus product",
  actionLocalize: "Localize",
  actionLocalizeLang: " to {{lang}}",
  actionOptimize: "Optimize",
  actionPricingStrategy: "Pricing strategy",
  actionProductField: "{{action}} product {{field}}",
  actionRerunCandidates: "Re-run candidates",
  actionRewrite: "Rewrite",
  clarifyAlreadyStatus: "「{{title}}」is already {{status}} — no action needed.",
  clarifyAmbiguous:
    "Multiple similar products found. Select one and try again: {{matches}}",
  clarifyCannotExecute: "Cannot execute this command.",
  clarifyInvalidPrice:
    "Provide a valid Shopify price, e.g. “change price to $9.9”.",
  clarifyMissingLang:
    "Specify target language, e.g. “translate title to English”.",
  clarifyMissingLangBatch:
    "Specify target language, e.g. “translate all product titles to English”.",
  clarifyMissingPricing:
    "Specify pricing method, e.g. “price all products at 2× cost” or “set all prices to 9.9”.",
  clarifyNoActiveInScope: "No active products in “{{label}}” to act on.",
  clarifyNoProductsInScope:
    "No products in “{{label}}” — batch action not possible.",
  clarifyNotFound:
    "No product matching “{{hint}}”. Select from the list or use a fuller title.",
  clarifyPriceOutOfRange: "Price out of allowed range — check the amount.",
  clarifySelectForCopy:
    "Select a product in the list first (right panel shows “Selected · name”), then say “translate this product title”.",
  clarifySelectForExplain:
    "Select a product in the list or name it in your command (e.g. explain why “slippers” was recommended).",
  clarifySelectForFocus:
    "Select a product in the list or name it (e.g. change “slippers” to $9.9).",
  clarifySelectForPrice:
    "Select a product first (right panel shows “Selected · name”), then say “change this product price to 22.9”.",
  clarifySelectForRerun:
    "Select a product or name it (e.g. find more candidates for “slippers”).",
  clarifySelectForStatus:
    "Select a product or name it (e.g. move “slippers” to draft).",
  detailActionType: "Action: {{action}}",
  detailBatchCopySync:
    "On confirm, will generate new titles and sync each to Shopify",
  detailBatchPriceSync:
    "On confirm, will update each product price on Shopify",
  detailBatchScope: "Scope: {{label}} ({{count}} active products)",
  detailBatchScopeProducts: "Scope: {{label}} ({{count}} products)",
  detailBatchSyncShopify: "On confirm, will sync each to Shopify",
  detailContextProduct: "Current context: {{title}}",
  detailCopySyncShopify:
    "On confirm, will generate new title and sync to Shopify",
  detailCurrentStatus: "Current status: {{status}}",
  detailExplainThenLocate:
    "Will locate “{{title}}” first, then explain match basis",
  detailFieldTarget: "Target field: {{field}}",
  detailLocateProduct: "Will locate in list: {{title}}",
  detailModeAmazon:
    "Mode: denoise + Amazon structure (filter wholesale/cross-border/marketing terms; not literal translation)",
  detailModeLiteral: "Mode: literal translation",
  detailNewPrice: "New price: {{currency}} {{price}}",
  detailOpenPricing: "Will open pricing strategy sidebar",
  detailPriceScope: "On confirm, choose scope (all SKUs or one SKU)",
  detailPricingFixed: "Pricing: fixed price {{price}}",
  detailPricingMultiplier: "Pricing: cost × {{multiplier}}",
  detailRerunSearch:
    "Will open image search and load candidates for “{{title}}”",
  detailSwitchFilter: "Will switch to “{{filter}}” view",
  detailSyncShopify: "On confirm, will sync to Shopify",
  detailTargetLang: "Target language: {{lang}}",
  detailTargetStatus: "Target status: {{status}}",
  explainMatchDetail: "Will explain {{mode}} for “{{title}}”",
  fieldAll: "all copy",
  fieldDescription: "description",
  fieldTitle: "title",
  filterAll: "All products",
  filterAllActive: "All active products",
  filterConfirmed: "Confirmed",
  filterConfirmedProducts: "Confirmed products",
  filterNewArrivals: "New arrivals",
  filterPending: "AI pending",
  filterPendingProducts: "Pending products",
  filterUnbound: "Unlinked",
  filterUnboundProducts: "Unmatched products",
  matchModeReason: "recommendation basis",
  matchModeRisk: "uncertainties",
  noProductSelected: "No product selected",
  opArchiveProduct: "Archive product",
  opBatchArchive: "Batch archive",
  opBatchDraft: "Batch move to draft",
  opBatchUpdateCopy: "Batch update product copy",
  opBatchUpdatePrice: "Batch update product prices",
  opDraftProduct: "Move to draft",
  opExecute: "Execute command",
  opExplainMatch: "Explain match",
  opFocusProduct: "Focus product",
  opOpenFilter: "Switch list filter",
  opOpenPricing: "Open pricing settings",
  opRerunSearch: "Re-run candidates",
  opUnknown: "Unknown command",
  opUpdateCopy: "Update product copy",
  opUpdatePrice: "Update product price",
  productFallback: "Product {{id}}",
  targetScopeCount: "{{label}} · {{count}}",
  targetShopPricing: "Store pricing",
  targetUnspecifiedLang: "Language not specified",
  targetUnspecifiedPrice: "Price not specified",
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
  opUnknown: "未知命令",
  opUpdateCopy: "修改商品文案",
  opUpdatePrice: "修改商品售价",
  productFallback: "商品 {{id}}",
  targetScopeCount: "{{label}} · {{count}} 个",
  targetShopPricing: "店铺定价",
  targetUnspecifiedLang: "未指定语言",
  targetUnspecifiedPrice: "未指定售价",
};

const productsActiveTaskEn = {
  connectShopTitle: "Connect your store first",
  connectShopReason: "Authorize to analyze products and set pricing.",
  connectShopAction: "Authorize",
  configurePricingTitle: "Set up pricing",
  configurePricingReason: "Suggested prices are unreliable until pricing is configured.",
  configurePricingAction: "Configure now",
  confirmPendingTitle: "Confirm {{count}} pending links",
  confirmPendingReason: "Confirm or rebind to continue.",
  confirmPendingAction: "Confirm all ({{count}})",
  unboundTitle: "{{count}} unlinked",
  unboundReason: "Run batch image search to match sources for unlinked products.",
  unboundAction: "Batch link",
  discoverTitle: "Discover new products",
  discoverReason: "Live links are ready — add more sources from the catalog.",
  discoverAction: "Open discovery",
  optimizeFiltersTitle: "Refine filters",
  optimizeFiltersReasonCategory: "Narrow by “{{category}}”.",
  optimizeFiltersReasonDefault: "Use category or price band before listing.",
  optimizeFiltersAction: "Filter suggestions",
};

const productsActiveTaskZh = {
  connectShopTitle: "先连接店铺",
  connectShopReason: "授权后才能分析商品与配置定价。",
  connectShopAction: "去授权",
  configurePricingTitle: "先配置定价",
  configurePricingReason: "未配置时建议售价不准。",
  configurePricingAction: "立即配置",
  confirmPendingTitle: "确认 {{count}} 个待关联",
  confirmPendingReason: "确认或改绑后即可继续。",
  confirmPendingAction: "批量确认（{{count}}）",
  unboundTitle: "{{count}} 个未匹配",
  unboundReason: "可批量启动图搜，为未关联商品自动匹配货源。",
  unboundAction: "批量关联",
  discoverTitle: "去发现新品",
  discoverReason: "在售关联已就绪，可补充货源。",
  discoverAction: "打开发现新品",
  optimizeFiltersTitle: "优化筛选",
  optimizeFiltersReasonCategory: "可按「{{category}}」缩小范围。",
  optimizeFiltersReasonDefault: "用类目或价格带缩小后再上架。",
  optimizeFiltersAction: "筛选建议",
};

const productsSourcingEn = {
  unauthorizedSummary: "Authorize the store first",
  unauthorizedExpl:
    "Sourcing status and source suggestions depend on a connected store.",
  unauthorizedNext: "Authorize Shopify, then return to Smart Sourcing",
  scanDone:
    "First AI scan done: analyzed {{productCount}} products, found {{matchedCount}} recommended matches",
  scanDonePending: ", {{pendingCount}} pending your confirmation",
  analyzedSellable: "Analyzed {{count}} active products",
  matchBreakdown:
    "Matched (incl. pending): {{matched}} · Pending: {{pending}} · Unmatched: {{unbound}}",
  rateShared:
    "Rate {{rate}} ({{currency}}): purchase cost and listing price share the rate; purchase display excludes multiplier markup",
  listingPricingPrefix: "Listing price: ",
  listingNotConfigured:
    "Listing price not yet configured (set pricing before Discovery suggested prices)",
  recCats: "Recommended categories: {{cats}}",
  currentFilters: "Current Discovery filters: {{filters}}",
  nextConfigurePricing: "Configure pricing first, then continue sourcing",
  nextPending: "Prioritize {{count}} pending links",
  nextUnbound: "Find sources for {{count}} unmatched products",
  nextDiscover: "Open Discovery to add sources and list",
  summaryReady: "Current sourcing status",
  summaryNotReady: "Analysis not ready",
  filterRecCat: "Based on active products, try categories: {{cats}}",
  filterNoCat: "No category data yet; narrow by keyword or price band.",
  filterChosen: "Your current selection: {{filters}}",
  filterNone: "No extra filters applied under Discovery tab.",
  filterPricingTip:
    "Without pricing, price-band filters are less useful — set pricing first.",
  filterCurrencyTip:
    "Target currency {{currency}}: filter by suggested price band, then fine-tune by margin.",
  suggestFiltersSummary: "Filter suggestions",
  stepOpenDiscover: "Open Discovery",
  stepTryCat: "Try the recommended category “{{cat}}”",
  stepKeyword: "Narrow by keyword or USD price band",
  pendingEmptySummary: "No pending products",
  pendingEmptyExpl: "No pending AI links now; check unmatched or Discovery.",
  viewUnbound: "View {{count}} unmatched products",
  pendingSummary: "{{count}} pending",
  pendingExpl1: "Pending means AI found candidate sources — confirm or rebind.",
  pendingExpl2: "Clear pending before unmatched to avoid duplicate work.",
  stepSwitchPending: "Switch to Shop Products and filter pending",
  stepConfirmEach: "Confirm each or change source",
  unboundEmptySummary: "No unmatched products",
  unboundEmptyExpl:
    "All active products are linked or pending; open Discovery to expand.",
  unboundSummary: "{{count}} unmatched",
  unboundExpl1:
    "Unmatched products have no Tangbuy source yet; image-search or manual match before logistics & sync.",
  unboundExplPending: "Also {{pending}} pending — handle together.",
  unboundExplAfter: "After clearing unmatched, continue in Discovery.",
  stepSwitchUnbound: "Switch to Shop Products and filter unmatched",
  stepLinkSource: "Link a source to the product",
  rematchSummary: "Re-search unmatched sources",
  rematchExpl: "Will re-image-search {{count}} unlinked products.",
  rematchKeepBound: "Already-linked products won't be rebound.",
  stepStartRematch: "Start re-search",
  stepConfirmInResult: "Confirm or rebind in results",
  rematchBtnAll: "Re-search all unmatched",
  rematchEmptyExpl: "No unlinked products now — no re-search needed.",
  stepViewPendingList: "View pending list",
  stepOrDiscover: "Or open Discovery",
  btnViewPending: "View pending",
  btnViewUnbound: "View unmatched",
  btnDiscover: "Discovery",
  discoverSummary: "Discover new products",
  discoverExplainMain:
    "Discovery pulls listable sources from Tangbuy and prices them with your template.",
  discoverExplainPricing:
    "Pricing is not configured yet — suggested prices may be off. Set pricing first.",
  discoverExplainCategories: "Start with recommended categories: {{categories}}",
  discoverNextOpenTab: "Open the Discovery tab",
  discoverNextFilter: "Narrow by category or price, then list",
  discoverAction: "Open discovery",
};

const productsSourcingZh = {
  unauthorizedSummary: "请先授权店铺",
  unauthorizedExpl: "选品状态与货源建议都依赖已连接的店铺。",
  unauthorizedNext: "完成 Shopify 授权后回到智能选品",
  scanDone:
    "首轮 AI 分析已完成：已分析 {{productCount}} 个商品，找到 {{matchedCount}} 个推荐匹配",
  scanDonePending: "，其中 {{pendingCount}} 个待你确认",
  analyzedSellable: "已分析在售商品 {{count}} 个",
  matchBreakdown:
    "已匹配（含待确认）{{matched}} 个 · 待确认 {{pending}} · 未匹配 {{unbound}}",
  rateShared:
    "汇率 {{rate}}（{{currency}}）：采购成本与上架定价共用；采购展示不含倍率加价",
  listingPricingPrefix: "上架定价：",
  listingNotConfigured:
    "上架定价尚未完成有效配置（发现新品建议售价需先配定价）",
  recCats: "推荐类目：{{cats}}",
  currentFilters: "当前发现新品筛选：{{filters}}",
  nextConfigurePricing: "先配置定价策略，再推进选品",
  nextPending: "优先处理 {{count}} 个待确认关联",
  nextUnbound: "为 {{count}} 个未匹配商品找货源",
  nextDiscover: "可去「发现新品」补充货源并上架",
  summaryReady: "当前选品状态",
  summaryNotReady: "分析尚未就绪",
  filterRecCat: "可按店铺在售推断，优先试试类目：{{cats}}",
  filterNoCat: "暂无推荐类目数据；可先用关键词或价格带缩小范围。",
  filterChosen: "你当前已选：{{filters}}",
  filterNone: "发现新品 Tab 下尚未应用额外筛选。",
  filterPricingTip: "定价未配置时，建议售价区间筛选参考价值有限，建议先配定价。",
  filterCurrencyTip: "目标币种 {{currency}}：可用价格带按建议售价筛一版，再按利润手感微调。",
  suggestFiltersSummary: "筛选建议",
  stepOpenDiscover: "打开「发现新品」",
  stepTryCat: "点选推荐类目「{{cat}}」试一轮",
  stepKeyword: "用关键词或 USD 价格带缩小结果",
  pendingEmptySummary: "暂无待确认商品",
  pendingEmptyExpl: "当前没有待确认的 AI 关联，可去未匹配或发现新品。",
  viewUnbound: "查看 {{count}} 个未匹配商品",
  pendingSummary: "有 {{count}} 个待确认",
  pendingExpl1: "待确认表示 AI 已找到候选货源，需要你确认或改绑。",
  pendingExpl2: "建议先清待确认，再处理未匹配，避免重复劳动。",
  stepSwitchPending: "切换到「店铺商品」并筛选待确认",
  stepConfirmEach: "逐条确认或更换货源",
  unboundEmptySummary: "暂无未匹配商品",
  unboundEmptyExpl: "在售商品均已有关联或待确认；可去发现新品扩品。",
  unboundSummary: "有 {{count}} 个未匹配",
  unboundExpl1:
    "未匹配商品还没有绑定 Tangbuy 货源，图搜或手动找同款后才能推进物流与同步。",
  unboundExplPending: "另有 {{pending}} 个待确认，也可一并处理。",
  unboundExplAfter: "清完未匹配后，可到发现新品继续扩品。",
  stepSwitchUnbound: "切换到「店铺商品」并筛选未匹配",
  stepLinkSource: "为商品关联货源",
  rematchSummary: "重搜未匹配货源",
  rematchExpl: "将对 {{count}} 个未关联商品重新图搜。",
  rematchKeepBound: "已关联商品不会改绑。",
  stepStartRematch: "开始重搜",
  stepConfirmInResult: "在结果中确认或改绑",
  rematchBtnAll: "重搜全部未匹配",
  rematchEmptyExpl: "当前没有未关联商品，无需重搜。",
  stepViewPendingList: "看待确认列表",
  stepOrDiscover: "或去发现新品",
  btnViewPending: "看待确认",
  btnViewUnbound: "看未匹配",
  btnDiscover: "发现新品",
  discoverSummary: "去发现新品",
  discoverExplainMain:
    "「发现新品」从 Tangbuy 商城拉取可上架货源，按你的定价模板生成建议售价。",
  discoverExplainPricing: "定价尚未有效配置时，建议售价可能不准——可先配定价再筛品。",
  discoverExplainCategories: "可从推荐类目入手：{{categories}}",
  discoverNextOpenTab: "打开「发现新品」Tab",
  discoverNextFilter: "用类目或价格带缩小范围后选品上架",
  discoverAction: "打开发现新品",
};

const productsPricingEn = {
  summaryMissing: "Pricing template not loaded yet",
  summaryConfigured: "{{currency}} · FX {{rate}} · ×{{multiplier}}",
  summaryConfiguredAddend:
    "{{currency}} · FX {{rate}} · ×{{multiplier}} · +{{addend}}",
  summaryDefault: "Pricing not configured (system default)",
  purchaseFromTemplate:
    "Purchase display: {{currency}} · FX {{rate}} (matches pricing; no markup)",
  purchaseDefault:
    "Purchase display: {{currency}} · default FX {{rate}} (no markup)",
  configuredSummary: "Pricing configured — fine-tune as needed",
  configuredExpl:
    "Suggested prices use the current template; changes reflect instantly in Discovery and listing preview.",
  stepOpenPricingSidebar:
    "Open pricing sidebar to adjust rate, multiplier, or addend",
  stepSaveThenContinue: "Save, then continue sourcing or listing",
  notConfiguredSummary: "Configure pricing strategy first",
  defaultTemplateExpl1:
    "Still on the system default template; suggested prices may miss your margin.",
  defaultTemplateExpl2:
    "After setting currency, rate, and multiplier, Discovery and preview price by your rules.",
  stepOpenRightSidebar: "Open the right pricing sidebar",
  stepFillRateSave: "Fill rate and multiplier, then save",
  unauthorizedSummary: "Authorize before configuring store pricing",
  unauthorizedExpl1:
    "Pricing template is per-store: currency, rate, multiplier set suggested price.",
  unauthorizedExpl2: "Authorize the store first, then return to configure.",
  stepGoAuthorize: "Go authorize store",
  readySummary: "Pricing ready",
  readyExplPath:
    "Listing path: cost (RMB) → ×rate → ×multiplier → +addend → round (Discovery suggested price only).",
  readyExplShared:
    "When set, Shopify purchase cost display and listing price share the same rate (no multiplier markup).",
  readyExplSidebar:
    "The strategy card adjusts anytime; the main area handles sourcing and listing.",
  nextPendingOrFilter: "Prioritize pending links",
  nextFilterDiscover: "Filter Discovery by suggested price to list",
  whySummary: "Why configure pricing first",
  whyExpl:
    "Without valid pricing, the system estimates Discovery prices with default rate/multiplier — likely off your target margin.",
  whyExplTemplate:
    "Set the listing template before Discovery filters; linked products' purchase display ignores this multiplier.",
  stepClickConfigure:
    "Click “Go configure pricing” below or “Configure now” on the card",
  stepSaveTemplate: "Save template, then continue sourcing",
  btnAdjustPricing: "Adjust pricing",
  btnConfigureNow: "Configure now",
  btnViewPricing: "View / adjust pricing",
  btnGoConfigure: "Go configure pricing",
};

const agentSkuEn = {
  clarifyAmbiguous:
    "Multiple similar products found. Select one and try again: {{matches}}",
  clarifyNoPendingInScope: "No pending SKU bindings in “{{label}}”.",
  clarifyNoProductsInScope:
    "No products in “{{label}}” — batch action not possible.",
  clarifyNotFound:
    "No product matching “{{hint}}”. Select from the list or use a fuller title.",
  clarifyNotImplemented: "This command is not implemented yet.",
  clarifySelectForDetail:
    "Select a product in the list first, then open SKU detail.",
  clarifySelectForExplain:
    "Select a product in the list or name it (e.g. explain SKU match for “slippers”).",
  clarifySelectForFocus:
    "Select a product in the list or name it (e.g. focus “slippers”).",
  clarifySelectForRealign:
    "Select a product in the list or name it (e.g. re-align SKUs for “slippers”).",
  detailBatchConfirmLine2:
    "On confirm, will accept all pending SKU bindings in scope",
  detailBatchConfirmScope: "Scope: {{label}} ({{count}} products)",
  detailBatchRealignLine2: "On confirm, will re-run auto-align for each product",
  detailBatchRealignScope: "Scope: {{label}} ({{count}} products)",
  detailExplainMatch: "Will explain SKU match for “{{title}}”",
  detailLocateProduct: "Will locate in list: {{title}}",
  detailOpenSkuDetail: "Will open SKU binding detail for “{{title}}”",
  detailRealign: "Will re-run auto SKU align for “{{title}}”",
  detailSwitchFilter: "Will switch to “{{filter}}” view",
  filterAll: "All products",
  filterFullyLinked: "Fully linked",
  filterPartialProducts: "Partially linked products",
  filterPartiallyLinked: "Partially linked",
  noProductSelected: "No product selected",
  opBatchConfirm: "Batch confirm pending SKUs",
  opBatchRealign: "Batch re-align SKUs",
  opExecute: "Execute command",
  opExplainMatch: "Explain SKU match",
  opFocusProduct: "Focus product",
  opOpenDetail: "Open SKU detail",
  opOpenFilter: "Switch list filter",
  opRealign: "Re-align SKUs",
  productFallback: "Product {{id}}",
  targetScopeCount: "{{label}} · {{count}}",
};

const agentSkuZh = {
  clarifyAmbiguous: "找到多个相似商品，请点选其中一个后重试：{{matches}}",
  clarifyNoPendingInScope: "「{{label}}」范围内没有待确认的 SKU 绑定。",
  clarifyNoProductsInScope: "「{{label}}」范围内没有商品，无法执行批量操作。",
  clarifyNotFound: "未找到匹配「{{hint}}」的商品，请在列表中点选或使用更完整的标题。",
  clarifyNotImplemented: "该命令暂未实现。",
  clarifySelectForDetail: "请先在列表中点选商品，再打开 SKU 详情。",
  clarifySelectForExplain:
    "请先在列表中点选商品，或在命令里写出商品名（如：解释「拖鞋」的 SKU 匹配）。",
  clarifySelectForFocus:
    "请先在列表中点选商品，或在命令里写出商品名（如：聚焦「拖鞋」）。",
  clarifySelectForRealign:
    "请先在列表中点选商品，或在命令里写出商品名（如：为「拖鞋」重新对齐 SKU）。",
  detailBatchConfirmLine2: "确认后将接受范围内所有待确认的 SKU 绑定",
  detailBatchConfirmScope: "范围：{{label}}（{{count}} 个商品）",
  detailBatchRealignLine2: "确认后将逐个重新自动对齐 SKU",
  detailBatchRealignScope: "范围：{{label}}（{{count}} 个商品）",
  detailExplainMatch: "将解释「{{title}}」的 SKU 匹配依据",
  detailLocateProduct: "将在列表中定位：{{title}}",
  detailOpenSkuDetail: "将打开「{{title}}」的 SKU 绑定详情",
  detailRealign: "将为「{{title}}」重新自动对齐 SKU",
  detailSwitchFilter: "将切换到「{{filter}}」视图",
  filterAll: "全部商品",
  filterFullyLinked: "已全部绑定",
  filterPartialProducts: "部分绑定商品",
  filterPartiallyLinked: "部分绑定",
  noProductSelected: "未选中商品",
  opBatchConfirm: "批量确认待绑定 SKU",
  opBatchRealign: "批量重新对齐 SKU",
  opExecute: "执行命令",
  opExplainMatch: "解释 SKU 匹配",
  opFocusProduct: "聚焦商品",
  opOpenDetail: "打开 SKU 详情",
  opOpenFilter: "切换列表筛选",
  opRealign: "重新对齐 SKU",
  productFallback: "商品 {{id}}",
  targetScopeCount: "{{label}} · {{count}} 个",
};

const productsPreviewEn = {
  batchArchiveTitle: "Archive {{count}} products",
  batchCopyTitle: "Batch {{action}} · {{count}} products",
  batchDraftTitle: "Move {{count}} to draft",
  batchPriceTitle: "Batch pricing · {{mode}} · {{count}} products",
  cannotCalc: "Cannot calculate",
  durationMinutes: "~{{minutes}} min",
  durationSeconds: "~{{seconds}}s",
  durationTwoSec: "~2s",
  errCannotCalcPrice: "Cannot calculate price from current cost",
  errCopyNotImplemented: "This copy action is not implemented yet",
  errNoProducts: "No products in scope",
  errTitleGenFailed: "Failed to generate title",
  errTitleLocalizeFailed: "Failed to localize title",
  fieldAll: "title & description",
  fieldDescription: "description",
  fieldTitle: "title",
  genFailed: "Generation failed",
  localizeTo: "Localize to {{lang}}",
  modeAmazon: "Amazon-style rewrite",
  modeLiteral: "literal translation",
  modeLiteralShort: "literal",
  noPrice: "No price",
  opNotImplemented: "Not implemented",
  previewAll: "Preview all {{count}} products",
  previewAllArchive: "All {{count}} products → archived",
  previewAllDraft: "All {{count}} products → draft",
  previewPartial: "Showing {{sample}} samples ({{rest}} more not shown)",
  previewPartialArchive: "Showing {{sample}} samples ({{rest}} more not shown)",
  previewPartialDraft: "Showing {{sample}} samples ({{rest}} more not shown)",
  priceModeFixed: "Fixed {{price}}",
  priceModeMultiplier: "Cost × {{multiplier}}",
  productFallback: "Product",
  productN: "Product {{n}}",
  readFailed: "Could not read",
  riskArchive: "Product will be archived on Shopify",
  riskBatchArchive: "Large batch — archive is hard to undo",
  riskBatchCopy: "Large batch — review samples before confirming",
  riskBatchPrice: "Large batch — spot-check prices before confirming",
  riskDraft: "Product will move to draft on Shopify",
  scopeBatchCopy: "{{count}} products · {{field}}",
  scopeBatchPrice: "{{count}} products",
  scopeBatchStatus: "{{count}} products",
  scopeOneProduct: "1 product · {{field}}",
  scopeOneStatus: "1 product",
  unknownProduct: "Untitled product",
  updateTitleAndDesc: "updates title and description",
};

const productsPreviewZh = {
  batchArchiveTitle: "归档 {{count}} 个商品",
  batchCopyTitle: "批量{{action}} · {{count}} 个商品",
  batchDraftTitle: "将 {{count}} 个商品放到草稿",
  batchPriceTitle: "批量改价 · {{mode}} · {{count}} 个商品",
  cannotCalc: "无法计算",
  durationMinutes: "约 {{minutes}} 分钟",
  durationSeconds: "约 {{seconds}} 秒",
  durationTwoSec: "约 2 秒",
  errCannotCalcPrice: "无法根据当前成本计算售价",
  errCopyNotImplemented: "该文案操作尚未实现",
  errNoProducts: "范围内没有商品",
  errTitleGenFailed: "标题生成失败",
  errTitleLocalizeFailed: "标题翻译失败",
  fieldAll: "标题与描述",
  fieldDescription: "描述",
  fieldTitle: "标题",
  genFailed: "生成失败",
  localizeTo: "翻译为 {{lang}}",
  modeAmazon: "Amazon 风格改写",
  modeLiteral: "直译",
  modeLiteralShort: "直译",
  noPrice: "无售价",
  opNotImplemented: "尚未实现",
  previewAll: "预览全部 {{count}} 个商品",
  previewAllArchive: "全部 {{count}} 个商品 → 归档",
  previewAllDraft: "全部 {{count}} 个商品 → 草稿",
  previewPartial: "展示 {{sample}} 条样例（另有 {{rest}} 条未展示）",
  previewPartialArchive: "展示 {{sample}} 条样例（另有 {{rest}} 条未展示）",
  previewPartialDraft: "展示 {{sample}} 条样例（另有 {{rest}} 条未展示）",
  priceModeFixed: "固定 {{price}}",
  priceModeMultiplier: "成本 × {{multiplier}}",
  productFallback: "商品",
  productN: "商品 {{n}}",
  readFailed: "读取失败",
  riskArchive: "确认后商品将在 Shopify 归档",
  riskBatchArchive: "批量较大 — 归档不易撤销",
  riskBatchCopy: "批量较大 — 请先核对样例再确认",
  riskBatchPrice: "批量较大 — 请先抽查价格再确认",
  riskDraft: "确认后商品将在 Shopify 变为草稿",
  scopeBatchCopy: "{{count}} 个商品 · {{field}}",
  scopeBatchPrice: "{{count}} 个商品",
  scopeBatchStatus: "{{count}} 个商品",
  scopeOneProduct: "1 个商品 · {{field}}",
  scopeOneStatus: "1 个商品",
  unknownProduct: "未命名商品",
  updateTitleAndDesc: "同时更新标题与描述",
};

const productsPricingZh = {
  summaryMissing: "尚未读取到定价模板",
  summaryConfigured: "{{currency}} · 汇率 {{rate}} · 倍率 ×{{multiplier}}",
  summaryConfiguredAddend:
    "{{currency}} · 汇率 {{rate}} · 倍率 ×{{multiplier}} · 加价 +{{addend}}",
  summaryDefault: "尚未完成有效定价配置（当前为系统默认）",
  purchaseFromTemplate:
    "采购价展示：{{currency}} · 汇率 {{rate}}（与定价模板一致，不含倍率加价）",
  purchaseDefault:
    "采购价展示：{{currency}} · 默认汇率 {{rate}}（不含倍率加价）",
  configuredSummary: "定价已配置，可按需微调",
  configuredExpl:
    "建议售价会按当前模板计算；改参数后会即时反映在发现新品与上架预览中。",
  stepOpenPricingSidebar: "打开定价侧栏调整汇率、倍率或加价",
  stepSaveThenContinue: "保存后继续选品或上架",
  notConfiguredSummary: "建议先配置定价策略",
  defaultTemplateExpl1: "当前仍是系统默认模板，建议售价可能不符合你的利润预期。",
  defaultTemplateExpl2:
    "配置目标币种、汇率与倍率后，发现新品与上架预览才会按你的规则出价。",
  stepOpenRightSidebar: "打开右侧定价侧栏",
  stepFillRateSave: "填写汇率与倍率后保存",
  unauthorizedSummary: "授权后再配置店铺定价",
  unauthorizedExpl1: "定价模板按店铺生效：目标币种、汇率、倍率决定建议售价。",
  unauthorizedExpl2: "请先完成店铺授权，再回到本页配置。",
  stepGoAuthorize: "前往授权店铺",
  readySummary: "定价已就绪",
  readyExplPath:
    "上架定价路径：采购价（RMB）→ 乘汇率 → 乘倍率 → 加固定加价 → 取整（仅用于发现新品建议售价）。",
  readyExplShared:
    "已配置时，我的 Shopify 采购成本展示与上架定价共用同一汇率（不含倍率加价）。",
  readyExplSidebar: "右侧策略卡可随时调整；主区继续负责选品与上架执行。",
  nextPendingOrFilter: "优先处理待确认关联",
  nextFilterDiscover: "可在「发现新品」按建议售价筛选上架",
  whySummary: "为什么要先配定价",
  whyExpl:
    "未配置有效定价时，系统只能用默认汇率与倍率估算发现新品售价，容易偏离你的目标毛利。",
  whyExplTemplate:
    "先配好上架定价模板，再去做发现新品筛选；已关联商品的采购价展示不受此模板倍率影响。",
  stepClickConfigure: "点击下方「去配置定价」或策略卡「立即配置」",
  stepSaveTemplate: "保存模板后再继续选品",
  btnAdjustPricing: "调整定价",
  btnConfigureNow: "立即配置",
  btnViewPricing: "查看/调整定价",
  btnGoConfigure: "去配置定价",
};

function frAgentSku(en) {
  return {
    ...en,
    clarifyAmbiguous:
      "Plusieurs produits similaires trouvés. Sélectionnez-en un et réessayez : {{matches}}",
    clarifyNoPendingInScope: "Aucune liaison SKU en attente dans « {{label}} ».",
    clarifyNoProductsInScope:
      "Aucun produit dans « {{label}} » — action groupée impossible.",
    clarifyNotFound:
      "Aucun produit correspondant à « {{hint}} ». Sélectionnez dans la liste ou utilisez un titre plus complet.",
    clarifyNotImplemented: "Cette commande n'est pas encore implémentée.",
    clarifySelectForDetail:
      "Sélectionnez d'abord un produit dans la liste, puis ouvrez le détail SKU.",
    clarifySelectForExplain:
      "Sélectionnez un produit ou nommez-le (ex. expliquer la correspondance SKU pour « pantoufles »).",
    clarifySelectForFocus:
      "Sélectionnez un produit ou nommez-le (ex. focus « pantoufles »).",
    clarifySelectForRealign:
      "Sélectionnez un produit ou nommez-le (ex. réaligner les SKU pour « pantoufles »).",
    detailBatchConfirmLine2:
      "À la confirmation, acceptera toutes les liaisons SKU en attente dans la portée",
    detailBatchConfirmScope: "Portée : {{label}} ({{count}} produits)",
    detailBatchRealignLine2:
      "À la confirmation, relancera l'alignement auto pour chaque produit",
    detailBatchRealignScope: "Portée : {{label}} ({{count}} produits)",
    detailExplainMatch: "Expliquera la correspondance SKU pour « {{title}} »",
    detailLocateProduct: "Localisera dans la liste : {{title}}",
    detailOpenSkuDetail: "Ouvrira le détail de liaison SKU pour « {{title}} »",
    detailRealign: "Relancera l'alignement SKU auto pour « {{title}} »",
    detailSwitchFilter: "Basculera vers la vue « {{filter}} »",
    filterAll: "Tous les produits",
    filterFullyLinked: "Entièrement liés",
    filterPartialProducts: "Produits partiellement liés",
    filterPartiallyLinked: "Partiellement liés",
    noProductSelected: "Aucun produit sélectionné",
    opBatchConfirm: "Confirmer les SKU en attente en lot",
    opBatchRealign: "Réaligner les SKU en lot",
    opExecute: "Exécuter la commande",
    opExplainMatch: "Expliquer la correspondance SKU",
    opFocusProduct: "Focus produit",
    opOpenDetail: "Ouvrir le détail SKU",
    opOpenFilter: "Changer le filtre de liste",
    opRealign: "Réaligner les SKU",
    productFallback: "Produit {{id}}",
    targetScopeCount: "{{label}} · {{count}}",
  };
}

function esAgentSku(en) {
  return {
    ...en,
    clarifyAmbiguous:
      "Se encontraron varios productos similares. Seleccione uno e intente de nuevo: {{matches}}",
    clarifyNoPendingInScope: "Sin vinculaciones SKU pendientes en « {{label}} ».",
    clarifyNoProductsInScope:
      "No hay productos en « {{label}} » — acción por lotes imposible.",
    clarifyNotFound:
      "Ningún producto coincide con « {{hint}} ». Seleccione de la lista o use un título más completo.",
    clarifyNotImplemented: "Este comando aún no está implementado.",
    clarifySelectForDetail:
      "Seleccione primero un producto en la lista, luego abra el detalle SKU.",
    clarifySelectForExplain:
      "Seleccione un producto o nómbrelo (p. ej. explicar coincidencia SKU para « pantuflas »).",
    clarifySelectForFocus:
      "Seleccione un producto o nómbrelo (p. ej. enfocar « pantuflas »).",
    clarifySelectForRealign:
      "Seleccione un producto o nómbrelo (p. ej. realinear SKU para « pantuflas »).",
    detailBatchConfirmLine2:
      "Al confirmar, aceptará todas las vinculaciones SKU pendientes en el alcance",
    detailBatchConfirmScope: "Alcance: {{label}} ({{count}} productos)",
    detailBatchRealignLine2:
      "Al confirmar, volverá a ejecutar alineación automática para cada producto",
    detailBatchRealignScope: "Alcance: {{label}} ({{count}} productos)",
    detailExplainMatch: "Explicará la coincidencia SKU para « {{title}} »",
    detailLocateProduct: "Localizará en la lista: {{title}}",
    detailOpenSkuDetail: "Abrirá el detalle de vinculación SKU para « {{title}} »",
    detailRealign: "Volverá a alinear SKU automáticamente para « {{title}} »",
    detailSwitchFilter: "Cambiará a la vista « {{filter}} »",
    filterAll: "Todos los productos",
    filterFullyLinked: "Totalmente vinculados",
    filterPartialProducts: "Productos parcialmente vinculados",
    filterPartiallyLinked: "Parcialmente vinculados",
    noProductSelected: "Ningún producto seleccionado",
    opBatchConfirm: "Confirmar SKU pendientes en lote",
    opBatchRealign: "Realinear SKU en lote",
    opExecute: "Ejecutar comando",
    opExplainMatch: "Explicar coincidencia SKU",
    opFocusProduct: "Enfocar producto",
    opOpenDetail: "Abrir detalle SKU",
    opOpenFilter: "Cambiar filtro de lista",
    opRealign: "Realinear SKU",
    productFallback: "Producto {{id}}",
    targetScopeCount: "{{label}} · {{count}}",
  };
}

function frProductsPreview(en) {
  return {
    ...en,
    batchArchiveTitle: "Archiver {{count}} produits",
    batchCopyTitle: "Lot {{action}} · {{count}} produits",
    batchDraftTitle: "Mettre {{count}} en brouillon",
    batchPriceTitle: "Prix en lot · {{mode}} · {{count}} produits",
    cannotCalc: "Impossible de calculer",
    durationMinutes: "~{{minutes}} min",
    durationSeconds: "~{{seconds}} s",
    durationTwoSec: "~2 s",
    errCannotCalcPrice: "Impossible de calculer le prix à partir du coût actuel",
    errCopyNotImplemented: "Cette action de contenu n'est pas encore implémentée",
    errNoProducts: "Aucun produit dans la portée",
    errTitleGenFailed: "Échec de génération du titre",
    errTitleLocalizeFailed: "Échec de localisation du titre",
    fieldAll: "titre et description",
    fieldDescription: "description",
    fieldTitle: "titre",
    genFailed: "Échec de génération",
    localizeTo: "Localiser en {{lang}}",
    modeAmazon: "Réécriture style Amazon",
    modeLiteral: "traduction littérale",
    modeLiteralShort: "littéral",
    noPrice: "Pas de prix",
    opNotImplemented: "Non implémenté",
    previewAll: "Aperçu des {{count}} produits",
    previewAllArchive: "Les {{count}} produits → archivés",
    previewAllDraft: "Les {{count}} produits → brouillon",
    previewPartial: "Affiche {{sample}} échantillons ({{rest}} de plus non affichés)",
    previewPartialArchive: "Affiche {{sample}} échantillons ({{rest}} de plus non affichés)",
    previewPartialDraft: "Affiche {{sample}} échantillons ({{rest}} de plus non affichés)",
    priceModeFixed: "Fixe {{price}}",
    priceModeMultiplier: "Coût × {{multiplier}}",
    productFallback: "Produit",
    productN: "Produit {{n}}",
    readFailed: "Lecture impossible",
    riskArchive: "Le produit sera archivé sur Shopify",
    riskBatchArchive: "Grand lot — l'archivage est difficile à annuler",
    riskBatchCopy: "Grand lot — vérifiez les échantillons avant de confirmer",
    riskBatchPrice: "Grand lot — vérifiez les prix avant de confirmer",
    riskDraft: "Le produit passera en brouillon sur Shopify",
    scopeBatchCopy: "{{count}} produits · {{field}}",
    scopeBatchPrice: "{{count}} produits",
    scopeBatchStatus: "{{count}} produits",
    scopeOneProduct: "1 produit · {{field}}",
    scopeOneStatus: "1 produit",
    unknownProduct: "Produit sans titre",
    updateTitleAndDesc: "met à jour le titre et la description",
  };
}

function esProductsPreview(en) {
  return {
    ...en,
    batchArchiveTitle: "Archivar {{count}} productos",
    batchCopyTitle: "Lote {{action}} · {{count}} productos",
    batchDraftTitle: "Mover {{count}} a borrador",
    batchPriceTitle: "Precio en lote · {{mode}} · {{count}} productos",
    cannotCalc: "No se puede calcular",
    durationMinutes: "~{{minutes}} min",
    durationSeconds: "~{{seconds}} s",
    durationTwoSec: "~2 s",
    errCannotCalcPrice: "No se puede calcular el precio desde el costo actual",
    errCopyNotImplemented: "Esta acción de contenido aún no está implementada",
    errNoProducts: "Sin productos en el alcance",
    errTitleGenFailed: "Error al generar título",
    errTitleLocalizeFailed: "Error al localizar título",
    fieldAll: "título y descripción",
    fieldDescription: "descripción",
    fieldTitle: "título",
    genFailed: "Error de generación",
    localizeTo: "Localizar a {{lang}}",
    modeAmazon: "Reescritura estilo Amazon",
    modeLiteral: "traducción literal",
    modeLiteralShort: "literal",
    noPrice: "Sin precio",
    opNotImplemented: "No implementado",
    previewAll: "Vista previa de los {{count}} productos",
    previewAllArchive: "Los {{count}} productos → archivados",
    previewAllDraft: "Los {{count}} productos → borrador",
    previewPartial: "Muestra {{sample}} muestras ({{rest}} más no mostradas)",
    previewPartialArchive: "Muestra {{sample}} muestras ({{rest}} más no mostradas)",
    previewPartialDraft: "Muestra {{sample}} muestras ({{rest}} más no mostradas)",
    priceModeFixed: "Fijo {{price}}",
    priceModeMultiplier: "Costo × {{multiplier}}",
    productFallback: "Producto",
    productN: "Producto {{n}}",
    readFailed: "No se pudo leer",
    riskArchive: "El producto se archivará en Shopify",
    riskBatchArchive: "Lote grande — archivar es difícil de deshacer",
    riskBatchCopy: "Lote grande — revise muestras antes de confirmar",
    riskBatchPrice: "Lote grande — verifique precios antes de confirmar",
    riskDraft: "El producto pasará a borrador en Shopify",
    scopeBatchCopy: "{{count}} productos · {{field}}",
    scopeBatchPrice: "{{count}} productos",
    scopeBatchStatus: "{{count}} productos",
    scopeOneProduct: "1 producto · {{field}}",
    scopeOneStatus: "1 producto",
    unknownProduct: "Producto sin título",
    updateTitleAndDesc: "actualiza título y descripción",
  };
}

function frAgentProducts(en) {
  return {
    ...en,
    actionBatchProductField: "Lot {{action}} produit {{field}}",
    actionFocusProduct: "Focus produit",
    actionLocalize: "Localiser",
    actionLocalizeLang: " en {{lang}}",
    actionOptimize: "Optimiser",
    actionPricingStrategy: "Stratégie de prix",
    actionProductField: "{{action}} produit {{field}}",
    actionRerunCandidates: "Relancer les candidats",
    actionRewrite: "Réécrire",
    clarifyAlreadyStatus: "« {{title}} » est déjà {{status}} — aucune action requise.",
    clarifyAmbiguous:
      "Plusieurs produits similaires trouvés. Sélectionnez-en un et réessayez : {{matches}}",
    clarifyCannotExecute: "Impossible d'exécuter cette commande.",
    clarifyInvalidPrice:
      "Indiquez un prix Shopify valide, ex. « changer le prix à 9,9 $ ».",
    clarifyMissingLang:
      "Précisez la langue cible, ex. « traduire le titre en anglais ».",
    clarifyMissingLangBatch:
      "Précisez la langue cible, ex. « traduire tous les titres en anglais ».",
    clarifyMissingPricing:
      "Précisez la méthode de prix, ex. « prix à 2× le coût » ou « tous les prix à 9,9 ».",
    clarifyNoActiveInScope: "Aucun produit actif dans « {{label}} ».",
    clarifyNoProductsInScope:
      "Aucun produit dans « {{label}} » — action groupée impossible.",
    clarifyNotFound:
      "Aucun produit correspondant à « {{hint}} ». Sélectionnez dans la liste ou utilisez un titre plus complet.",
    clarifyPriceOutOfRange: "Prix hors plage autorisée — vérifiez le montant.",
    clarifySelectForCopy:
      "Sélectionnez d'abord un produit dans la liste, puis dites « traduire le titre de ce produit ».",
    clarifySelectForExplain:
      "Sélectionnez un produit ou nommez-le (ex. expliquer pourquoi « pantoufles » a été recommandé).",
    clarifySelectForFocus:
      "Sélectionnez un produit ou nommez-le (ex. changer « pantoufles » à 9,9 $).",
    clarifySelectForPrice:
      "Sélectionnez d'abord un produit, puis dites « changer le prix de ce produit à 22,9 ».",
    clarifySelectForRerun:
      "Sélectionnez un produit ou nommez-le (ex. trouver plus de candidats pour « pantoufles »).",
    clarifySelectForStatus:
      "Sélectionnez un produit ou nommez-le (ex. mettre « pantoufles » en brouillon).",
    detailActionType: "Action : {{action}}",
    detailBatchCopySync:
      "À la confirmation, générera de nouveaux titres et synchronisera chaque produit sur Shopify",
    detailBatchPriceSync:
      "À la confirmation, mettra à jour le prix de chaque produit sur Shopify",
    detailBatchScope: "Portée : {{label}} ({{count}} produits actifs)",
    detailBatchScopeProducts: "Portée : {{label}} ({{count}} produits)",
    detailBatchSyncShopify: "À la confirmation, synchronisera chaque produit sur Shopify",
    detailContextProduct: "Contexte actuel : {{title}}",
    detailCopySyncShopify:
      "À la confirmation, générera un nouveau titre et synchronisera sur Shopify",
    detailCurrentStatus: "Statut actuel : {{status}}",
    detailExplainThenLocate:
      "Localisera d'abord « {{title}} », puis expliquera la base de correspondance",
    detailFieldTarget: "Champ cible : {{field}}",
    detailLocateProduct: "Localisera dans la liste : {{title}}",
    detailModeAmazon:
      "Mode : débruitage + structure Amazon (filtre gros/cross-border/marketing ; pas traduction littérale)",
    detailModeLiteral: "Mode : traduction littérale",
    detailNewPrice: "Nouveau prix : {{currency}} {{price}}",
    detailOpenPricing: "Ouvrira la barre latérale de stratégie de prix",
    detailPriceScope:
      "À la confirmation, choisira la portée (tous les SKU ou un SKU)",
    detailPricingFixed: "Prix : fixe {{price}}",
    detailPricingMultiplier: "Prix : coût × {{multiplier}}",
    detailRerunSearch:
      "Ouvrira la recherche d'image et chargera les candidats pour « {{title}} »",
    detailSwitchFilter: "Basculera vers la vue « {{filter}} »",
    detailSyncShopify: "À la confirmation, synchronisera sur Shopify",
    detailTargetLang: "Langue cible : {{lang}}",
    detailTargetStatus: "Statut cible : {{status}}",
    explainMatchDetail: "Expliquera {{mode}} pour « {{title}} »",
    fieldAll: "tout le contenu",
    fieldDescription: "description",
    fieldTitle: "titre",
    filterAll: "Tous les produits",
    filterAllActive: "Tous les produits actifs",
    filterConfirmed: "Confirmés",
    filterConfirmedProducts: "Produits confirmés",
    filterNewArrivals: "Nouveautés",
    filterPending: "En attente IA",
    filterPendingProducts: "Produits en attente",
    filterUnbound: "Non liés",
    filterUnboundProducts: "Produits non associés",
    matchModeReason: "base de recommandation",
    matchModeRisk: "incertitudes",
    noProductSelected: "Aucun produit sélectionné",
    opArchiveProduct: "Archiver le produit",
    opBatchArchive: "Archiver en lot",
    opBatchDraft: "Mettre en brouillon en lot",
    opBatchUpdateCopy: "Modifier le contenu en lot",
    opBatchUpdatePrice: "Modifier les prix en lot",
    opDraftProduct: "Mettre en brouillon",
    opExecute: "Exécuter la commande",
    opExplainMatch: "Expliquer la correspondance",
    opFocusProduct: "Focus produit",
    opOpenFilter: "Changer le filtre de liste",
    opOpenPricing: "Ouvrir les paramètres de prix",
    opRerunSearch: "Relancer les candidats",
    opUnknown: "Commande inconnue",
    opUpdateCopy: "Modifier le contenu du produit",
    opUpdatePrice: "Modifier le prix du produit",
    productFallback: "Produit {{id}}",
    targetScopeCount: "{{label}} · {{count}}",
    targetShopPricing: "Prix du magasin",
    targetUnspecifiedLang: "Langue non spécifiée",
    targetUnspecifiedPrice: "Prix non spécifié",
  };
}

function esAgentProducts(en) {
  return {
    ...en,
    actionBatchProductField: "Lote {{action}} producto {{field}}",
    actionFocusProduct: "Enfocar producto",
    actionLocalize: "Localizar",
    actionLocalizeLang: " a {{lang}}",
    actionOptimize: "Optimizar",
    actionPricingStrategy: "Estrategia de precios",
    actionProductField: "{{action}} producto {{field}}",
    actionRerunCandidates: "Volver a buscar candidatos",
    actionRewrite: "Reescribir",
    clarifyAlreadyStatus: "« {{title}} » ya está {{status}} — no se requiere acción.",
    clarifyAmbiguous:
      "Se encontraron varios productos similares. Seleccione uno e intente de nuevo: {{matches}}",
    clarifyCannotExecute: "No se puede ejecutar este comando.",
    clarifyInvalidPrice:
      "Indique un precio de Shopify válido, p. ej. « cambiar el precio a 9,9 $ ».",
    clarifyMissingLang:
      "Especifique el idioma objetivo, p. ej. « traducir el título al inglés ».",
    clarifyMissingLangBatch:
      "Especifique el idioma objetivo, p. ej. « traducir todos los títulos al inglés ».",
    clarifyMissingPricing:
      "Especifique el método de precio, p. ej. « precio a 2× costo » o « todos los precios a 9,9 ».",
    clarifyNoActiveInScope: "No hay productos activos en « {{label}} ».",
    clarifyNoProductsInScope:
      "No hay productos en « {{label}} » — acción por lotes imposible.",
    clarifyNotFound:
      "Ningún producto coincide con « {{hint}} ». Seleccione de la lista o use un título más completo.",
    clarifyPriceOutOfRange: "Precio fuera del rango permitido — verifique el monto.",
    clarifySelectForCopy:
      "Seleccione primero un producto en la lista, luego diga « traducir el título de este producto ».",
    clarifySelectForExplain:
      "Seleccione un producto o nómbrelo (p. ej. explicar por qué se recomendó « pantuflas »).",
    clarifySelectForFocus:
      "Seleccione un producto o nómbrelo (p. ej. cambiar « pantuflas » a 9,9 $).",
    clarifySelectForPrice:
      "Seleccione primero un producto, luego diga « cambiar el precio de este producto a 22,9 ».",
    clarifySelectForRerun:
      "Seleccione un producto o nómbrelo (p. ej. encontrar más candidatos para « pantuflas »).",
    clarifySelectForStatus:
      "Seleccione un producto o nómbrelo (p. ej. mover « pantuflas » a borrador).",
    detailActionType: "Acción: {{action}}",
    detailBatchCopySync:
      "Al confirmar, generará nuevos títulos y sincronizará cada producto en Shopify",
    detailBatchPriceSync:
      "Al confirmar, actualizará el precio de cada producto en Shopify",
    detailBatchScope: "Alcance: {{label}} ({{count}} productos activos)",
    detailBatchScopeProducts: "Alcance: {{label}} ({{count}} productos)",
    detailBatchSyncShopify: "Al confirmar, sincronizará cada producto en Shopify",
    detailContextProduct: "Contexto actual: {{title}}",
    detailCopySyncShopify:
      "Al confirmar, generará un nuevo título y sincronizará en Shopify",
    detailCurrentStatus: "Estado actual: {{status}}",
    detailExplainThenLocate:
      "Localizará primero « {{title}} », luego explicará la base de coincidencia",
    detailFieldTarget: "Campo objetivo: {{field}}",
    detailLocateProduct: "Localizará en la lista: {{title}}",
    detailModeAmazon:
      "Modo: reducción de ruido + estructura Amazon (filtra mayorista/cross-border/marketing; no traducción literal)",
    detailModeLiteral: "Modo: traducción literal",
    detailNewPrice: "Nuevo precio: {{currency}} {{price}}",
    detailOpenPricing: "Abrirá la barra lateral de estrategia de precios",
    detailPriceScope:
      "Al confirmar, elegirá el alcance (todos los SKU o un SKU)",
    detailPricingFixed: "Precio: fijo {{price}}",
    detailPricingMultiplier: "Precio: costo × {{multiplier}}",
    detailRerunSearch:
      "Abrirá búsqueda por imagen y cargará candidatos para « {{title}} »",
    detailSwitchFilter: "Cambiará a la vista « {{filter}} »",
    detailSyncShopify: "Al confirmar, sincronizará en Shopify",
    detailTargetLang: "Idioma objetivo: {{lang}}",
    detailTargetStatus: "Estado objetivo: {{status}}",
    explainMatchDetail: "Explicará {{mode}} para « {{title}} »",
    fieldAll: "todo el contenido",
    fieldDescription: "descripción",
    fieldTitle: "título",
    filterAll: "Todos los productos",
    filterAllActive: "Todos los productos activos",
    filterConfirmed: "Confirmados",
    filterConfirmedProducts: "Productos confirmados",
    filterNewArrivals: "Novedades",
    filterPending: "Pendiente IA",
    filterPendingProducts: "Productos pendientes",
    filterUnbound: "Sin vincular",
    filterUnboundProducts: "Productos sin coincidencia",
    matchModeReason: "base de recomendación",
    matchModeRisk: "incertidumbres",
    noProductSelected: "Ningún producto seleccionado",
    opArchiveProduct: "Archivar producto",
    opBatchArchive: "Archivar en lote",
    opBatchDraft: "Mover a borrador en lote",
    opBatchUpdateCopy: "Actualizar contenido en lote",
    opBatchUpdatePrice: "Actualizar precios en lote",
    opDraftProduct: "Mover a borrador",
    opExecute: "Ejecutar comando",
    opExplainMatch: "Explicar coincidencia",
    opFocusProduct: "Enfocar producto",
    opOpenFilter: "Cambiar filtro de lista",
    opOpenPricing: "Abrir configuración de precios",
    opRerunSearch: "Volver a buscar candidatos",
    opUnknown: "Comando desconocido",
    opUpdateCopy: "Actualizar contenido del producto",
    opUpdatePrice: "Actualizar precio del producto",
    productFallback: "Producto {{id}}",
    targetScopeCount: "{{label}} · {{count}}",
    targetShopPricing: "Precios de la tienda",
    targetUnspecifiedLang: "Idioma no especificado",
    targetUnspecifiedPrice: "Precio no especificado",
  };
}

function frProductsActiveTask(en) {
  return {
    ...en,
    connectShopTitle: "Connectez d'abord votre boutique",
    connectShopReason: "Autorisez pour analyser les produits et configurer les prix.",
    connectShopAction: "Autoriser",
    configurePricingTitle: "Configurer les prix",
    configurePricingReason:
      "Les prix suggérés sont peu fiables tant que la tarification n'est pas configurée.",
    configurePricingAction: "Configurer maintenant",
    confirmPendingTitle: "Confirmer {{count}} liens en attente",
    confirmPendingReason: "Confirmez ou re-liez pour continuer.",
    confirmPendingAction: "Tout confirmer ({{count}})",
    unboundTitle: "{{count}} non liés",
    unboundReason:
      "Lancez une recherche d'image par lot pour associer les sources aux produits non liés.",
    unboundAction: "Lier en lot",
    discoverTitle: "Découvrir de nouveaux produits",
    discoverReason:
      "Les liens actifs sont prêts — ajoutez des sources depuis le catalogue.",
    discoverAction: "Ouvrir la découverte",
    optimizeFiltersTitle: "Affiner les filtres",
    optimizeFiltersReasonCategory: "Réduire par « {{category}} ».",
    optimizeFiltersReasonDefault:
      "Utilisez une catégorie ou une fourchette de prix avant la mise en ligne.",
    optimizeFiltersAction: "Suggestions de filtres",
  };
}

function esProductsActiveTask(en) {
  return {
    ...en,
    connectShopTitle: "Conecte su tienda primero",
    connectShopReason: "Autorice para analizar productos y configurar precios.",
    connectShopAction: "Autorizar",
    configurePricingTitle: "Configurar precios",
    configurePricingReason:
      "Los precios sugeridos no son fiables hasta configurar la tarificación.",
    configurePricingAction: "Configurar ahora",
    confirmPendingTitle: "Confirmar {{count}} enlaces pendientes",
    confirmPendingReason: "Confirme o re-enlace para continuar.",
    confirmPendingAction: "Confirmar todo ({{count}})",
    unboundTitle: "{{count}} sin vincular",
    unboundReason:
      "Ejecute búsqueda por imagen por lotes para asociar fuentes a productos sin vincular.",
    unboundAction: "Vincular en lote",
    discoverTitle: "Descubrir nuevos productos",
    discoverReason:
      "Los enlaces activos están listos — agregue fuentes desde el catálogo.",
    discoverAction: "Abrir descubrimiento",
    optimizeFiltersTitle: "Refinar filtros",
    optimizeFiltersReasonCategory: "Reducir por « {{category}} ».",
    optimizeFiltersReasonDefault:
      "Use categoría o rango de precio antes de publicar.",
    optimizeFiltersAction: "Sugerencias de filtros",
  };
}

function frProductsSourcing(en) {
  return {
    ...en,
    unauthorizedSummary: "Autorisez d'abord la boutique",
    unauthorizedExpl:
      "Le statut d'approvisionnement et les suggestions de sources dépendent d'une boutique connectée.",
    unauthorizedNext: "Autorisez Shopify, puis revenez à Smart Sourcing",
    scanDone:
      "Premier scan IA terminé : {{productCount}} produits analysés, {{matchedCount}} correspondances recommandées",
    scanDonePending: ", {{pendingCount}} en attente de votre confirmation",
    analyzedSellable: "{{count}} produits actifs analysés",
    matchBreakdown:
      "Associés (dont en attente) : {{matched}} · En attente : {{pending}} · Non associés : {{unbound}}",
    rateShared:
      "Taux {{rate}} ({{currency}}) : coût d'achat et prix de vente partagent le taux ; l'affichage d'achat exclut la marge multiplicateur",
    listingPricingPrefix: "Prix de vente : ",
    listingNotConfigured:
      "Prix de vente pas encore configuré (configurez les prix avant les suggestions Discovery)",
    recCats: "Catégories recommandées : {{cats}}",
    currentFilters: "Filtres Discovery actuels : {{filters}}",
    nextConfigurePricing: "Configurez d'abord les prix, puis continuez l'approvisionnement",
    nextPending: "Prioriser {{count}} liens en attente",
    nextUnbound: "Trouver des sources pour {{count}} produits non associés",
    nextDiscover: "Ouvrir Discovery pour ajouter des sources et publier",
    summaryReady: "Statut d'approvisionnement actuel",
    summaryNotReady: "Analyse pas encore prête",
    filterRecCat: "Selon les produits actifs, essayez les catégories : {{cats}}",
    filterNoCat: "Pas encore de données de catégorie ; réduisez par mot-clé ou fourchette de prix.",
    filterChosen: "Votre sélection actuelle : {{filters}}",
    filterNone: "Aucun filtre supplémentaire sous l'onglet Discovery.",
    filterPricingTip:
      "Sans tarification, les filtres par prix sont moins utiles — configurez d'abord les prix.",
    filterCurrencyTip:
      "Devise cible {{currency}} : filtrez par fourchette de prix suggéré, puis ajustez la marge.",
    suggestFiltersSummary: "Suggestions de filtres",
    stepOpenDiscover: "Ouvrir Discovery",
    stepTryCat: "Essayer la catégorie recommandée « {{cat}} »",
    stepKeyword: "Réduire par mot-clé ou fourchette USD",
    pendingEmptySummary: "Aucun produit en attente",
    pendingEmptyExpl:
      "Aucun lien IA en attente ; vérifiez les non associés ou Discovery.",
    viewUnbound: "Voir {{count}} produits non associés",
    pendingSummary: "{{count}} en attente",
    pendingExpl1:
      "En attente signifie que l'IA a trouvé des sources candidates — confirmez ou re-liez.",
    pendingExpl2:
      "Traitez d'abord les en attente avant les non associés pour éviter le double travail.",
    stepSwitchPending: "Passer à Produits boutique et filtrer en attente",
    stepConfirmEach: "Confirmer chaque lien ou changer la source",
    unboundEmptySummary: "Aucun produit non associé",
    unboundEmptyExpl:
      "Tous les produits actifs sont liés ou en attente ; ouvrez Discovery pour élargir.",
    unboundSummary: "{{count}} non associés",
    unboundExpl1:
      "Les produits non associés n'ont pas encore de source Tangbuy ; recherche d'image ou correspondance manuelle avant logistique et sync.",
    unboundExplPending: "Aussi {{pending}} en attente — traitez ensemble.",
    unboundExplAfter: "Après les non associés, continuez dans Discovery.",
    stepSwitchUnbound: "Passer à Produits boutique et filtrer non associés",
    stepLinkSource: "Lier une source au produit",
    rematchSummary: "Rechercher les sources non associées",
    rematchExpl: "Relancera la recherche d'image pour {{count}} produits non liés.",
    rematchKeepBound: "Les produits déjà liés ne seront pas re-liés.",
    stepStartRematch: "Démarrer la re-recherche",
    stepConfirmInResult: "Confirmer ou re-lier dans les résultats",
    rematchBtnAll: "Re-rechercher tous les non associés",
    rematchEmptyExpl: "Aucun produit non lié — re-recherche inutile.",
    stepViewPendingList: "Voir la liste en attente",
    stepOrDiscover: "Ou ouvrir Discovery",
    btnViewPending: "Voir en attente",
    btnViewUnbound: "Voir non associés",
    btnDiscover: "Discovery",
    discoverSummary: "Découvrir de nouveaux produits",
    discoverExplainMain:
      "Discovery récupère des sources publiables depuis Tangbuy et les tarife avec votre modèle.",
    discoverExplainPricing:
      "La tarification n'est pas encore configurée — les prix suggérés peuvent être imprécis. Configurez d'abord.",
    discoverExplainCategories:
      "Commencez par les catégories recommandées : {{categories}}",
    discoverNextOpenTab: "Ouvrir l'onglet Discovery",
    discoverNextFilter: "Réduire par catégorie ou prix, puis publier",
    discoverAction: "Ouvrir la découverte",
  };
}

function esProductsSourcing(en) {
  return {
    ...en,
    unauthorizedSummary: "Autorice la tienda primero",
    unauthorizedExpl:
      "El estado de abastecimiento y las sugerencias de fuentes dependen de una tienda conectada.",
    unauthorizedNext: "Autorice Shopify y vuelva a Smart Sourcing",
    scanDone:
      "Primer escaneo IA completado: {{productCount}} productos analizados, {{matchedCount}} coincidencias recomendadas",
    scanDonePending: ", {{pendingCount}} pendientes de su confirmación",
    analyzedSellable: "{{count}} productos activos analizados",
    matchBreakdown:
      "Vinculados (incl. pendientes): {{matched}} · Pendientes: {{pending}} · Sin coincidencia: {{unbound}}",
    rateShared:
      "Tasa {{rate}} ({{currency}}): costo de compra y precio de venta comparten la tasa; la visualización de compra excluye el multiplicador",
    listingPricingPrefix: "Precio de venta: ",
    listingNotConfigured:
      "Precio de venta aún no configurado (configure precios antes de las sugerencias Discovery)",
    recCats: "Categorías recomendadas: {{cats}}",
    currentFilters: "Filtros Discovery actuales: {{filters}}",
    nextConfigurePricing: "Configure precios primero, luego continúe el abastecimiento",
    nextPending: "Priorizar {{count}} enlaces pendientes",
    nextUnbound: "Encontrar fuentes para {{count}} productos sin coincidencia",
    nextDiscover: "Abrir Discovery para agregar fuentes y publicar",
    summaryReady: "Estado de abastecimiento actual",
    summaryNotReady: "Análisis aún no listo",
    filterRecCat: "Según productos activos, pruebe categorías: {{cats}}",
    filterNoCat: "Sin datos de categoría aún; reduzca por palabra clave o rango de precio.",
    filterChosen: "Su selección actual: {{filters}}",
    filterNone: "Sin filtros extra en la pestaña Discovery.",
    filterPricingTip:
      "Sin tarificación, los filtros por precio son menos útiles — configure precios primero.",
    filterCurrencyTip:
      "Moneda objetivo {{currency}}: filtre por rango de precio sugerido, luego ajuste el margen.",
    suggestFiltersSummary: "Sugerencias de filtros",
    stepOpenDiscover: "Abrir Discovery",
    stepTryCat: "Probar la categoría recomendada « {{cat}} »",
    stepKeyword: "Reducir por palabra clave o rango USD",
    pendingEmptySummary: "Sin productos pendientes",
    pendingEmptyExpl:
      "Sin enlaces IA pendientes; revise sin coincidencia o Discovery.",
    viewUnbound: "Ver {{count}} productos sin coincidencia",
    pendingSummary: "{{count}} pendientes",
    pendingExpl1:
      "Pendiente significa que la IA encontró fuentes candidatas — confirme o re-enlace.",
    pendingExpl2:
      "Limpie pendientes antes de sin coincidencia para evitar trabajo duplicado.",
    stepSwitchPending: "Cambiar a Productos tienda y filtrar pendientes",
    stepConfirmEach: "Confirmar cada uno o cambiar fuente",
    unboundEmptySummary: "Sin productos sin coincidencia",
    unboundEmptyExpl:
      "Todos los productos activos están vinculados o pendientes; abra Discovery para ampliar.",
    unboundSummary: "{{count}} sin coincidencia",
    unboundExpl1:
      "Los productos sin coincidencia aún no tienen fuente Tangbuy; búsqueda por imagen o coincidencia manual antes de logística y sync.",
    unboundExplPending: "También {{pending}} pendientes — trátelos juntos.",
    unboundExplAfter: "Después de sin coincidencia, continúe en Discovery.",
    stepSwitchUnbound: "Cambiar a Productos tienda y filtrar sin coincidencia",
    stepLinkSource: "Vincular una fuente al producto",
    rematchSummary: "Re-buscar fuentes sin coincidencia",
    rematchExpl: "Re-ejecutará búsqueda por imagen para {{count}} productos sin vincular.",
    rematchKeepBound: "Los productos ya vinculados no se re-vincularán.",
    stepStartRematch: "Iniciar re-búsqueda",
    stepConfirmInResult: "Confirmar o re-vincular en resultados",
    rematchBtnAll: "Re-buscar todos sin coincidencia",
    rematchEmptyExpl: "Sin productos sin vincular — re-búsqueda innecesaria.",
    stepViewPendingList: "Ver lista pendiente",
    stepOrDiscover: "O abrir Discovery",
    btnViewPending: "Ver pendientes",
    btnViewUnbound: "Ver sin coincidencia",
    btnDiscover: "Discovery",
    discoverSummary: "Descubrir nuevos productos",
    discoverExplainMain:
      "Discovery obtiene fuentes publicables de Tangbuy y las tarifica con su plantilla.",
    discoverExplainPricing:
      "La tarificación aún no está configurada — los precios sugeridos pueden ser imprecisos. Configure primero.",
    discoverExplainCategories:
      "Comience con categorías recomendadas: {{categories}}",
    discoverNextOpenTab: "Abrir pestaña Discovery",
    discoverNextFilter: "Reducir por categoría o precio, luego publicar",
    discoverAction: "Abrir descubrimiento",
  };
}

function frProductsPricing(en) {
  return {
    ...en,
    summaryMissing: "Modèle de prix pas encore chargé",
    summaryConfigured: "{{currency}} · taux {{rate}} · ×{{multiplier}}",
    summaryConfiguredAddend:
      "{{currency}} · taux {{rate}} · ×{{multiplier}} · +{{addend}}",
    summaryDefault: "Tarification non configurée (défaut système)",
    purchaseFromTemplate:
      "Affichage achat : {{currency}} · taux {{rate}} (aligné sur la tarification ; sans marge multiplicateur)",
    purchaseDefault:
      "Affichage achat : {{currency}} · taux par défaut {{rate}} (sans marge multiplicateur)",
    configuredSummary: "Tarification configurée — ajustez si besoin",
    configuredExpl:
      "Les prix suggérés utilisent le modèle actuel ; les changements se reflètent instantanément dans Discovery et l'aperçu.",
    stepOpenPricingSidebar:
      "Ouvrir la barre latérale de prix pour ajuster taux, multiplicateur ou addend",
    stepSaveThenContinue: "Enregistrer, puis continuer l'approvisionnement ou la mise en ligne",
    notConfiguredSummary: "Configurez d'abord la stratégie de prix",
    defaultTemplateExpl1:
      "Toujours sur le modèle par défaut ; les prix suggérés peuvent manquer votre marge.",
    defaultTemplateExpl2:
      "Après devise, taux et multiplicateur, Discovery et l'aperçu tarifient selon vos règles.",
    stepOpenRightSidebar: "Ouvrir la barre latérale de prix à droite",
    stepFillRateSave: "Remplir taux et multiplicateur, puis enregistrer",
    unauthorizedSummary: "Autorisez avant de configurer les prix du magasin",
    unauthorizedExpl1:
      "Le modèle de prix est par boutique : devise, taux, multiplicateur définissent le prix suggéré.",
    unauthorizedExpl2: "Autorisez d'abord la boutique, puis revenez configurer.",
    stepGoAuthorize: "Aller autoriser la boutique",
    readySummary: "Tarification prête",
    readyExplPath:
      "Chemin de vente : coût (RMB) → ×taux → ×multiplicateur → +addend → arrondi (prix suggéré Discovery uniquement).",
    readyExplShared:
      "Une fois configuré, l'affichage du coût d'achat Shopify et le prix de vente partagent le même taux (sans marge multiplicateur).",
    readyExplSidebar:
      "La carte stratégie s'ajuste à tout moment ; la zone principale gère l'approvisionnement et la mise en ligne.",
    nextPendingOrFilter: "Prioriser les liens en attente",
    nextFilterDiscover: "Filtrer Discovery par prix suggéré pour publier",
    whySummary: "Pourquoi configurer les prix d'abord",
    whyExpl:
      "Sans tarification valide, le système estime les prix Discovery avec taux/multiplicateur par défaut — probablement hors de votre marge cible.",
    whyExplTemplate:
      "Configurez le modèle de vente avant les filtres Discovery ; l'affichage d'achat des produits liés ignore ce multiplicateur.",
    stepClickConfigure:
      "Cliquez « Aller configurer les prix » ci-dessous ou « Configurer maintenant » sur la carte",
    stepSaveTemplate: "Enregistrer le modèle, puis continuer l'approvisionnement",
    btnAdjustPricing: "Ajuster les prix",
    btnConfigureNow: "Configurer maintenant",
    btnViewPricing: "Voir / ajuster les prix",
    btnGoConfigure: "Aller configurer les prix",
  };
}

function esProductsPricing(en) {
  return {
    ...en,
    summaryMissing: "Plantilla de precios aún no cargada",
    summaryConfigured: "{{currency}} · tasa {{rate}} · ×{{multiplier}}",
    summaryConfiguredAddend:
      "{{currency}} · tasa {{rate}} · ×{{multiplier}} · +{{addend}}",
    summaryDefault: "Tarificación no configurada (predeterminado del sistema)",
    purchaseFromTemplate:
      "Visualización compra: {{currency}} · tasa {{rate}} (coincide con tarificación; sin margen multiplicador)",
    purchaseDefault:
      "Visualización compra: {{currency}} · tasa predeterminada {{rate}} (sin margen multiplicador)",
    configuredSummary: "Tarificación configurada — ajuste según necesite",
    configuredExpl:
      "Los precios sugeridos usan la plantilla actual; los cambios se reflejan al instante en Discovery y vista previa.",
    stepOpenPricingSidebar:
      "Abrir barra lateral de precios para ajustar tasa, multiplicador o addend",
    stepSaveThenContinue: "Guardar, luego continuar abastecimiento o publicación",
    notConfiguredSummary: "Configure primero la estrategia de precios",
    defaultTemplateExpl1:
      "Aún en plantilla predeterminada; los precios sugeridos pueden no alcanzar su margen.",
    defaultTemplateExpl2:
      "Tras moneda, tasa y multiplicador, Discovery y vista previa tarifican según sus reglas.",
    stepOpenRightSidebar: "Abrir barra lateral de precios derecha",
    stepFillRateSave: "Complete tasa y multiplicador, luego guarde",
    unauthorizedSummary: "Autorice antes de configurar precios de la tienda",
    unauthorizedExpl1:
      "La plantilla de precios es por tienda: moneda, tasa, multiplicador definen el precio sugerido.",
    unauthorizedExpl2: "Autorice la tienda primero, luego vuelva a configurar.",
    stepGoAuthorize: "Ir a autorizar tienda",
    readySummary: "Tarificación lista",
    readyExplPath:
      "Ruta de venta: costo (RMB) → ×tasa → ×multiplicador → +addend → redondeo (solo precio sugerido Discovery).",
    readyExplShared:
      "Al configurar, la visualización de costo de compra Shopify y el precio de venta comparten la misma tasa (sin margen multiplicador).",
    readyExplSidebar:
      "La tarjeta de estrategia se ajusta en cualquier momento; el área principal gestiona abastecimiento y publicación.",
    nextPendingOrFilter: "Priorizar enlaces pendientes",
    nextFilterDiscover: "Filtrar Discovery por precio sugerido para publicar",
    whySummary: "Por qué configurar precios primero",
    whyExpl:
      "Sin tarificación válida, el sistema estima precios Discovery con tasa/multiplicador predeterminados — probablemente fuera de su margen objetivo.",
    whyExplTemplate:
      "Configure la plantilla de venta antes de filtros Discovery; la visualización de compra de productos vinculados ignora este multiplicador.",
    stepClickConfigure:
      "Haga clic en « Ir a configurar precios » abajo o « Configurar ahora » en la tarjeta",
    stepSaveTemplate: "Guarde plantilla, luego continúe abastecimiento",
    btnAdjustPricing: "Ajustar precios",
    btnConfigureNow: "Configurar ahora",
    btnViewPricing: "Ver / ajustar precios",
    btnGoConfigure: "Ir a configurar precios",
  };
}

const blocks = {
  en: {
    agentProducts: agentProductsEn,
    agentSku: agentSkuEn,
    productsActiveTask: productsActiveTaskEn,
    productsSourcing: productsSourcingEn,
    productsPricing: productsPricingEn,
    productsPreview: productsPreviewEn,
  },
  zh: {
    agentProducts: agentProductsZh,
    agentSku: agentSkuZh,
    productsActiveTask: productsActiveTaskZh,
    productsSourcing: productsSourcingZh,
    productsPricing: productsPricingZh,
    productsPreview: productsPreviewZh,
  },
  fr: {
    agentProducts: frAgentProducts(agentProductsEn),
    agentSku: frAgentSku(agentSkuEn),
    productsActiveTask: frProductsActiveTask(productsActiveTaskEn),
    productsSourcing: frProductsSourcing(productsSourcingEn),
    productsPricing: frProductsPricing(productsPricingEn),
    productsPreview: frProductsPreview(productsPreviewEn),
  },
  es: {
    agentProducts: esAgentProducts(agentProductsEn),
    agentSku: esAgentSku(agentSkuEn),
    productsActiveTask: esProductsActiveTask(productsActiveTaskEn),
    productsSourcing: esProductsSourcing(productsSourcingEn),
    productsPricing: esProductsPricing(productsPricingEn),
    productsPreview: esProductsPreview(productsPreviewEn),
  },
};

function countDollar(src, blockName) {
  const marker = `\n  ${blockName}: {`;
  const start = src.lastIndexOf(marker);
  if (start === -1) return -1;
  let depth = 0;
  let i = src.indexOf("{", start);
  let block = "";
  for (; i < src.length; i++) {
    block += src[i];
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return (block.match(/\$\{/g) || []).length;
}

for (const locale of LOCALES) {
  const file = join(ROOT, "src/i18n/messages", `${locale}.ts`);
  let src = readFileSync(file, "utf8");
  for (const name of BLOCK_NAMES) {
    src = replaceTopLevelBlock(src, name, formatBlock(name, blocks[locale][name]));
  }
  writeFileSync(file, src);
  const counts = BLOCK_NAMES.map((n) => `${n}=${Object.keys(blocks[locale][n]).length}`).join(
    ", "
  );
  const bad = BLOCK_NAMES.filter((n) => countDollar(src, n) > 0).join(", ");
  console.log(
    `${locale}: patched (${counts})${bad ? ` — WARNING ${bad} still has \${}` : ""}`
  );
}
