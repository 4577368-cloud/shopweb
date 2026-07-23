#!/usr/bin/env node
/**
 * Improved i18n generator: pairs t() keys with git-original strings by block order.
 * Run: node --experimental-strip-types scripts/generate-missing-i18n.mjs
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { en } from "../src/i18n/messages/en.ts";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");

function flatten(obj, prefix = "") {
  const keys = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") keys[path] = v;
    else if (v && typeof v === "object") Object.assign(keys, flatten(v, path));
  }
  return keys;
}

function unflatten(flat) {
  const result = {};
  for (const key of Object.keys(flat).sort()) {
    const parts = key.split(".");
    let node = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = flat[key];
  }
  return result;
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      target[k] &&
      typeof target[k] === "object"
    ) {
      out[k] = deepMerge(target[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function walkDir(dir, exts, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!entry.includes("node_modules")) walkDir(full, exts, files);
    } else if (exts.includes(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

function getGitOld(gitPath) {
  try {
    return execSync(`git show 63189a3:${gitPath}`, {
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
      cwd: ROOT,
    });
  } catch {
    return null;
  }
}

/** Split file into blocks (functions / components) for ordered string pairing. */
function splitBlocks(content) {
  const lines = content.split("\n");
  const blocks = [];
  let current = { start: 0, lines: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      /^(export )?(async )?function /.test(line) ||
      /^const \w+ = (\(|async)/.test(line) ||
      /^export const \w+ =/.test(line)
    ) {
      if (current.lines.length > 0) blocks.push(current);
      current = { start: i, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) blocks.push(current);
  return blocks;
}

function extractOldStrings(blockText) {
  const strings = [];
  // Template literals and quoted strings with CJK or common UI patterns
  const patterns = [
    /`([^`]*(?:\$\{[^}]+\}[^`]*)*)`/g,
    /"([^"\\]*(?:\\.[^"\\]*)*)"/g,
    /'([^'\\]*(?:\\.[^'\\]*)*)'/g,
  ];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(blockText)) !== null) {
      const s = m[1];
      if (
        s.length > 0 &&
        s.length < 400 &&
        !s.startsWith("http") &&
        !s.includes("className") &&
        !s.includes("import ") &&
        !s.includes("rgba(") &&
        !s.includes("#") &&
        !/^[a-z_][a-z0-9_.-]*$/i.test(s) &&
        (/[\u4e00-\u9fff]/.test(s) ||
          /\$\{/.test(s) ||
          /^(Loading|Retry|Cancel|Confirm|Search|Back|Next|Close|Save)/i.test(s))
      ) {
        strings.push(s);
      }
    }
  }
  return strings;
}

function extractTKeys(blockText) {
  const keys = [];
  const tPattern = /\bt\(\s*["']([a-zA-Z][a-zA-Z0-9_.]*)["']/g;
  let m;
  while ((m = tPattern.exec(blockText)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

/** Pair t() keys with git-original strings block-by-block. */
function extractFromGit() {
  const zhMap = {};
  const enFromOld = {};
  const files = walkDir(join(ROOT, "src"), [".ts", ".tsx"]).filter((f) =>
    /\bt\(/.test(readFileSync(f, "utf8"))
  );

  for (const file of files) {
    const newContent = readFileSync(file, "utf8");
    const gitPath = file.replace(ROOT + "/", "");
    const oldContent = getGitOld(gitPath);
    if (!oldContent) continue;

    const newBlocks = splitBlocks(newContent);
    const oldBlocks = splitBlocks(oldContent);
    const blockCount = Math.min(newBlocks.length, oldBlocks.length);

    for (let b = 0; b < blockCount; b++) {
      const newText = newBlocks[b].lines.join("\n");
      const oldText = oldBlocks[b].lines.join("\n");
      const keys = extractTKeys(newText);
      const oldStrings = extractOldStrings(oldText);
      if (keys.length === 0) continue;

      // Pair by index (best-effort)
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const oldStr = oldStrings[i] ?? oldStrings[oldStrings.length - 1];
        if (!oldStr) continue;
        if (/[\u4e00-\u9fff]/.test(oldStr)) {
          if (!zhMap[key]) zhMap[key] = oldStr;
        } else if (!enFromOld[key]) {
          enFromOld[key] = oldStr;
        }
      }
    }

    // Line-proximity fallback
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");
    const tPattern = /\bt\(\s*["']([a-zA-Z][a-zA-Z0-9_.]*)["']/g;
    for (let i = 0; i < newLines.length; i++) {
      const line = newLines[i];
      let m;
      tPattern.lastIndex = 0;
      while ((m = tPattern.exec(line)) !== null) {
        const key = m[1];
        if (zhMap[key]) continue;
        for (const sign of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7, -8, 8]) {
          const idx = i + sign;
          if (idx < 0 || idx >= oldLines.length) continue;
          const oldLine = oldLines[idx];
          const tmpl = oldLine.match(/`([^`]+)`/);
          const quoted = oldLine.match(/["']([^"']{1,200})["']/);
          const candidate = tmpl?.[1] ?? quoted?.[1];
          if (candidate && /[\u4e00-\u9fff]/.test(candidate)) {
            zhMap[key] = candidate;
            break;
          }
        }
      }
    }
  }
  return { zhMap, enFromOld };
}

function lastSegment(key) {
  return key.split(".").pop() ?? key;
}

function camelToLabel(str) {
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

// Glossary: zh → en for common terms
const ZH_TO_EN = {
  工作台: "Workbench",
  智能选品: "Product linking",
  "SKU 绑定": "SKU mapping",
  授权店铺: "Authorize store",
  全部: "All",
  全部关联: "Fully linked",
  部分关联: "Partially linked",
  待确认: "Needs confirm",
  未匹配: "Unmatched",
  重试: "Retry",
  加载中: "Loading…",
  同步中: "Syncing…",
  刷新: "Refresh",
  确认: "Confirm",
  取消: "Cancel",
  搜索: "Search",
  关闭: "Close",
  返回: "Back",
  下一步: "Next step",
  物流: "Logistics",
  货源: "Source",
  商品: "Product",
  店铺: "Store",
  变体: "Variant",
  采购价: "Purchase cost",
  月销: "Monthly sales",
  复购: "Repurchase",
  图搜: "Image search",
  匹配完成: "Match complete",
  未找到可靠匹配: "No reliable match",
  "正在识别同款货源…": "Finding similar sources…",
  "正在建立关联…": "Linking…",
  已自动匹配: "Auto-matched",
  采购价待取: "Cost pending",
  按货源原图发起图搜: "Search by source image",
  已用店铺主图图搜: "Searched with store image",
  图搜命中: "Image match",
  建议图搜: "Try image search",
  可放宽条件: "Relax filters",
  已用店铺图搜: "Store image search",
  "标题/识图校准": "Title / image calibration",
};

function zhToEn(zh) {
  if (ZH_TO_EN[zh]) return ZH_TO_EN[zh];
  // Keep interpolation tokens, translate known fragments
  let out = zh;
  for (const [zhFrag, enFrag] of Object.entries(ZH_TO_EN)) {
    out = out.split(zhFrag).join(enFrag);
  }
  // If still mostly Chinese, return null to use other strategies
  if (/[\u4e00-\u9fff]/.test(out)) return null;
  return out;
}

// Concise EN overrides (priority)
const EN_OVERRIDES = {
  "assistant.defaultHeading": "Assistant",
  "assistant.keyPoints": "Key points",
  "assistant.needsAttention": "Needs attention",
  "assistant.locate": "Locate:",
  "assistant.nextStep": "Next step",
  "assistant.nextStepDesc": "Continue with {{label}}",
  "assistant.inputPlaceholder": "Ask a question…",
  "assistant.guidedPlaceholder": "Pick a question above…",
  "assistant.faq": "Common questions",
  "assistant.backendOk": "Connected",
  "assistant.backendDown": "Offline",

  "sku.breadcrumb": "SKU mapping",
  "sku.assistantTitle": "SKU mapping assistant",
  "sku.copilotEmpty":
    "Matched products appear here by variant — I'll align each to a Tangbuy source SKU.",
  "sku.copilotPartial":
    "{{products}} partially linked ({{review}} to confirm · {{unbound}} unmatched).",
  "sku.copilotAll": "All {{products}} products fully linked — ready for logistics.",
  "sku.copilotBulletAll": "Fully linked: {{products}} products",
  "sku.copilotBulletPartial": "Partially linked: {{products}} products",
  "sku.copilotBulletSearch": "Search by title or ID above",
  "sku.copilotBulletNext": "Next: use «Continue to logistics» above",
  "sku.metricFullyLinked": "Fully linked",
  "sku.metricFullyLinkedHint": "All SKUs mapped",
  "sku.metricPartiallyLinked": "Partially linked",
  "sku.metricPartiallyLinkedHint": "{{review}} to confirm · {{unbound}} unmatched",
  "sku.metricNeedsReview": "Variants to confirm",
  "sku.metricNeedsReviewHintYes": "Medium confidence — needs review",
  "sku.metricNeedsReviewHintNo": "Nothing to confirm",
  "sku.metricTotalVariants": "Total variants",
  "sku.metricTotalVariantsHint": "{{resolved}}/{{total}} handled",
  "sku.filterAll": "All",
  "sku.filterFullyLinked": "Fully linked",
  "sku.filterPartiallyLinked": "Partially linked",
  "sku.matchRuleTitle": "Match rules",
  "sku.matchRuleCategory": "Title & keywords",
  "sku.matchRuleSpec": "Specs (color / size / material)",
  "sku.matchRuleImage": "Image similarity",
  "sku.scanCopilotTitle": "Auto-organizing",
  "sku.scanCopilotRunning":
    "Matching each variant to Tangbuy source specs and loading price data.",
  "sku.scanCopilotDone": "Auto-match done — review variant bindings.",
  "sku.scanCopilotNextRunning": "Preview progress",
  "sku.scanCopilotNextDone": "View results",
  "sku.scanStatusRunning": "Running…",
  "sku.scanStatusDone": "Done",
  "sku.scanStatusFailed": "Failed",
  "sku.scanStatusSkipped": "Skipped",
  "sku.scanStatusPending": "Pending",
  "sku.restoringAuth": "Restoring store authorization…",
  "sku.notConnectedTitle": "No store connected",
  "sku.notConnectedDesc": "Authorize Shopify to load products for SKU mapping.",
  "sku.goAuthorize": "Authorize store",
  "sku.goSourcing": "Go to product linking",
  "sku.loading": "Loading…",
  "sku.loadFailed": "Could not load SKU data",
  "sku.loadFailedHint": "Check your connection and retry.",
  "sku.retry": "Retry",
  "sku.searchPlaceholder": "Search title or product ID…",
  "sku.panelDescription": "Align each Shopify variant to a source SKU.",
  "sku.logisticsEntry": "Continue to logistics",
  "sku.acceptPage": "Accept this page",
  "sku.acceptPageTitle": "Accept AI suggestions on this page",
  "sku.backToList": "Back to list",
  "sku.confirmNoProducts": "No products to process",
  "sku.confirmUnknownProduct": "(No title)",
  "sku.confirmBefore": "{{count}} to confirm",
  "sku.confirmAfter": "Aligned",
  "sku.confirmPreviewNote": "Showing {{count}} of {{rest}} more",
  "sku.confirmPreviewAll": "All {{count}} products",
  "sku.confirmTitle": "Confirm {{count}} products",
  "sku.confirmScope": "{{count}} products",
  "sku.confirmDuration": "~{{seconds}}s",
  "sku.confirmDone": "Accepted {{success}}/{{total}}",
  "sku.toastAccepted": "Accepted {{count}} AI suggestions",
  "sku.toastNoConfirmable": "Nothing to confirm on this page",
  "sku.displayActiveAuto": "Auto-aligned",
  "sku.displayManualActive": "Manual",
  "sku.displayNeedsReview": "Needs confirm",
  "sku.displayUnbound": "Unmatched",
  "sku.emptyAllLinkedDesc": "All products are fully linked.",
  "sku.emptyBoundDesc": "No fully linked products yet.",
  "sku.emptyBoundTitle": "No fully linked products",
  "sku.emptyDefaultDesc": "Link products first — variants appear here.",
  "sku.emptyFilterTitle": "No products in this filter",
  "sku.emptyPartialDesc": "No partially linked products.",
  "sku.emptySearchDesc": "Try a different search term.",
  "sku.emptySearchTitle": "No matches",
  "sku.errNotInList": "Product not in current list",
  "sku.errOpenWorkbench": "Open the product workbench first",
  "sku.clearSearchAria": "Clear search",
  "sku.refreshListAria": "Refresh list",
  "sku.rescanAria": "Re-run scan",
  "sku.rescanTitle": "Re-run auto-match",
  "sku.compareFallback": "Compare",
  "sku.productNotFound": "Product not found",
  "sku.noProductSpecified": "No product selected",
  "sku.noProductSpecifiedDesc": "Pick a product from the list.",
  "sku.loadingProductSpecs": "Loading specs…",
  "sku.scanStageHeading": "Auto SKU alignment",
  "sku.scanStageDesc": "Matching variants to source SKUs…",
  "sku.scanInfoTitle": "What happens",
  "sku.scanInfo1": "Reads your Shopify variants",
  "sku.scanInfo2": "Matches Tangbuy source specs",
  "sku.scanInfo3": "Flags items needing review",

  "shopProducts.noReliableMatch": "No reliable match",
  "shopProducts.pendingTitleImage": "Needs confirm · title {{title}}% · image {{image}}%",
  "shopProducts.pendingTitleOnly": "Needs confirm · title {{title}}%",
  "shopProducts.pending": "Needs confirm",
  "shopProducts.scoresTitleImage": "Title {{title}}% · image {{image}}%",
  "shopProducts.scoresTitleOnly": "Title {{title}}%",
  "shopProducts.autoMatched": "Auto-matched",
  "shopProducts.searchingSource": "Finding similar sources…",
  "shopProducts.linking": "Linking…",
  "shopProducts.matchComplete": "Match complete",
  "shopProducts.monthlySalesWan": "{{count}}0k/mo",
  "shopProducts.monthlySales": "{{count}}/mo",
  "shopProducts.repurchase": "Repurchase {{rate}}",
  "shopProducts.purchaseCost": "Cost {{price}}",
  "shopProducts.purchaseCostPending": "Cost pending",
  "shopProducts.reasonOriginalImage": "Source image search",
  "shopProducts.reasonShopImage": "Store image search",
  "shopProducts.reasonImageHit": "Image match",
  "shopProducts.reasonTitleCal": "Title cal «{{query}}»",
  "shopProducts.reasonAiCal": "AI cal «{{query}}»",
  "shopProducts.reasonComposite": "Score {{score}}",
  "shopProducts.tagSuggestSearch": "Try image search",
  "shopProducts.tagRelaxFilters": "Relax filters",
  "shopProducts.tagShopImageSearch": "Store image search",
  "shopProducts.tagImageHit": "Image match",
  "shopProducts.tagCalibrated": "Calibrated",
  "shopProducts.tagBetterCost": "Better cost",
  "shopProducts.filterAll": "All",
  "shopProducts.filterPending": "Pending",
  "shopProducts.filterConfirmed": "Confirmed",
  "shopProducts.filterUnbound": "Unlinked",
  "shopProducts.batchAck": "Batch confirm ({{count}})",
  "shopProducts.batchAcking": "Confirming…",
  "shopProducts.loadFailed": "Load failed: ",
  "shopProducts.retry": "Retry",
  "shopProducts.emptyNoProducts": "No products",
  "shopProducts.emptyNoProductsDesc": "Sync your store to load products.",
  "shopProducts.emptyNoNewArrivals": "No new arrivals",
  "shopProducts.emptyFilterTitle": "No products in this filter",
  "shopProducts.emptyNewArrivalsDesc": "Check back later for new sources.",
  "shopProducts.emptyFilterDesc": "Try another filter or search.",
  "shopProducts.prevPage": "Previous",
  "shopProducts.nextPage": "Next",
  "shopProducts.pageOf": "Page {{page}} / {{total}}",
  "shopProducts.noTitle": "(No title)",

  "authorize.pageTitle": "Authorize store",
  "authorize.assistantHeading": "Setup assistant",
  "authorize.connectTitle": "Connect your store",
  "authorize.connectSubtitle": "Authorize read-only access via official Shopify OAuth.",
  "authorize.connectShop": "Connect Shopify store",
  "authorize.connectDomain": "Connect {{domain}}",
  "authorize.authorizing": "Authorizing…",
  "authorize.changeShop": "Change store",
  "authorize.lastShopHint": "Last store: ",
  "authorize.shopDomainLabel": "Store domain",
  "authorize.shopDomainHint": "First-time setup — e.g. northwind-home.myshopify.com",
  "authorize.reauthorize": "Re-authorize",
  "authorize.goProducts": "Go to product linking",
  "authorize.refreshSummary": "Refresh summary",
  "authorize.refreshAria": "Refresh",
  "authorize.securityBadge": "Official secure OAuth",
  "authorize.trustOfficial": "Official Shopify OAuth",
  "authorize.trustEncrypted": "Encrypted transfer",
  "authorize.trustReadOnly": "Read-only access",
  "authorize.trustNoModify": "Never modifies your store",
  "authorize.afterConnectTitle": "After connecting",
  "authorize.capSyncTitle": "Sync base data",
  "authorize.capSyncDesc": "Auto-sync products, inventory, and orders",
  "authorize.capAnalyzeTitle": "Analyze performance",
  "authorize.capAnalyzeDesc": "Review store metrics and product health",
  "authorize.capOptimizeTitle": "Find optimizations",
  "authorize.capOptimizeDesc": "Spot cost savings and margin opportunities",
  "authorize.capSupplyTitle": "Match sources",
  "authorize.capSupplyDesc": "Match better supply chains for profit and fulfillment",
  "authorize.dataUsageTitle": "How we use your data",
  "authorize.dataUsageDesc": "Read-only product, inventory, and order data for analysis and source matching.",
  "authorize.learnMore": "Learn more",
  "authorize.syncing": "Syncing…",
  "authorize.notFetched": "Not fetched yet",
  "authorize.noProducts": "No products",
  "authorize.loading": "Loading…",
  "authorize.countWithUnit": "{{count}}",
  "authorize.toastProductCountFailed": "Product count unavailable — retry later",
  "authorize.toastRefreshFailed": "Refresh failed — retry",
  "authorize.stepSelectShop": "Select store",
  "authorize.stepAuthorize": "Authorize & connect",
  "authorize.authSuccess": "Authorized",
  "authorize.authSuccessSyncing": "Syncing products…",
  "authorize.restoringTitle": "Connecting…",
  "authorize.restoringStep1": "Verify authorization",
  "authorize.restoringStep2": "Pull product mirror",
  "authorize.restoringStep3": "Load store stats",
  "authorize.statShop": "Store",
  "authorize.statDomain": "Domain",
  "authorize.statAuthorizedAt": "Authorized at",
  "authorize.statSyncedProducts": "Synced products",
  "authorize.statBoundSources": "Linked sources",
  "authorize.statPublished": "Listed",
  "authorize.statSuggestedNext": "Suggested next",
  "authorize.copilotDoneTitle": "Connected",
  "authorize.copilotDoneSummary": "{{shopName}} ({{shopDomain}}) is connected.",
  "authorize.copilotDoneNextOptimize": "Optimize sources",
  "authorize.copilotDoneNextLink": "Start linking sources",
  "authorize.copilotDoneNextAction": "Go to product linking",
  "authorize.copilotDoneNextDescLinked": "{{count}} sources linked — review or replace.",
  "authorize.copilotDoneNextDescEmpty": "Image-search and link Tangbuy sources for live products.",
  "authorize.copilotDoneSuggestNextQ": "What next?",
  "authorize.copilotDoneSuggestNextAWithBound": "{{count}} sources linked — continue in product linking.",
  "authorize.copilotDoneSuggestNextAEmpty": "Open product linking — auto image search recommends Tangbuy sources.",
  "authorize.copilotDoneSuggestStatsQ": "How to read these numbers?",
  "authorize.copilotDoneSuggestStatsA": "Synced products: {{synced}} — {{syncedExplain}}. Linked sources = confirmed Tangbuy bindings.",
  "authorize.copilotDoneSyncedExplainEmpty": "Store has no products",
  "authorize.copilotDoneSyncedExplainPending": "Sync incomplete — tap refresh",
  "authorize.copilotDoneSyncedExplainDone": "Pulled from Shopify mirror",
  "authorize.copilotDoneSuggestRefreshQ": "Numbers look wrong?",
  "authorize.copilotDoneSuggestRefreshA": "Tap refresh on the card to re-pull mirror and source stats.",
  "authorize.copilotRestoringTitle": "Connecting",
  "authorize.copilotRestoringSummary": "Restoring authorization and loading store data.",
  "authorize.copilotRestoringCurrentStep": "Current step",
  "authorize.copilotRestoringStep": "Verify authorization",
  "authorize.copilotRestoringEtaLabel": "Estimated time",
  "authorize.copilotRestoringEta": "~10 seconds",
  "authorize.copilotRestoringSuggestDoingQ": "What's happening?",
  "authorize.copilotRestoringSuggestDoingA": "Verifying Shopify auth and pulling product mirror.",
  "authorize.copilotRestoringSuggestWaitQ": "Do I need to do anything?",
  "authorize.copilotRestoringSuggestWaitA": "No — summary appears automatically when done.",
  "authorize.copilotStartTitle": "Get started",
  "authorize.copilotStartSummary": "Connect Shopify — I'll sync products and match Tangbuy sources in later steps.",
  "authorize.copilotStartAuthMethodLabel": "Auth method",
  "authorize.copilotStartAuthMethod": "Official Shopify",
  "authorize.copilotStartPermissionLabel": "Data access",
  "authorize.copilotStartPermission": "Read-only",
  "authorize.copilotStartConnect": "Connect Shopify store",
  "authorize.copilotStartEnterDomain": "Enter store domain",
  "authorize.copilotStartDisabledReason": "Enter your store domain first.",
  "authorize.copilotStartSuggestHowQ": "How to connect?",
  "authorize.copilotStartSuggestHowA": "Enter .myshopify.com domain, click connect, confirm on Shopify's page.",
  "authorize.copilotStartSuggestDataQ": "What data is read?",
  "authorize.copilotStartSuggestDataA": "Read-only products, inventory, orders — for analysis and source matching.",
  "authorize.copilotStartSuggestTimeQ": "How long does it take?",
  "authorize.copilotStartSuggestTimeA": "Authorization ~1 minute; product mirror syncs in background.",

  "logisticsDisplay.common.dash": "—",
  "logisticsDisplay.decisionStatus.confirmed": "Confirmed",
  "logisticsDisplay.type.general": "General",
  "logisticsDisplay.type.apparel": "Apparel",
  "logisticsDisplay.type.food": "Food",
  "logisticsDisplay.type.batteryMagnetic": "Battery / magnetic",
  "logisticsDisplay.type.blade": "Blade",
  "logisticsDisplay.type.other": "Other",
  "logisticsDisplay.quoteAction.estimate": "Estimate",
  "logisticsDisplay.quoteAction.reestimate": "Re-estimate",
  "logisticsDisplay.quoteAction.retry": "Retry",
  "logisticsDisplay.transit.days": "{{days}} days",
  "logisticsDisplay.measure.pending": "Pending",
  "logisticsDisplay.measure.uncertain": "Uncertain",
  "logisticsDisplay.profit.marginEmpty": "—",

  "toast.batchConfirmHighMatch": "Confirmed high-match batch",
  "toast.logisticsStaged": "Logistics plan staged locally",
  "toast.skuBatchAccepted": "SKU batch accepted",
  "toast.skuCandidateSwitched": "Switched SKU candidate",
  "toast.syncComplete": "Sync complete",

  "completionGate.primarySyncWithExceptions": "Continue to sync (with exceptions)",
  "completionGate.primarySyncWithExceptionsGeneric": "Continue to sync (with exceptions)",
  "launchSummary.timelineLogisticsSummaryEmpty": "No logistics data yet",
  "launchSummary.timelineSkuSummaryEmpty": "No SKU data yet",
  "listingStatus.transition": "Status change",

  "nav.workbench": "Workbench",
  "nav.flow": "Workflow",
  "nav.authorize": "Authorize store",
  "nav.logistics": "Logistics",

  "products.title": "Product linking",
  "products.goAuthorize": "Authorize store",
  "products.notConnectedTitle": "No store connected",
  "products.notConnectedDesc": "Authorize Shopify to load products and start linking sources.",
  "products.restoringAuth": "Restoring store authorization…",
  "products.scanDoneTitle": "First scan complete",
  "products.scanningTitle": "AI analyzing",
  "products.tabShop": "Shopify products",
  "products.tabDiscover": "Catalog discovery",
  "products.searchPlaceholder": "Search title or SKU…",
};

const ZH_OVERRIDES = {
  "assistant.defaultHeading": "助手",
  "assistant.keyPoints": "要点",
  "assistant.needsAttention": "需要关注",
  "assistant.locate": "定位：",
  "assistant.nextStep": "下一步",
  "assistant.nextStepDesc": "继续：{{label}}",
  "assistant.inputPlaceholder": "输入问题…",
  "assistant.guidedPlaceholder": "选择上方问题…",
  "assistant.faq": "常见问题",
  "assistant.backendOk": "已连接",
  "assistant.backendDown": "离线",

  "authorize.pageTitle": "授权店铺",
  "authorize.assistantHeading": "接入助手",
  "authorize.connectTitle": "连接 Shopify 店铺",
  "authorize.connectSubtitle": "通过 Shopify 官方 OAuth 授权只读访问。",
  "authorize.connectShop": "连接 Shopify 店铺",
  "authorize.connectDomain": "连接 {{domain}}",
  "authorize.authorizing": "授权中…",
  "authorize.changeShop": "更换店铺",
  "authorize.lastShopHint": "上次店铺：",
  "authorize.shopDomainLabel": "店铺域名",
  "authorize.shopDomainHint": "首次连接需填写，例如 northwind-home.myshopify.com",
  "authorize.reauthorize": "重新授权",
  "authorize.goProducts": "进入智能选品",
  "authorize.refreshSummary": "刷新接入摘要",
  "authorize.refreshAria": "刷新",
  "authorize.securityBadge": "官方安全授权",
  "authorize.trustOfficial": "官方安全授权",
  "authorize.trustEncrypted": "数据加密传输",
  "authorize.trustReadOnly": "只读访问权限",
  "authorize.trustNoModify": "不会修改你的店铺数据",
  "authorize.afterConnectTitle": "连接后可用的能力",
  "authorize.capSyncTitle": "同步基础数据",
  "authorize.capSyncDesc": "自动同步商品、库存、订单等基础数据",
  "authorize.capAnalyzeTitle": "分析店铺表现",
  "authorize.capAnalyzeDesc": "查看店铺指标与商品健康度",
  "authorize.capOptimizeTitle": "发现优化机会",
  "authorize.capOptimizeDesc": "找到可替换商品、降本机会和利润增长点",
  "authorize.capSupplyTitle": "推荐优供应链",
  "authorize.capSupplyDesc": "匹配更优供应链，提升利润和履约效率",
  "authorize.dataUsageTitle": "数据如何使用",
  "authorize.dataUsageDesc": "只读商品、库存、订单等数据，用于分析与货源匹配。",
  "authorize.learnMore": "了解更多",
  "authorize.syncing": "同步中…",
  "authorize.notFetched": "暂未获取",
  "authorize.noProducts": "暂无商品",
  "authorize.loading": "读取中…",
  "authorize.countWithUnit": "{{count}} 个",
  "authorize.toastProductCountFailed": "商品数暂未获取，请稍后重试",
  "authorize.toastRefreshFailed": "刷新失败，请稍后重试",
  "authorize.stepSelectShop": "选择店铺",
  "authorize.stepAuthorize": "授权并连接",
  "authorize.authSuccess": "授权成功",
  "authorize.authSuccessSyncing": "同步中…",
  "authorize.restoringTitle": "正在接入",
  "authorize.restoringStep1": "校验授权",
  "authorize.restoringStep2": "拉取商品镜像",
  "authorize.restoringStep3": "加载店铺统计",
  "authorize.statShop": "店铺",
  "authorize.statDomain": "店铺域名",
  "authorize.statAuthorizedAt": "授权时间",
  "authorize.statSyncedProducts": "已同步商品",
  "authorize.statBoundSources": "已关联货源",
  "authorize.statPublished": "已刊登",
  "authorize.statSuggestedNext": "建议下一步",
  "authorize.copilotDoneTitle": "接入完成",
  "authorize.copilotDoneSummary": "{{shopName}}（{{shopDomain}}）已连接。",
  "authorize.copilotDoneNextOptimize": "继续优化货源",
  "authorize.copilotDoneNextLink": "开始关联货源",
  "authorize.copilotDoneNextAction": "进入智能选品",
  "authorize.copilotDoneNextDescLinked": "已关联 {{count}} 个货源，可继续选品与优化。",
  "authorize.copilotDoneNextDescEmpty": "为在售商品图搜关联 Tangbuy 货源。",
  "authorize.copilotDoneSuggestNextQ": "接下来做什么？",
  "authorize.copilotDoneSuggestNextAWithBound": "已关联 {{count}} 个货源，可在智能选品页继续优化。",
  "authorize.copilotDoneSuggestNextAEmpty": "点击「进入智能选品」，系统会为在售商品自动图搜并推荐 Tangbuy 货源。",
  "authorize.copilotDoneSuggestStatsQ": "这些数字怎么看？",
  "authorize.copilotDoneSuggestStatsA": "「已同步商品」{{synced}}：{{syncedExplain}}。「已关联货源」指已确认绑定 Tangbuy 的在售商品数。",
  "authorize.copilotDoneSyncedExplainEmpty": "店铺确实没有商品",
  "authorize.copilotDoneSyncedExplainPending": "同步未完成，可点左侧刷新",
  "authorize.copilotDoneSyncedExplainDone": "已从 Shopify 拉取镜像",
  "authorize.copilotDoneSuggestRefreshQ": "数字不对怎么办？",
  "authorize.copilotDoneSuggestRefreshA": "点授权卡片标题旁的刷新按钮，重新拉取 Shopify 镜像与货源统计。若仍异常，可尝试重新授权。",
  "authorize.copilotRestoringTitle": "正在接入",
  "authorize.copilotRestoringSummary": "正在恢复授权并读取店铺数据，请稍候。",
  "authorize.copilotRestoringCurrentStep": "当前步骤",
  "authorize.copilotRestoringStep": "校验授权",
  "authorize.copilotRestoringEtaLabel": "预计耗时",
  "authorize.copilotRestoringEta": "约 10 秒",
  "authorize.copilotRestoringSuggestDoingQ": "现在在做什么？",
  "authorize.copilotRestoringSuggestDoingA": "正在校验 Shopify 授权，并拉取店铺与商品镜像。",
  "authorize.copilotRestoringSuggestWaitQ": "需要我操作吗？",
  "authorize.copilotRestoringSuggestWaitA": "不需要，完成后会自动展示接入摘要。",
  "authorize.copilotStartTitle": "开始接入",
  "authorize.copilotStartSummary": "连接 Shopify 后，我会同步商品镜像，并帮你在后续步骤匹配 Tangbuy 货源。",
  "authorize.copilotStartAuthMethodLabel": "授权方式",
  "authorize.copilotStartAuthMethod": "Shopify 官方",
  "authorize.copilotStartPermissionLabel": "数据权限",
  "authorize.copilotStartPermission": "只读",
  "authorize.copilotStartConnect": "连接 Shopify 店铺",
  "authorize.copilotStartEnterDomain": "填写店铺域名",
  "authorize.copilotStartDisabledReason": "请先在中间填写店铺域名，再发起授权。",
  "authorize.copilotStartConnectDesc": "跳转 Shopify 确认授权，完成后自动返回。",
  "authorize.copilotStartSuggestHowQ": "怎么连接店铺？",
  "authorize.copilotStartSuggestHowA": "填写 .myshopify.com 域名，点击连接按钮，在 Shopify 官方页确认授权即可。",
  "authorize.copilotStartSuggestDataQ": "会读取哪些数据？",
  "authorize.copilotStartSuggestDataA": "只读商品、库存、订单等基础数据，用于分析与货源匹配，不会修改店铺。",
  "authorize.copilotStartSuggestTimeQ": "大概要多久？",
  "authorize.copilotStartSuggestTimeA": "授权通常 1 分钟内完成，商品镜像会在后台自动同步。",

  "sku.breadcrumb": "SKU 绑定",
  "sku.assistantTitle": "SKU 绑定助手",
  "sku.copilotEmpty": "确认匹配后的商品会在这里按变体展开，我会帮你把每个变体对齐到 Tangbuy 货源 SKU。",
  "sku.copilotPartial": "还有 {{products}} 个商品部分关联（{{review}} 待确认 · {{unbound}} 未匹配）。",
  "sku.copilotAll": "全部 {{products}} 个商品已全部关联，可直接进入物流确认。",
  "sku.copilotBulletAll": "全部关联：{{products}} 个商品",
  "sku.copilotBulletPartial": "部分关联：{{products}} 个商品",
  "sku.copilotBulletSearch": "可用上方搜索框按标题或 ID 定位商品",
  "sku.copilotBulletNext": "下一步：用页面上方「进入物流确认」继续",
  "sku.toastAccepted": "已接受本页 {{count}} 个 AI 建议",
  "sku.metricFullyLinked": "全部关联",
  "sku.metricFullyLinkedHint": "全部 SKU 已映射匹配",
  "sku.metricPartiallyLinked": "部分关联",
  "sku.metricPartiallyLinkedHint": "{{review}} 待确认 · {{unbound}} 未匹配",
  "sku.metricNeedsReview": "待确认变体",
  "sku.metricNeedsReviewHintYes": "中等置信度，需人工确认",
  "sku.metricNeedsReviewHintNo": "暂无待确认",
  "sku.metricTotalVariants": "变体总数",
  "sku.metricTotalVariantsHint": "已处理 {{resolved}}/{{total}}",
  "sku.filterAll": "全部",
  "sku.filterFullyLinked": "全部关联",
  "sku.filterPartiallyLinked": "部分关联",
  "sku.matchRuleTitle": "匹配规则",
  "sku.matchRuleCategory": "商品标题与关键词",
  "sku.matchRuleSpec": "规格（颜色 / 尺寸 / 材质等）",
  "sku.matchRuleImage": "图片相似度",
  "sku.scanCopilotTitle": "正在自动整理",
  "sku.scanCopilotRunning": "正在把店铺每个规格和 Tangbuy 货源规格做自动匹配，并提前加载对照所需的价格信息。",
  "sku.scanCopilotDone": "自动匹配已完成，可以开始逐款核对规格绑定。",
  "sku.scanCopilotNextRunning": "先查看当前进度",
  "sku.scanCopilotNextDone": "查看结果",
  "sku.scanStatusRunning": "进行中…",
  "sku.scanStatusDone": "完成",
  "sku.scanStatusFailed": "失败",
  "sku.scanStatusSkipped": "跳过",
  "sku.scanStatusPending": "待处理",
  "sku.restoringAuth": "正在恢复店铺授权…",

  "shopProducts.noReliableMatch": "未找到可靠匹配",
  "shopProducts.pendingTitleImage": "待确认 · 标题 {{title}}% · 图像 {{image}}%",
  "shopProducts.pendingTitleOnly": "待确认 · 标题 {{title}}%",
  "shopProducts.pending": "待确认",
  "shopProducts.scoresTitleImage": "标题 {{title}}% · 图像 {{image}}%",
  "shopProducts.scoresTitleOnly": "标题 {{title}}%",
  "shopProducts.autoMatched": "已自动匹配",
  "shopProducts.searchingSource": "正在识别同款货源…",
  "shopProducts.linking": "正在建立关联…",
  "shopProducts.matchComplete": "匹配完成",
  "shopProducts.monthlySalesWan": "月销 {{count}}万",
  "shopProducts.monthlySales": "月销 {{count}}",
  "shopProducts.repurchase": "复购 {{rate}}",
  "shopProducts.purchaseCost": "采购价 {{price}}",
  "shopProducts.purchaseCostPending": "采购价待取",
  "shopProducts.reasonOriginalImage": "按货源原图发起图搜",
  "shopProducts.reasonShopImage": "已用店铺主图图搜",
  "shopProducts.reasonImageHit": "图搜命中",
  "shopProducts.reasonTitleCal": "标题校准「{{query}}」",
  "shopProducts.reasonAiCal": "AI 识图校准「{{query}}」",
  "shopProducts.reasonComposite": "标题综合分 {{score}}",
  "shopProducts.tagSuggestSearch": "建议图搜",
  "shopProducts.tagRelaxFilters": "可放宽条件",
  "shopProducts.tagShopImageSearch": "已用店铺图搜",
  "shopProducts.tagImageHit": "图搜命中",
  "shopProducts.tagCalibrated": "标题/识图校准",
  "shopProducts.tagBetterCost": "更优成本",
  "shopProducts.filterAll": "全部",
  "shopProducts.filterPending": "待确认",
  "shopProducts.filterConfirmed": "已确认",
  "shopProducts.filterUnbound": "未关联",
  "shopProducts.batchAck": "批量确认（{{count}}）",
  "shopProducts.batchAcking": "确认中…",
  "shopProducts.loadFailed": "加载失败：",
  "shopProducts.retry": "重试",
  "shopProducts.emptyNoProducts": "暂无商品",
  "shopProducts.emptyNoProductsDesc": "同步店铺后即可加载商品。",
  "shopProducts.emptyNoNewArrivals": "暂无新品",
  "shopProducts.emptyFilterTitle": "当前筛选无商品",
  "shopProducts.emptyNewArrivalsDesc": "稍后再来查看新品货源。",
  "shopProducts.emptyFilterDesc": "试试其他筛选或搜索条件。",
  "shopProducts.prevPage": "上一页",
  "shopProducts.nextPage": "下一页",
  "shopProducts.pageOf": "第 {{page}} / {{total}} 页",
  "shopProducts.noTitle": "（无标题）",

  "supplierConfirm.title": "确认货源",
  "supplierConfirm.body": "确认将此货源关联到当前商品？",
  "supplierConfirm.cancel": "取消",
  "supplierConfirm.confirm": "确认货源并关联",
  "supplierConfirm.confirming": "关联中…",
  "supplierConfirm.noImage": "无图片",
  "supplierConfirm.sourceTitle": "货源",

  "nav.workbench": "工作台",
  "nav.flow": "开店流程",
  "nav.authorize": "授权店铺",
  "nav.logistics": "物流",

  "products.title": "商品关联",
  "products.goAuthorize": "去授权",
  "products.notConnectedTitle": "尚未连接店铺",
  "products.notConnectedDesc": "请先授权 Shopify，才能加载商品并开始关联货源。",
  "products.restoringAuth": "正在恢复店铺授权…",
  "products.scanDoneTitle": "首轮分析已完成",
  "products.scanningTitle": "AI 正在分析",
  "products.tabShop": "Shopify 商品",
  "products.tabDiscover": "选品发现",
  "products.searchPlaceholder": "搜索商品标题/SKU…",
};

const FR_MAP = [
  [/Authorize store/gi, "Autoriser la boutique"],
  [/SKU mapping/gi, "Correspondance SKU"],
  [/Product linking/gi, "Liens produits"],
  [/Logistics/gi, "Logistique"],
  [/Confirm/gi, "Confirmer"],
  [/Cancel/gi, "Annuler"],
  [/Retry/gi, "Réessayer"],
  [/Loading/gi, "Chargement"],
  [/Search/gi, "Rechercher"],
  [/Refresh/gi, "Actualiser"],
  [/Assistant/gi, "Assistant"],
  [/Source/gi, "Source"],
  [/Variant/gi, "Variante"],
  [/Product/gi, "Produit"],
  [/Store/gi, "Boutique"],
];

const ES_MAP = [
  [/Authorize store/gi, "Autorizar tienda"],
  [/SKU mapping/gi, "Mapeo de SKU"],
  [/Product linking/gi, "Enlaces de productos"],
  [/Logistics/gi, "Logística"],
  [/Confirm/gi, "Confirmar"],
  [/Cancel/gi, "Cancelar"],
  [/Retry/gi, "Reintentar"],
  [/Loading/gi, "Cargando"],
  [/Search/gi, "Buscar"],
  [/Refresh/gi, "Actualizar"],
  [/Assistant/gi, "Asistente"],
  [/Source/gi, "Fuente"],
  [/Variant/gi, "Variante"],
  [/Product/gi, "Producto"],
  [/Store/gi, "Tienda"],
];

function autoTranslate(text, map) {
  let out = text;
  for (const [re, rep] of map) out = out.replace(re, rep);
  return out;
}

function generateEn(key, zhMap, enFromOld) {
  if (EN_OVERRIDES[key]) return EN_OVERRIDES[key];
  if (enFromOld[key]) return enFromOld[key];
  if (zhMap[key]) {
    const translated = zhToEn(zhMap[key]);
    if (translated) return translated;
  }
  return camelToLabel(lastSegment(key));
}

function isBrokenString(value) {
  if (!value || typeof value !== "string") return true;
  if (/\$\{[^}]+\}/.test(value) && !/\{\{/.test(value)) return true;
  if (/^\[data-/.test(value)) return true;
  if (/^Err /i.test(value)) return true;
  if (/^Toast /i.test(value)) return true;
  if (/sku-compare-row/.test(value)) return true;
  if (/relative z-10/.test(value) || /className/.test(value)) return true;
  if (/^Product \$\{/.test(value)) return true;
  return false;
}

function generateZh(key, enText, zhMap, existing) {
  if (ZH_OVERRIDES[key]) return ZH_OVERRIDES[key];
  if (
    existing &&
    /[\u4e00-\u9fff]/.test(existing) &&
    !isBrokenString(existing)
  ) {
    return existing;
  }
  const fromGit = zhMap[key];
  if (fromGit && /[\u4e00-\u9fff]/.test(fromGit) && !isBrokenString(fromGit)) {
    return fromGit;
  }
  return enText;
}

function serializeValue(v, indent) {
  if (typeof v === "string") return JSON.stringify(v);
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);
  const lines = Object.entries(v).map(([k, val]) => {
    const key = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : JSON.stringify(k);
    return `${padInner}${key}: ${serializeValue(val, indent + 1)},`;
  });
  return `{\n${lines.join("\n")}\n${pad}}`;
}

function writeLocaleFile(path, localeName, obj, comment, typed = false) {
  const body = serializeValue(obj, 0);
  const typedExport = typed
    ? `export const ${localeName}: Dictionary = ${body};`
    : `export const ${localeName} = ${body};`;
  writeFileSync(path, `${comment}\n\n${typedExport}\n`, "utf8");
}

// === Main: rebuild from ORIGINAL base (866 keys) + all used keys ===
const { zhMap, enFromOld } = extractFromGit();
console.log(`Git extraction: ${Object.keys(zhMap).length} zh, ${Object.keys(enFromOld).length} en`);

// Start from original en structure - read current and only UPDATE values for keys that need improvement
const definedKeys = flatten(en);
const usedKeys = new Set();
const tPattern = /\bt\(\s*["']([a-zA-Z][a-zA-Z0-9_.]*)/g;
for (const file of walkDir(join(ROOT, "src"), [".ts", ".tsx"])) {
  const content = readFileSync(file, "utf8");
  let m;
  while ((m = tPattern.exec(content)) !== null) usedKeys.add(m[1]);
}

const allKeys = [...usedKeys].sort();
const enFlat = { ...definedKeys };
const zhFlat = {};
const frFlat = {};
const esFlat = {};

// Load existing zh/fr/es for keys already defined
const { zh: existingZh } = await import("../src/i18n/messages/zh.ts");
const { fr: existingFr } = await import("../src/i18n/messages/fr.ts");
const { es: existingEs } = await import("../src/i18n/messages/es.ts");
Object.assign(zhFlat, flatten(existingZh));
Object.assign(frFlat, flatten(existingFr));
Object.assign(esFlat, flatten(existingEs));

function looksAutoGenerated(key, value) {
  if (!value) return true;
  if (isBrokenString(value)) return true;
  const label = camelToLabel(lastSegment(key));
  if (value === label) return true;
  // "Filter All", "No Reliable Match" style from naive camelCase
  if (/^[A-Z][a-z]+( [A-Z][a-z]+)+$/.test(value) && value.toLowerCase() === label.toLowerCase()) {
    return true;
  }
  return false;
}

let added = 0;
let updated = 0;
for (const key of allKeys) {
  let enVal;
  if (EN_OVERRIDES[key]) {
    enVal = EN_OVERRIDES[key];
    if (definedKeys[key] && definedKeys[key] !== enVal) updated++;
  } else if (definedKeys[key] && !looksAutoGenerated(key, definedKeys[key])) {
    enVal = definedKeys[key];
  } else {
    enVal = generateEn(key, zhMap, enFromOld);
    if (!definedKeys[key]) added++;
    else if (definedKeys[key] !== enVal) updated++;
  }

  const zhVal = generateZh(key, enVal, zhMap, zhFlat[key]);
  const frVal = autoTranslate(enVal, FR_MAP);
  const esVal = autoTranslate(enVal, ES_MAP);

  enFlat[key] = enVal;
  zhFlat[key] = zhVal;
  frFlat[key] = frVal;
  esFlat[key] = esVal;
}

console.log(`Keys: ${allKeys.length}, newly added: ${added}, en overrides applied: ${updated}`);
console.log(`zh with Chinese: ${Object.values(zhFlat).filter(v => /[\u4e00-\u9fff]/.test(v)).length}`);

const mergedEn = unflatten(enFlat);
const mergedZh = unflatten(zhFlat);
const mergedFr = unflatten(frFlat);
const mergedEs = unflatten(esFlat);

writeLocaleFile(
  join(ROOT, "src/i18n/messages/en.ts"),
  "en",
  mergedEn,
  "// English — source of truth. Every other locale mirrors this key structure.\n// Keep strings concise and professional (e-commerce supply-chain domain)."
);
writeLocaleFile(
  join(ROOT, "src/i18n/messages/zh.ts"),
  "zh",
  mergedZh,
  'import type { Dictionary } from "./en";',
  true
);
writeLocaleFile(
  join(ROOT, "src/i18n/messages/fr.ts"),
  "fr",
  mergedFr,
  'import type { Dictionary } from "./en";',
  true
);
writeLocaleFile(
  join(ROOT, "src/i18n/messages/es.ts"),
  "es",
  mergedEs,
  'import type { Dictionary } from "./en";',
  true
);

let enContent = readFileSync(join(ROOT, "src/i18n/messages/en.ts"), "utf8");
if (!enContent.includes("export type Dictionary")) {
  enContent += "\nexport type Dictionary = typeof en;\n";
  writeFileSync(join(ROOT, "src/i18n/messages/en.ts"), enContent, "utf8");
}

console.log("Done.");
