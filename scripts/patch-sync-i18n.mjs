#!/usr/bin/env node
/**
 * Restore sync-related i18n blocks corrupted by generate-missing-i18n pairing.
 * Run: node scripts/patch-sync-i18n.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["en", "zh", "fr", "es"];
const BLOCK_NAMES = ["sync", "syncUi", "syncCeremony", "launchSummary", "launchReport"];
const EXPECTED_COUNTS = {
  sync: 44,
  syncUi: 14,
  syncCeremony: 29,
  launchSummary: 61,
  launchReport: 26,
};

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
  const marker = `  ${blockName}: {`;
  if (start === -1) throw new Error(`Block ${blockName} not found`);
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

/** Top-level namespace blocks only — avoids nested keys like steps.sync. */
function replaceTopLevelBlock(src, blockName, newContent) {
  const marker = `\n  ${blockName}: {`;
  const start = src.lastIndexOf(marker);
  if (start === -1) throw new Error(`Top-level block ${blockName} not found`);
  return replaceBlockAt(src, blockName, newContent, start + 1);
}

const stepsSync = {
  en: { desc: "Push mapping and fulfillment config", title: "Sync to store" },
  zh: { desc: "推送映射与履约配置", title: "同步到店铺" },
  fr: { desc: "Pousser le mapping et la configuration fulfillment", title: "Sync vers la boutique" },
  es: { desc: "Enviar mapeo y configuración de fulfillment", title: "Sync a la tienda" },
};

function restoreStepsSync(src, locale) {
  const entry = stepsSync[locale];
  const replacement = `    sync: {
      desc: ${JSON.stringify(entry.desc)},
      title: ${JSON.stringify(entry.title)},
    },`;
  const re = /    sync: \{[\s\S]*?\n  \},\n  \},/;
  if (!re.test(src)) throw new Error(`steps.sync block not found in ${locale}.ts`);
  return src.replace(re, `${replacement}\n  },`);
}

function assertFlatStrings(locale, blockName, obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== "string") {
      throw new Error(`${locale}.${blockName}.${key} must be a string`);
    }
    if (value.includes("${")) {
      throw new Error(`${locale}.${blockName}.${key} contains unsupported interpolation`);
    }
  }
}

function validateLocaleBlocks(locale, localeBlocks) {
  for (const blockName of BLOCK_NAMES) {
    const obj = localeBlocks[blockName];
    if (!obj) throw new Error(`Missing ${locale}.${blockName}`);
    const actual = Object.keys(obj).length;
    const expected = EXPECTED_COUNTS[blockName];
    if (actual !== expected) {
      throw new Error(
        `Unexpected key count for ${locale}.${blockName}: expected ${expected}, got ${actual}`
      );
    }
    assertFlatStrings(locale, blockName, obj);
  }
}

const blocks = {
  en: {
    sync: {
      auditGapNote:
        "Title and price optimizations will show after workflow auditing is connected.",
      auditPending: "Awaiting audit",
      cardFulfillment: "Ready for fulfillment · Tangbuy",
      cardShopify: "Live on Shopify",
      completedDesc: "Your products are linked, mapped, and ready to sell.",
      completedTitle: "Store setup complete",
      ctaViewListed: "View listed products",
      ctaViewSku: "View SKU mapping",
      currentStrategy: "Current strategy",
      exportSoon: "Report export is coming soon.",
      footnoteFulfillment:
        "SKU and logistics settings are saved on the fulfillment side for purchasing and order handling.",
      fulfillmentConfirmHint: "Stored locally",
      fulfillmentPrepFootnote:
        "SKU mapping is written to the Tangbuy backend; logistics route confirmation and template strategy are staged in this app and not yet synced to fulfillment.",
      fulfillmentSavedDetail:
        "Logistics route confirmation is stored locally and not yet synced to fulfillment; you can continue the setup flow.",
      fulfillmentSavedShort:
        "Logistics confirmation is stored locally, not yet synced to fulfillment.",
      goProducts: "Go to product linking",
      kindException: "Exception pending",
      kindSkipped: "Skipped",
      kindSuccess: "Synced",
      launchProgressFootnote:
        "Completion is weighted by source linking, SKU mapping, and local logistics confirmation; logistics is not yet synced to fulfillment.",
      loadError: "Could not load setup data. Please retry later.",
      mLogisticsConfirm: "Logistics confirmed",
      mPendingReview: "Pending review",
      mPriceAdj: "Price adjustments",
      mSkuMap: "SKU mapping",
      mSourceConfirmed: "Sources confirmed",
      mSourceLinks: "Source links",
      mTitleOpt: "Title optimizations",
      noPreview: "Store products loaded, but no main image or title to preview yet.",
      noProducts: "No product data in the store yet",
      pricing: "Pricing",
      pricingSourceLabel: "Purchase price (CNY)",
      reviewing: "Reviewing completed steps, please wait…",
      shopifyFootnote:
        "Above data comes from the store mirror and source binding records. Title/price optimization counts appear after workflow auditing is connected.",
      skuDetails: "SKU details",
      summarizing: "Summarizing setup data…",
      summaryExceptions: "Exceptions",
      summaryFulfillment: "Auto-fulfillment ready",
      summaryLinked: "Linked products",
      summaryListed: "Listed products",
      summaryLogistics: "Logistics configured",
      summarySkipped: "Skipped",
      title: "Sync to store",
      viewProducts: "View products",
    },
    syncUi: {
      carouselCount: " · showing {{count}} in preview",
      charsRevealed: "{{revealed}} / {{total}} chars",
      followUpTitle: "{{count}} follow-ups to review",
      launchReportTitle: "Launch report",
      logisticsStrategy: "Logistics strategy",
      nextProductAria: "Next product",
      noImage: "No image",
      noProductsToShow: "No products to show yet",
      prevProductAria: "Previous product",
      pricingStrategy: "Pricing strategy",
      productPrepTitle: "Product readiness",
      scannedCount: "Scanned {{processed}} / {{total}} products",
      stepCompleted: "Completed",
      strategyTitle: "Strategy summary",
    },
    syncCeremony: {
      completionCongrats: "Everything is ready for launch",
      completionDesc:
        "Your product linking, SKU mapping, and launch checklist are in place. Review the summary or continue operating the store.",
      completionHeading: "Store setup",
      completionHeadingLine2: "complete",
      enterWorkbench: "Enter workbench",
      exportReport: "Export report",
      openShopifyAdmin: "Open Shopify admin",
      pendingOptimizations: "Pending optimizations",
      progressTitle: "Progress",
      statLogistics: "Logistics",
      statProducts: "Products",
      statQuoted: "{{count}} quoted",
      statSku: "SKU mapping",
      statSources: "Source links",
      statSourcesConfirmed: "{{count}} confirmed",
      taskLogistics: "Confirm logistics plans",
      taskLogisticsConfirmed: "{{confirmed}} confirmed / {{total}}",
      taskLogisticsQuoted: "{{quoted}} quoted, {{confirmed}} confirmed / {{total}}",
      taskProductsDetail: "{{shown}} / {{total}} products",
      taskReport: "Generate launch report",
      taskReportDone: "Done",
      taskReportGenerating: "Generating",
      taskScanProducts: "Scan store products",
      taskSkuDetail: "{{shown}} / {{total}} variants",
      taskSkuEmpty: "No SKU data yet",
      taskSkuMap: "Check SKU mapping",
      taskSourceDetail: "{{shown}} / {{total}} linked",
      taskSourceLinks: "Link source offers",
      viewSummary: "View summary",
    },
    launchSummary: {
      checkInLaunchList: "Included in launch checklist",
      checkLogisticsConfirmed: "Logistics confirmed",
      checkSkuComplete: "All SKU variants mapped",
      checkSkuPartial: "{{aligned}} / {{total}} variants mapped",
      checkSourceLinked: "Source linked",
      checkSourcePending: "Source candidate pending",
      followUpBindingPendingAction: "Review matches",
      followUpBindingPendingDesc:
        "AI found likely sources, but they still need your confirmation.",
      followUpBindingPendingTitle: "{{count}} source matches waiting for confirmation",
      followUpLogisticsAction: "Review logistics",
      followUpLogisticsDesc:
        "Requote or confirm routes before handing orders to fulfillment.",
      followUpLogisticsTitle: "{{count}} logistics items need review",
      followUpUnboundAction: "Link sources",
      followUpUnboundDesc:
        "These products are listed, but no purchasing source is linked yet.",
      followUpUnboundTitle: "{{count}} products still need a source",
      followUpUnmappedAction: "Review SKU mapping",
      followUpUnmappedDesc:
        "Complete variant-to-source mapping before you route orders.",
      followUpUnmappedTitle: "{{count}} SKU variants still need mapping",
      marketsNotConfigured: "Markets not configured",
      packMinimal: "Minimal packaging",
      packReinforced: "Reinforced packaging",
      packStandard: "Standard packaging",
      pricingDefault: "Default pricing rules",
      pricingNotSaved: "Custom pricing template not saved",
      pricingRounding: "Rounding: {{strategy}}",
      speedBalanced: "Balanced",
      speedEconomy: "Economy",
      speedFast: "Fast",
      statFollowUp: "Follow-ups",
      statFollowUpCount: "{{count}} items to review",
      statFollowUpNone: "No follow-ups",
      statLogistics: "Logistics",
      statLogisticsConfirmed: "{{confirmed}} confirmed / {{total}}",
      statLogisticsQuoted: "{{quoted}} quoted, {{confirmed}} confirmed / {{total}}",
      statSkuDetail: "{{aligned}} / {{total}} variants",
      statSkuMapping: "SKU mapping",
      statSourceDetail: "{{linked}} / {{total}} linked",
      statSourceLinks: "Source links",
      strategyDash: "—",
      timelineAi: "AI optimization",
      timelineAiBadge: "Completed",
      timelineAiSummaryConfirmed: "{{count}} sources confirmed by AI",
      timelineAiSummaryDefault: "AI suggestions prepared for review",
      timelineAuth: "Store authorized",
      timelineAuthBadge: "Completed",
      timelineAuthSummary: "Shopify access is connected and base data is available.",
      timelineLogistics: "Logistics",
      timelineLogisticsBadge: "Completed",
      timelineLogisticsSummary: "{{confirmed}} / {{total}} confirmed",
      timelineLogisticsSummaryEmpty: "No logistics data yet",
      timelineProducts: "Source linking",
      timelineProductsBadge: "Completed",
      timelineProductsSummary: "{{linked}} / {{total}} linked",
      timelineSku: "SKU mapping",
      timelineSkuBadge: "Completed",
      timelineSkuSummary: "{{aligned}} / {{total}} variants mapped",
      timelineSkuSummaryEmpty: "No SKU data yet",
      timelineSync: "Sync complete",
      timelineSyncBadge: "Current",
      timelineSyncSummary: "Launch summary and next-step checklist generated",
      unnamedProduct: "Untitled product",
    },
    launchReport: {
      defaultShopLabel: "your store",
      demoNote: "Demo data shown.",
      followUpList: "{{count}} follow-ups remain: {{titles}}.",
      followUpNone: "No blocking follow-ups were found after this launch review.",
      footer: "Summary generated from current setup data. {{demoNote}}",
      introMirror:
        "Shop mirror is synced with {{productsTotal}} products, with {{ceremonyCount}} highlighted in this launch review",
      introRest: "; the rest remain available in the product workspace.",
      introRestAligned: ".",
      justCompleted: "just now",
      logisticsConfirmed: "{{count}} confirmed",
      logisticsIntro: "Logistics: {{total}} variants in scope",
      logisticsNoData:
        "Logistics: no route data yet. Current strategy: {{markets}} · {{speed}}.",
      logisticsQuoted: "{{count}} quoted",
      logisticsRemain: "{{count}} still pending",
      logisticsTemplate: " Current strategy: {{markets}} · {{speed}} · {{packaging}}.",
      pricingNone:
        "Pricing: no dedicated template saved yet; listings will follow the store default.",
      pricingSaved:
        "Pricing: {{sourceLabel}} × {{exchangeRate}} × {{multiplier}} + {{addend}} -> {{targetCurrency}}. {{rounding}}.",
      skuMapped: "SKU mapping: {{mapped}} / {{total}} variants aligned ({{percent}}%)",
      skuNone: "SKU mapping: no variant data is available yet.",
      skuPendingReview: "; {{count}} still need review",
      sourceConfirmed: "{{count}} confirmed",
      sourceLinked: "Source linking: {{linked}} / {{total}} connected",
      sourceListed: "{{count}} already live in Shopify",
      sourceNone: "Source linking: no purchasing sources are linked yet.",
      sourcePending: "{{count}} awaiting confirmation",
      title: "{{shopLabel}} launch summary · completed {{completedAt}}",
    },
  },
  zh: {
    sync: {
      auditGapNote: "标题与价格优化将在接入工作流审计后展示。",
      auditPending: "待接入审计",
      cardFulfillment: "已备履约 Tangbuy",
      cardShopify: "已上店 Shopify",
      completedDesc: "你的商品已关联、已对齐，可以开售了。",
      completedTitle: "开店准备完成",
      ctaViewListed: "查看已上架商品",
      ctaViewSku: "查看 SKU 映射详情",
      currentStrategy: "当前策略",
      exportSoon: "准备报告导出功能即将上线。",
      footnoteFulfillment: "SKU 与物流配置保存在履约侧，用于后续采购与订单处理。",
      fulfillmentConfirmHint: "暂存本应用",
      fulfillmentPrepFootnote:
        "SKU 映射已写入 Tangbuy 后端；物流线路确认与模板策略暂存于本应用，尚未同步履约系统。",
      fulfillmentSavedDetail:
        "物流线路确认已暂存于本应用，尚未同步履约系统；可继续完成开店流程。",
      fulfillmentSavedShort: "物流确认已暂存于本应用，尚未同步履约系统。",
      goProducts: "去选品页",
      kindException: "待处理异常",
      kindSkipped: "已跳过",
      kindSuccess: "已同步",
      launchProgressFootnote:
        "完成度由货源关联、SKU 映射、本地物流确认记录加权计算；物流尚未同步履约系统。",
      loadError: "无法加载开店准备数据，请稍后重试。",
      mLogisticsConfirm: "物流确认",
      mPendingReview: "待复核",
      mPriceAdj: "价格调整",
      mSkuMap: "SKU 映射",
      mSourceConfirmed: "货源已确认",
      mSourceLinks: "货源关联",
      mTitleOpt: "标题优化",
      noPreview: "店铺商品已加载，但暂无可展示的主图或标题",
      noProducts: "店铺暂无商品数据",
      pricing: "定价",
      pricingSourceLabel: "采购价 (CNY)",
      reviewing: "正在回顾各步骤已完成的操作，请稍候…",
      shopifyFootnote:
        "以上数据来自店铺镜像与货源绑定记录。标题/价格优化次数需接入工作流审计后展示。",
      skuDetails: "SKU 详情",
      summarizing: "正在汇总开店准备数据…",
      summaryExceptions: "异常项",
      summaryFulfillment: "自动履约就绪",
      summaryLinked: "已关联商品",
      summaryListed: "已上架商品",
      summaryLogistics: "物流已配置",
      summarySkipped: "已跳过",
      title: "同步到店铺",
      viewProducts: "查看商品",
    },
    syncUi: {
      carouselCount: " · 预览 {{count}} 个商品",
      charsRevealed: "已显示 {{revealed}} / {{total}} 字",
      followUpTitle: "待处理事项 {{count}} 项",
      launchReportTitle: "开店准备报告",
      logisticsStrategy: "物流策略",
      nextProductAria: "下一个商品",
      noImage: "无图片",
      noProductsToShow: "暂无可展示商品",
      prevProductAria: "上一个商品",
      pricingStrategy: "定价策略",
      productPrepTitle: "商品准备进度",
      scannedCount: "已扫描 {{processed}} / {{total}} 个商品",
      stepCompleted: "已完成",
      strategyTitle: "策略概览",
    },
    syncCeremony: {
      completionCongrats: "开店准备已经就绪",
      completionDesc: "货源关联、SKU 映射与开店检查清单已准备完成，可先查看总结再继续运营店铺。",
      completionHeading: "开店准备",
      completionHeadingLine2: "已完成",
      enterWorkbench: "进入工作台",
      exportReport: "导出报告",
      openShopifyAdmin: "打开 Shopify 后台",
      pendingOptimizations: "待处理优化项",
      progressTitle: "进度",
      statLogistics: "物流确认",
      statProducts: "商品",
      statQuoted: "已报价 {{count}}",
      statSku: "SKU 映射",
      statSources: "货源关联",
      statSourcesConfirmed: "已确认 {{count}}",
      taskLogistics: "确认物流方案",
      taskLogisticsConfirmed: "已确认 {{confirmed}} / {{total}}",
      taskLogisticsQuoted: "已报价 {{quoted}}，已确认 {{confirmed}} / {{total}}",
      taskProductsDetail: "{{shown}} / {{total}} 个商品",
      taskReport: "生成开店准备报告",
      taskReportDone: "完成",
      taskReportGenerating: "生成中",
      taskScanProducts: "扫描店铺商品",
      taskSkuDetail: "{{shown}} / {{total}} 个变体",
      taskSkuEmpty: "暂无 SKU 数据",
      taskSkuMap: "核对 SKU 映射",
      taskSourceDetail: "已关联 {{shown}} / {{total}}",
      taskSourceLinks: "关联货源",
      viewSummary: "查看总结",
    },
    launchSummary: {
      checkInLaunchList: "已纳入开店准备清单",
      checkLogisticsConfirmed: "物流线路已确认",
      checkSkuComplete: "SKU 映射已完成",
      checkSkuPartial: "SKU 已对齐 {{aligned}} / {{total}}",
      checkSourceLinked: "已绑定采购货源",
      checkSourcePending: "货源候选待确认",
      followUpBindingPendingAction: "去确认",
      followUpBindingPendingDesc: "AI 已给出可用货源建议，确认后可进入稳定采购。",
      followUpBindingPendingTitle: "{{count}} 个货源候选待确认",
      followUpLogisticsAction: "去物流",
      followUpLogisticsDesc: "建议补齐报价或确认线路，确保后续订单可顺畅履约。",
      followUpLogisticsTitle: "{{count}} 个物流项待处理",
      followUpUnboundAction: "去关联",
      followUpUnboundDesc: "这些商品已进入店铺，但尚未关联采购来源。",
      followUpUnboundTitle: "{{count}} 个商品未绑定货源",
      followUpUnmappedAction: "去处理",
      followUpUnmappedDesc: "请完成变体与货源 SKU 的对应关系，避免下单错配。",
      followUpUnmappedTitle: "{{count}} 个 SKU 仍需映射",
      marketsNotConfigured: "未配置市场",
      packMinimal: "极简包装",
      packReinforced: "加固包装",
      packStandard: "标准包装",
      pricingDefault: "沿用默认定价规则",
      pricingNotSaved: "尚未保存专属定价模板",
      pricingRounding: "取整策略：{{strategy}}",
      speedBalanced: "均衡",
      speedEconomy: "经济",
      speedFast: "快速",
      statFollowUp: "待处理事项",
      statFollowUpCount: "{{count}} 项待处理",
      statFollowUpNone: "暂无待处理事项",
      statLogistics: "物流确认",
      statLogisticsConfirmed: "已确认 {{confirmed}} / {{total}}",
      statLogisticsQuoted: "已报价 {{quoted}}，已确认 {{confirmed}} / {{total}}",
      statSkuDetail: "{{aligned}} / {{total}} 个变体",
      statSkuMapping: "SKU 映射",
      statSourceDetail: "已关联 {{linked}} / {{total}}",
      statSourceLinks: "货源关联",
      strategyDash: "—",
      timelineAi: "AI 优化",
      timelineAiBadge: "已完成",
      timelineAiSummaryConfirmed: "AI 已确认 {{count}} 个货源",
      timelineAiSummaryDefault: "AI 建议已生成，待你确认",
      timelineAuth: "店铺授权",
      timelineAuthBadge: "已完成",
      timelineAuthSummary: "Shopify 授权已完成，基础数据已同步。",
      timelineLogistics: "物流确认",
      timelineLogisticsBadge: "已完成",
      timelineLogisticsSummary: "已确认 {{confirmed}} / {{total}}",
      timelineLogisticsSummaryEmpty: "暂无物流数据",
      timelineProducts: "货源关联",
      timelineProductsBadge: "已完成",
      timelineProductsSummary: "已关联 {{linked}} / {{total}}",
      timelineSku: "SKU 映射",
      timelineSkuBadge: "已完成",
      timelineSkuSummary: "已映射 {{aligned}} / {{total}} 个变体",
      timelineSkuSummaryEmpty: "暂无 SKU 数据",
      timelineSync: "同步完成",
      timelineSyncBadge: "当前",
      timelineSyncSummary: "开店准备报告与后续建议已生成",
      unnamedProduct: "未命名商品",
    },
    launchReport: {
      defaultShopLabel: "当前店铺",
      demoNote: "当前为演示数据。",
      followUpList: "仍有 {{count}} 项后续处理建议：{{titles}}。",
      followUpNone: "本次开店检查未发现阻塞项，可按当前配置继续推进。",
      footer: "以上结论基于当前开店准备数据生成。{{demoNote}}",
      introMirror: "店铺镜像已同步 {{productsTotal}} 个商品，本次开店仪式重点展示其中 {{ceremonyCount}} 个",
      introRest: "；其余商品已保留在选品工作台中，可继续处理。",
      introRestAligned: "。",
      justCompleted: "刚刚完成",
      logisticsConfirmed: "已确认 {{count}}",
      logisticsIntro: "物流确认：共 {{total}} 个变体进入物流准备",
      logisticsNoData: "物流：暂无线路数据。当前策略：{{markets}} · {{speed}}。",
      logisticsQuoted: "已报价 {{count}}",
      logisticsRemain: "待处理 {{count}}",
      logisticsTemplate: "当前策略：{{markets}} · {{speed}} · {{packaging}}。",
      pricingNone: "定价策略：尚未保存专属模板，上架价格将沿用店铺默认规则。",
      pricingSaved:
        "定价策略：{{sourceLabel}} × {{exchangeRate}} × {{multiplier}} + {{addend}} -> {{targetCurrency}}。{{rounding}}。",
      skuMapped: "SKU 映射：已完成 {{mapped}} / {{total}}，完成度 {{percent}}%",
      skuNone: "SKU 映射：当前暂无变体数据，后续同步后会自动纳入。",
      skuPendingReview: "；另有 {{count}} 项待复核",
      sourceConfirmed: "已确认 {{count}}",
      sourceLinked: "货源关联：已关联 {{linked}} / {{total}}",
      sourceListed: "已上架 {{count}}",
      sourceNone: "货源关联：当前还没有已绑定的采购货源。",
      sourcePending: "待确认 {{count}}",
      title: "{{shopLabel}} 开店准备总结，完成于 {{completedAt}}",
    },
  },
  fr: {
    sync: {
      auditGapNote:
        "Les optimisations de titres et de prix s'afficheront une fois l'audit du workflow connecté.",
      auditPending: "Audit en attente",
      cardFulfillment: "Prêt pour l'exécution · Tangbuy",
      cardShopify: "En ligne sur Shopify",
      completedDesc: "Vos produits sont liés, mappés et prêts à être vendus.",
      completedTitle: "Configuration de la boutique terminée",
      ctaViewListed: "Voir les produits publiés",
      ctaViewSku: "Voir le mappage SKU",
      currentStrategy: "Stratégie actuelle",
      exportSoon: "L'export du rapport arrive bientôt.",
      footnoteFulfillment:
        "Les paramètres SKU et logistiques sont enregistrés côté exécution pour les achats et le traitement des commandes.",
      fulfillmentConfirmHint: "Enregistré localement",
      fulfillmentPrepFootnote:
        "Le mappage SKU est écrit dans le backend Tangbuy ; la confirmation des itinéraires logistiques et la stratégie du modèle sont conservées dans cette application et ne sont pas encore synchronisées vers l'exécution.",
      fulfillmentSavedDetail:
        "La confirmation des itinéraires logistiques est conservée localement et n'est pas encore synchronisée vers l'exécution ; vous pouvez poursuivre la configuration.",
      fulfillmentSavedShort:
        "La confirmation logistique est conservée localement et n'est pas encore synchronisée vers l'exécution.",
      goProducts: "Aller aux produits",
      kindException: "Exception en attente",
      kindSkipped: "Ignoré",
      kindSuccess: "Synchronisé",
      launchProgressFootnote:
        "L'avancement est pondéré par la liaison des sources, le mappage SKU et la confirmation logistique locale ; la logistique n'est pas encore synchronisée vers l'exécution.",
      loadError: "Impossible de charger les données de préparation. Réessayez plus tard.",
      mLogisticsConfirm: "Logistique confirmée",
      mPendingReview: "À revoir",
      mPriceAdj: "Ajustements de prix",
      mSkuMap: "Mappage SKU",
      mSourceConfirmed: "Sources confirmées",
      mSourceLinks: "Liaisons source",
      mTitleOpt: "Optimisations de titres",
      noPreview:
        "Les produits de la boutique sont chargés, mais aucune image principale ni aucun titre n'est encore disponible pour l'aperçu.",
      noProducts: "Aucune donnée produit dans la boutique pour le moment",
      pricing: "Tarification",
      pricingSourceLabel: "Prix d'achat (CNY)",
      reviewing: "Révision des étapes terminées, veuillez patienter…",
      shopifyFootnote:
        "Les données ci-dessus proviennent du miroir de la boutique et des liaisons de source. Les volumes d'optimisation de titres et de prix apparaîtront une fois l'audit du workflow connecté.",
      skuDetails: "Détails SKU",
      summarizing: "Synthèse des données de préparation…",
      summaryExceptions: "Exceptions",
      summaryFulfillment: "Exécution automatique prête",
      summaryLinked: "Produits liés",
      summaryListed: "Produits publiés",
      summaryLogistics: "Logistique configurée",
      summarySkipped: "Ignorés",
      title: "Synchroniser vers la boutique",
      viewProducts: "Voir les produits",
    },
    syncUi: {
      carouselCount: " · {{count}} affichés dans l'aperçu",
      charsRevealed: "{{revealed}} / {{total}} caractères",
      followUpTitle: "{{count}} points à traiter",
      launchReportTitle: "Rapport de lancement",
      logisticsStrategy: "Stratégie logistique",
      nextProductAria: "Produit suivant",
      noImage: "Aucune image",
      noProductsToShow: "Aucun produit à afficher pour l'instant",
      prevProductAria: "Produit précédent",
      pricingStrategy: "Stratégie tarifaire",
      productPrepTitle: "Préparation produit",
      scannedCount: "{{processed}} / {{total}} produits analysés",
      stepCompleted: "Terminé",
      strategyTitle: "Résumé de la stratégie",
    },
    syncCeremony: {
      completionCongrats: "Tout est prêt pour le lancement",
      completionDesc:
        "Les liaisons source, le mappage SKU et la checklist de lancement sont en place. Consultez le résumé ou poursuivez l'exploitation de la boutique.",
      completionHeading: "Configuration",
      completionHeadingLine2: "terminée",
      enterWorkbench: "Ouvrir l'espace de travail",
      exportReport: "Exporter le rapport",
      openShopifyAdmin: "Ouvrir l'admin Shopify",
      pendingOptimizations: "Optimisations en attente",
      progressTitle: "Progression",
      statLogistics: "Logistique",
      statProducts: "Produits",
      statQuoted: "{{count}} cotés",
      statSku: "Mappage SKU",
      statSources: "Liaisons source",
      statSourcesConfirmed: "{{count}} confirmées",
      taskLogistics: "Confirmer les plans logistiques",
      taskLogisticsConfirmed: "{{confirmed}} confirmés / {{total}}",
      taskLogisticsQuoted: "{{quoted}} cotés, {{confirmed}} confirmés / {{total}}",
      taskProductsDetail: "{{shown}} / {{total}} produits",
      taskReport: "Générer le rapport de lancement",
      taskReportDone: "Terminé",
      taskReportGenerating: "Génération",
      taskScanProducts: "Analyser les produits de la boutique",
      taskSkuDetail: "{{shown}} / {{total}} variantes",
      taskSkuEmpty: "Aucune donnée SKU pour l'instant",
      taskSkuMap: "Vérifier le mappage SKU",
      taskSourceDetail: "{{shown}} / {{total}} liés",
      taskSourceLinks: "Lier les sources",
      viewSummary: "Voir le résumé",
    },
    launchSummary: {
      checkInLaunchList: "Inclus dans la checklist de lancement",
      checkLogisticsConfirmed: "Logistique confirmée",
      checkSkuComplete: "Toutes les variantes SKU sont mappées",
      checkSkuPartial: "{{aligned}} / {{total}} variantes mappées",
      checkSourceLinked: "Source liée",
      checkSourcePending: "Source candidate en attente",
      followUpBindingPendingAction: "Vérifier les correspondances",
      followUpBindingPendingDesc:
        "L'IA a trouvé des sources probables, mais elles doivent encore être confirmées.",
      followUpBindingPendingTitle: "{{count}} correspondances source en attente de confirmation",
      followUpLogisticsAction: "Vérifier la logistique",
      followUpLogisticsDesc:
        "Relancez les devis ou confirmez les itinéraires avant de transmettre les commandes à l'exécution.",
      followUpLogisticsTitle: "{{count}} éléments logistiques à revoir",
      followUpUnboundAction: "Lier les sources",
      followUpUnboundDesc:
        "Ces produits sont publiés, mais aucune source d'achat n'est encore liée.",
      followUpUnboundTitle: "{{count}} produits ont encore besoin d'une source",
      followUpUnmappedAction: "Vérifier le mappage SKU",
      followUpUnmappedDesc:
        "Terminez le mappage des variantes vers les SKU source avant de traiter les commandes.",
      followUpUnmappedTitle: "{{count}} variantes SKU doivent encore être mappées",
      marketsNotConfigured: "Marchés non configurés",
      packMinimal: "Emballage minimal",
      packReinforced: "Emballage renforcé",
      packStandard: "Emballage standard",
      pricingDefault: "Règles tarifaires par défaut",
      pricingNotSaved: "Modèle tarifaire personnalisé non enregistré",
      pricingRounding: "Arrondi : {{strategy}}",
      speedBalanced: "Équilibré",
      speedEconomy: "Économique",
      speedFast: "Rapide",
      statFollowUp: "Suites",
      statFollowUpCount: "{{count}} éléments à traiter",
      statFollowUpNone: "Aucune suite",
      statLogistics: "Logistique",
      statLogisticsConfirmed: "{{confirmed}} confirmés / {{total}}",
      statLogisticsQuoted: "{{quoted}} cotés, {{confirmed}} confirmés / {{total}}",
      statSkuDetail: "{{aligned}} / {{total}} variantes",
      statSkuMapping: "Mappage SKU",
      statSourceDetail: "{{linked}} / {{total}} liés",
      statSourceLinks: "Liaisons source",
      strategyDash: "—",
      timelineAi: "Optimisation IA",
      timelineAiBadge: "Terminé",
      timelineAiSummaryConfirmed: "{{count}} sources confirmées par l'IA",
      timelineAiSummaryDefault: "Suggestions IA prêtes à être revues",
      timelineAuth: "Boutique autorisée",
      timelineAuthBadge: "Terminé",
      timelineAuthSummary: "L'accès Shopify est connecté et les données de base sont disponibles.",
      timelineLogistics: "Logistique",
      timelineLogisticsBadge: "Terminé",
      timelineLogisticsSummary: "{{confirmed}} / {{total}} confirmés",
      timelineLogisticsSummaryEmpty: "Aucune donnée logistique pour l'instant",
      timelineProducts: "Liaison des sources",
      timelineProductsBadge: "Terminé",
      timelineProductsSummary: "{{linked}} / {{total}} liés",
      timelineSku: "Mappage SKU",
      timelineSkuBadge: "Terminé",
      timelineSkuSummary: "{{aligned}} / {{total}} variantes mappées",
      timelineSkuSummaryEmpty: "Aucune donnée SKU pour l'instant",
      timelineSync: "Synchronisation terminée",
      timelineSyncBadge: "Actuel",
      timelineSyncSummary: "Résumé de lancement et checklist des prochaines étapes générés",
      unnamedProduct: "Produit sans titre",
    },
    launchReport: {
      defaultShopLabel: "votre boutique",
      demoNote: "Données de démonstration affichées.",
      followUpList: "{{count}} suites restent à traiter : {{titles}}.",
      followUpNone: "Aucun suivi bloquant n'a été détecté après cette revue de lancement.",
      footer: "Résumé généré à partir des données actuelles de préparation. {{demoNote}}",
      introMirror:
        "Le miroir boutique est synchronisé avec {{productsTotal}} produits, dont {{ceremonyCount}} mis en avant dans cette revue de lancement",
      introRest: " ; les autres restent disponibles dans l'espace produits.",
      introRestAligned: ".",
      justCompleted: "à l'instant",
      logisticsConfirmed: "{{count}} confirmés",
      logisticsIntro: "Logistique : {{total}} variantes dans le périmètre",
      logisticsNoData:
        "Logistique : aucune donnée d'itinéraire pour l'instant. Stratégie actuelle : {{markets}} · {{speed}}.",
      logisticsQuoted: "{{count}} cotés",
      logisticsRemain: "{{count}} encore en attente",
      logisticsTemplate: " Stratégie actuelle : {{markets}} · {{speed}} · {{packaging}}.",
      pricingNone:
        "Tarification : aucun modèle dédié n'est encore enregistré ; les fiches suivront la règle par défaut de la boutique.",
      pricingSaved:
        "Tarification : {{sourceLabel}} × {{exchangeRate}} × {{multiplier}} + {{addend}} -> {{targetCurrency}}. {{rounding}}.",
      skuMapped: "Mappage SKU : {{mapped}} / {{total}} variantes alignées ({{percent}} %)",
      skuNone: "Mappage SKU : aucune donnée de variante n'est encore disponible.",
      skuPendingReview: " ; {{count}} restent à revoir",
      sourceConfirmed: "{{count}} confirmées",
      sourceLinked: "Liaison des sources : {{linked}} / {{total}} connectées",
      sourceListed: "{{count}} déjà publiées sur Shopify",
      sourceNone: "Liaison des sources : aucune source d'achat n'est encore liée.",
      sourcePending: "{{count}} en attente de confirmation",
      title: "Résumé de lancement de {{shopLabel}} · terminé le {{completedAt}}",
    },
  },
  es: {
    sync: {
      auditGapNote:
        "Las optimizaciones de título y precio se mostrarán cuando se conecte la auditoría del flujo.",
      auditPending: "Auditoría pendiente",
      cardFulfillment: "Listo para fulfillment · Tangbuy",
      cardShopify: "En vivo en Shopify",
      completedDesc: "Tus productos están enlazados, mapeados y listos para vender.",
      completedTitle: "Configuración de la tienda completa",
      ctaViewListed: "Ver productos publicados",
      ctaViewSku: "Ver mapeo de SKU",
      currentStrategy: "Estrategia actual",
      exportSoon: "La exportación del informe llegará pronto.",
      footnoteFulfillment:
        "Los ajustes de SKU y logística se guardan del lado de fulfillment para compras y gestión de pedidos.",
      fulfillmentConfirmHint: "Guardado localmente",
      fulfillmentPrepFootnote:
        "El mapeo de SKU se escribe en el backend de Tangbuy; la confirmación de rutas logísticas y la estrategia de plantilla se guardan en esta app y aún no se sincronizan con fulfillment.",
      fulfillmentSavedDetail:
        "La confirmación de rutas logísticas se guarda localmente y aún no se sincroniza con fulfillment; puedes continuar con la configuración.",
      fulfillmentSavedShort:
        "La confirmación logística se guarda localmente y aún no se sincroniza con fulfillment.",
      goProducts: "Ir a productos",
      kindException: "Excepción pendiente",
      kindSkipped: "Omitido",
      kindSuccess: "Sincronizado",
      launchProgressFootnote:
        "El avance se pondera por el enlace de fuentes, el mapeo de SKU y la confirmación logística local; la logística aún no se sincroniza con fulfillment.",
      loadError: "No se pudieron cargar los datos de preparación. Inténtalo de nuevo más tarde.",
      mLogisticsConfirm: "Logística confirmada",
      mPendingReview: "Pendiente de revisión",
      mPriceAdj: "Ajustes de precio",
      mSkuMap: "Mapeo de SKU",
      mSourceConfirmed: "Fuentes confirmadas",
      mSourceLinks: "Enlaces de fuente",
      mTitleOpt: "Optimizaciones de título",
      noPreview:
        "Los productos de la tienda se cargaron, pero todavía no hay imagen principal ni título para la vista previa.",
      noProducts: "Todavía no hay datos de productos en la tienda",
      pricing: "Precios",
      pricingSourceLabel: "Precio de compra (CNY)",
      reviewing: "Revisando los pasos completados, espera un momento…",
      shopifyFootnote:
        "Los datos anteriores provienen del espejo de la tienda y de los registros de enlace de fuente. Los conteos de optimización de título y precio aparecerán cuando se conecte la auditoría del flujo.",
      skuDetails: "Detalles de SKU",
      summarizing: "Resumiendo los datos de preparación…",
      summaryExceptions: "Excepciones",
      summaryFulfillment: "Auto-fulfillment listo",
      summaryLinked: "Productos enlazados",
      summaryListed: "Productos publicados",
      summaryLogistics: "Logística configurada",
      summarySkipped: "Omitidos",
      title: "Sincronizar con la tienda",
      viewProducts: "Ver productos",
    },
    syncUi: {
      carouselCount: " · {{count}} mostrados en la vista previa",
      charsRevealed: "{{revealed}} / {{total}} caracteres",
      followUpTitle: "{{count}} pendientes por revisar",
      launchReportTitle: "Informe de lanzamiento",
      logisticsStrategy: "Estrategia logística",
      nextProductAria: "Producto siguiente",
      noImage: "Sin imagen",
      noProductsToShow: "Todavía no hay productos para mostrar",
      prevProductAria: "Producto anterior",
      pricingStrategy: "Estrategia de precios",
      productPrepTitle: "Preparación de productos",
      scannedCount: "{{processed}} / {{total}} productos escaneados",
      stepCompleted: "Completado",
      strategyTitle: "Resumen de estrategia",
    },
    syncCeremony: {
      completionCongrats: "Todo está listo para lanzar",
      completionDesc:
        "El enlace de fuentes, el mapeo de SKU y la checklist de lanzamiento ya están listos. Revisa el resumen o sigue operando la tienda.",
      completionHeading: "Configuración",
      completionHeadingLine2: "completa",
      enterWorkbench: "Entrar al workbench",
      exportReport: "Exportar informe",
      openShopifyAdmin: "Abrir admin de Shopify",
      pendingOptimizations: "Optimizaciones pendientes",
      progressTitle: "Progreso",
      statLogistics: "Logística",
      statProducts: "Productos",
      statQuoted: "{{count}} cotizados",
      statSku: "Mapeo de SKU",
      statSources: "Enlaces de fuente",
      statSourcesConfirmed: "{{count}} confirmadas",
      taskLogistics: "Confirmar planes logísticos",
      taskLogisticsConfirmed: "{{confirmed}} confirmados / {{total}}",
      taskLogisticsQuoted: "{{quoted}} cotizados, {{confirmed}} confirmados / {{total}}",
      taskProductsDetail: "{{shown}} / {{total}} productos",
      taskReport: "Generar informe de lanzamiento",
      taskReportDone: "Completado",
      taskReportGenerating: "Generando",
      taskScanProducts: "Escanear productos de la tienda",
      taskSkuDetail: "{{shown}} / {{total}} variantes",
      taskSkuEmpty: "Todavía no hay datos de SKU",
      taskSkuMap: "Revisar el mapeo de SKU",
      taskSourceDetail: "{{shown}} / {{total}} enlazados",
      taskSourceLinks: "Enlazar fuentes",
      viewSummary: "Ver resumen",
    },
    launchSummary: {
      checkInLaunchList: "Incluido en la checklist de lanzamiento",
      checkLogisticsConfirmed: "Logística confirmada",
      checkSkuComplete: "Todas las variantes SKU están mapeadas",
      checkSkuPartial: "{{aligned}} / {{total}} variantes mapeadas",
      checkSourceLinked: "Fuente enlazada",
      checkSourcePending: "Fuente candidata pendiente",
      followUpBindingPendingAction: "Revisar coincidencias",
      followUpBindingPendingDesc:
        "La IA encontró fuentes probables, pero todavía necesitan tu confirmación.",
      followUpBindingPendingTitle: "{{count}} coincidencias de fuente pendientes de confirmación",
      followUpLogisticsAction: "Revisar logística",
      followUpLogisticsDesc:
        "Vuelve a cotizar o confirma las rutas antes de pasar los pedidos a fulfillment.",
      followUpLogisticsTitle: "{{count}} elementos logísticos por revisar",
      followUpUnboundAction: "Enlazar fuentes",
      followUpUnboundDesc:
        "Estos productos ya están publicados, pero todavía no tienen una fuente de compra enlazada.",
      followUpUnboundTitle: "{{count}} productos todavía necesitan una fuente",
      followUpUnmappedAction: "Revisar mapeo de SKU",
      followUpUnmappedDesc:
        "Completa el mapeo entre variantes y SKU de origen antes de procesar pedidos.",
      followUpUnmappedTitle: "{{count}} variantes SKU todavía necesitan mapeo",
      marketsNotConfigured: "Mercados no configurados",
      packMinimal: "Empaque mínimo",
      packReinforced: "Empaque reforzado",
      packStandard: "Empaque estándar",
      pricingDefault: "Reglas de precios predeterminadas",
      pricingNotSaved: "Plantilla de precios personalizada no guardada",
      pricingRounding: "Redondeo: {{strategy}}",
      speedBalanced: "Equilibrado",
      speedEconomy: "Económico",
      speedFast: "Rápido",
      statFollowUp: "Pendientes",
      statFollowUpCount: "{{count}} elementos por revisar",
      statFollowUpNone: "Sin pendientes",
      statLogistics: "Logística",
      statLogisticsConfirmed: "{{confirmed}} confirmados / {{total}}",
      statLogisticsQuoted: "{{quoted}} cotizados, {{confirmed}} confirmados / {{total}}",
      statSkuDetail: "{{aligned}} / {{total}} variantes",
      statSkuMapping: "Mapeo de SKU",
      statSourceDetail: "{{linked}} / {{total}} enlazados",
      statSourceLinks: "Enlaces de fuente",
      strategyDash: "—",
      timelineAi: "Optimización con IA",
      timelineAiBadge: "Completado",
      timelineAiSummaryConfirmed: "{{count}} fuentes confirmadas por IA",
      timelineAiSummaryDefault: "Sugerencias de IA listas para revisar",
      timelineAuth: "Tienda autorizada",
      timelineAuthBadge: "Completado",
      timelineAuthSummary: "El acceso a Shopify está conectado y los datos base están disponibles.",
      timelineLogistics: "Logística",
      timelineLogisticsBadge: "Completado",
      timelineLogisticsSummary: "{{confirmed}} / {{total}} confirmados",
      timelineLogisticsSummaryEmpty: "Todavía no hay datos logísticos",
      timelineProducts: "Enlace de fuentes",
      timelineProductsBadge: "Completado",
      timelineProductsSummary: "{{linked}} / {{total}} enlazados",
      timelineSku: "Mapeo de SKU",
      timelineSkuBadge: "Completado",
      timelineSkuSummary: "{{aligned}} / {{total}} variantes mapeadas",
      timelineSkuSummaryEmpty: "Todavía no hay datos de SKU",
      timelineSync: "Sincronización completa",
      timelineSyncBadge: "Actual",
      timelineSyncSummary: "Se generaron el resumen de lanzamiento y la checklist de siguientes pasos",
      unnamedProduct: "Producto sin título",
    },
    launchReport: {
      defaultShopLabel: "tu tienda",
      demoNote: "Se muestran datos de demostración.",
      followUpList: "Quedan {{count}} pendientes: {{titles}}.",
      followUpNone: "No se detectaron pendientes bloqueantes tras esta revisión de lanzamiento.",
      footer: "Resumen generado a partir de los datos actuales de preparación. {{demoNote}}",
      introMirror:
        "El espejo de la tienda está sincronizado con {{productsTotal}} productos, y {{ceremonyCount}} aparecen destacados en esta revisión de lanzamiento",
      introRest: "; el resto sigue disponible en el espacio de productos.",
      introRestAligned: ".",
      justCompleted: "justo ahora",
      logisticsConfirmed: "{{count}} confirmados",
      logisticsIntro: "Logística: {{total}} variantes dentro del alcance",
      logisticsNoData:
        "Logística: todavía no hay datos de rutas. Estrategia actual: {{markets}} · {{speed}}.",
      logisticsQuoted: "{{count}} cotizados",
      logisticsRemain: "{{count}} aún pendientes",
      logisticsTemplate: " Estrategia actual: {{markets}} · {{speed}} · {{packaging}}.",
      pricingNone:
        "Precios: todavía no hay una plantilla dedicada guardada; las publicaciones seguirán la regla predeterminada de la tienda.",
      pricingSaved:
        "Precios: {{sourceLabel}} × {{exchangeRate}} × {{multiplier}} + {{addend}} -> {{targetCurrency}}. {{rounding}}.",
      skuMapped: "Mapeo de SKU: {{mapped}} / {{total}} variantes alineadas ({{percent}} %)",
      skuNone: "Mapeo de SKU: todavía no hay datos de variantes.",
      skuPendingReview: "; {{count}} siguen pendientes de revisión",
      sourceConfirmed: "{{count}} confirmadas",
      sourceLinked: "Enlace de fuentes: {{linked}} / {{total}} conectadas",
      sourceListed: "{{count}} ya publicadas en Shopify",
      sourceNone: "Enlace de fuentes: todavía no hay fuentes de compra enlazadas.",
      sourcePending: "{{count}} pendientes de confirmación",
      title: "Resumen de lanzamiento de {{shopLabel}} · completado el {{completedAt}}",
    },
  },
};

for (const locale of LOCALES) {
  validateLocaleBlocks(locale, blocks[locale]);
}

const totalKeysPerLocale = Object.values(EXPECTED_COUNTS).reduce((sum, n) => sum + n, 0);

for (const locale of LOCALES) {
  const file = join(ROOT, "src/i18n/messages", `${locale}.ts`);
  let src = readFileSync(file, "utf8");
  src = restoreStepsSync(src, locale);
  for (const name of BLOCK_NAMES) {
    src = replaceTopLevelBlock(src, name, formatBlock(name, blocks[locale][name]));
  }
  writeFileSync(file, src);
  console.log(
    `${locale}: patched ${totalKeysPerLocale} keys ` +
      `(sync ${EXPECTED_COUNTS.sync}, syncUi ${EXPECTED_COUNTS.syncUi}, ` +
      `syncCeremony ${EXPECTED_COUNTS.syncCeremony}, launchSummary ${EXPECTED_COUNTS.launchSummary}, ` +
      `launchReport ${EXPECTED_COUNTS.launchReport})`
  );
}
