#!/usr/bin/env node
/**
 * Restore sku.scan*, workbenchScan, shopSwitcher, api.httpError (zh) i18n.
 * Run: node scripts/patch-scan-misc-i18n.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["en", "zh", "fr", "es"];

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

function mergeSkuScanKeys(src, patches) {
  const marker = "\n  sku: {";
  const blockStart = src.lastIndexOf(marker);
  if (blockStart === -1) throw new Error("Top-level sku block not found");
  const blockEndMarker = "\n  skuAgent: {";
  const blockEnd = src.indexOf(blockEndMarker, blockStart);
  if (blockEnd === -1) throw new Error("sku block end not found");
  let block = src.slice(blockStart, blockEnd);
  for (const [key, value] of Object.entries(patches)) {
    const re = new RegExp(`(    ${key}: )[^,\\n]+,`);
    if (!re.test(block)) {
      console.warn(`  sku.${key} not found — skipped`);
      continue;
    }
    block = block.replace(re, `$1${JSON.stringify(value)},`);
  }
  return src.slice(0, blockStart) + block + src.slice(blockEnd);
}

const shopSwitcher = {
  en: {
    addShop: "Add shop",
    loadingShops: "Loading shops…",
    noAuthorizedShops: "No authorized shops",
    notConnected: "Not connected",
    toastAuthExpired: "This shop's authorization has expired. Please reconnect.",
    toastSwitchFailed: "Could not switch shop. Try again.",
    toastSwitched: "Switched to {{name}}",
  },
  zh: {
    addShop: "添加店铺",
    loadingShops: "加载店铺列表…",
    noAuthorizedShops: "暂无已授权店铺",
    notConnected: "未连接店铺",
    toastAuthExpired: "该店铺授权已失效，请重新授权",
    toastSwitchFailed: "切换店铺失败，请稍后重试",
    toastSwitched: "已切换到 {{name}}",
  },
  fr: {
    addShop: "Ajouter une boutique",
    loadingShops: "Chargement des boutiques…",
    noAuthorizedShops: "Aucune boutique autorisée",
    notConnected: "Non connecté",
    toastAuthExpired: "L'autorisation de cette boutique a expiré. Reconnectez-vous.",
    toastSwitchFailed: "Impossible de changer de boutique. Réessayez.",
    toastSwitched: "Basculé vers {{name}}",
  },
  es: {
    addShop: "Añadir tienda",
    loadingShops: "Cargando tiendas…",
    noAuthorizedShops: "No hay tiendas autorizadas",
    notConnected: "Sin conectar",
    toastAuthExpired: "La autorización de esta tienda ha caducado. Vuelva a conectar.",
    toastSwitchFailed: "No se pudo cambiar de tienda. Inténtelo de nuevo.",
    toastSwitched: "Cambiado a {{name}}",
  },
};

const workbenchScan = {
  en: {
    doneFooter: "Core alignment complete — source preloading may continue in background",
    eta: "About {{overallPct}}% complete",
    executingStep: "Running step: ",
    overallProgress: "Overall progress",
    previewResults: "Preview results",
    progressLabel: "{{percent}}%",
    recentDone: "Recently completed",
    runningFooter: "Still running — you can preview results anytime",
    statMatched: "Matched",
    statPending: "Pending",
    statProducts: "Products",
    statUnfulfilled: "Needs confirm",
    statusDone: "Done",
    statusPartial: "Partial",
    statusRunning: "Running",
    statusWaiting: "Waiting",
    stepCount: " / {{total}}",
    viewAiResults: "View AI results",
    viewResults: "View results",
    workflowTitle: "Workflow progress",
  },
  zh: {
    doneFooter: "核心对齐已完成，货源规格仍在后台预加载",
    eta: "约 {{overallPct}}% 完成",
    executingStep: "正在执行：",
    overallProgress: "整体进度",
    previewResults: "先查看当前结果",
    progressLabel: "{{percent}}%",
    recentDone: "最近完成",
    runningFooter: "仍在整理中，可随时先查看当前结果",
    statMatched: "已匹配",
    statPending: "待处理",
    statProducts: "商品",
    statUnfulfilled: "待确认",
    statusDone: "完成",
    statusPartial: "部分完成",
    statusRunning: "进行中",
    statusWaiting: "等待中",
    stepCount: " / {{total}} 步",
    viewAiResults: "查看 AI 结果",
    viewResults: "查看结果",
    workflowTitle: "流程进度",
  },
  fr: {
    doneFooter: "Alignement principal terminé — préchargement source en arrière-plan",
    eta: "Environ {{overallPct}}% terminé",
    executingStep: "Étape en cours : ",
    overallProgress: "Progression globale",
    previewResults: "Aperçu des résultats",
    progressLabel: "{{percent}}%",
    recentDone: "Récemment terminé",
    runningFooter: "En cours — vous pouvez prévisualiser à tout moment",
    statMatched: "Alignés",
    statPending: "En attente",
    statProducts: "Produits",
    statUnfulfilled: "À confirmer",
    statusDone: "Terminé",
    statusPartial: "Partiel",
    statusRunning: "En cours",
    statusWaiting: "En attente",
    stepCount: " / {{total}} étapes",
    viewAiResults: "Voir les résultats IA",
    viewResults: "Voir les résultats",
    workflowTitle: "Progression du flux",
  },
  es: {
    doneFooter: "Alineación principal lista — precarga de fuente en segundo plano",
    eta: "Aprox. {{overallPct}}% completado",
    executingStep: "Paso en curso: ",
    overallProgress: "Progreso general",
    previewResults: "Vista previa de resultados",
    progressLabel: "{{percent}}%",
    recentDone: "Completado recientemente",
    runningFooter: "En curso — puede previsualizar en cualquier momento",
    statMatched: "Alineados",
    statPending: "Pendiente",
    statProducts: "Productos",
    statUnfulfilled: "Por confirmar",
    statusDone: "Hecho",
    statusPartial: "Parcial",
    statusRunning: "En curso",
    statusWaiting: "Esperando",
    stepCount: " / {{total}} pasos",
    viewAiResults: "Ver resultados IA",
    viewResults: "Ver resultados",
    workflowTitle: "Progreso del flujo",
  },
};

const skuScan = {
  en: {
    scanCopilotDone: "Auto-match done — review variant bindings.",
    scanCopilotNextDone: "View results",
    scanCopilotNextRunning: "Preview progress",
    scanCopilotRunning:
      "Matching each variant to Tangbuy source specs and loading price data.",
    scanCopilotTitle: "Auto-organizing",
    scanInfo1: "Reads your Shopify variants",
    scanInfo2: "Matches Tangbuy source specs",
    scanInfo3: "Flags items needing review",
    scanInfoTitle: "What happens",
    scanRecentAlignDone: "Auto-match complete — {{summary}}",
    scanResultAlignDone: "Matched {{matched}} variants — {{summary}}",
    scanResultAlignFailed: "Auto-match failed",
    scanResultAlignSkipped: "Auto-match not started",
    scanResultAlignSummary:
      "{{pending}} to confirm · {{unbound}} unmapped · {{noSource}} no source",
    scanResultNoProducts: "No linked products yet",
    scanResultOverview: "{{products}} products · {{variants}} variants",
    scanResultPrewarmDone: "Preloaded {{count}} source spec tables",
    scanAlignProgress: "Processed {{processed}} / {{total}} products",
    scanStageDesc: "Matching store variants to source specs…",
    scanStageHeading: "Auto SKU alignment",
    scanStatusDone: "Done",
    scanStatusFailed: "Failed",
    scanStatusPending: "Pending",
    scanStatusRunning: "Running…",
    scanStatusSkipped: "Skipped",
    scanTaskAlign: "Auto-match store variants",
    scanTaskOverview: "Load linked products",
    scanTaskPrewarm: "Preload source specs (background)",
  },
  zh: {
    scanCopilotDone: "自动匹配已完成，可以开始逐款核对规格绑定。",
    scanCopilotNextDone: "查看结果",
    scanCopilotNextRunning: "先查看当前进度",
    scanCopilotRunning:
      "正在把店铺每个规格和 Tangbuy 货源规格做自动匹配，并提前加载对照所需的价格信息。",
    scanCopilotTitle: "正在自动整理",
    scanInfo1: "读取店铺全部变体规格",
    scanInfo2: "与 Tangbuy 货源规格自动匹配",
    scanInfo3: "标记仍需人工核对的项",
    scanInfoTitle: "扫描说明",
    scanRecentAlignDone: "自动匹配完成 — {{summary}}",
    scanResultAlignDone: "已匹配 {{matched}} 个变体 — {{summary}}",
    scanResultAlignFailed: "自动匹配失败",
    scanResultAlignSkipped: "未启动自动匹配",
    scanResultAlignSummary:
      "{{pending}} 待确认 · {{unbound}} 未匹配 · {{noSource}} 无货源",
    scanResultNoProducts: "暂无已关联商品",
    scanResultOverview: "{{products}} 个商品 · {{variants}} 个变体",
    scanResultPrewarmDone: "已预加载 {{count}} 个货源规格表",
    scanAlignProgress: "已处理 {{processed}} / {{total}} 个商品",
    scanStageDesc: "正在对照店铺变体与货源规格…",
    scanStageHeading: "自动 SKU 对齐",
    scanStatusDone: "完成",
    scanStatusFailed: "失败",
    scanStatusPending: "等待",
    scanStatusRunning: "进行中…",
    scanStatusSkipped: "已跳过",
    scanTaskAlign: "自动匹配店铺规格",
    scanTaskOverview: "加载已关联商品",
    scanTaskPrewarm: "预加载货源规格（后台）",
  },
  fr: {
    scanCopilotDone:
      "Correspondance automatique terminée — vérifiez les liaisons de variantes.",
    scanCopilotNextDone: "Voir les résultats",
    scanCopilotNextRunning: "Aperçu de la progression",
    scanCopilotRunning:
      "Correspondance de chaque variante aux specs Tangbuy et chargement des prix.",
    scanCopilotTitle: "Organisation automatique",
    scanInfo1: "Lit vos variantes Shopify",
    scanInfo2: "Fait correspondre les specs source Tangbuy",
    scanInfo3: "Signale les éléments à vérifier",
    scanInfoTitle: "Déroulement",
    scanRecentAlignDone: "Alignement terminé — {{summary}}",
    scanResultAlignDone: "{{matched}} variantes alignées — {{summary}}",
    scanResultAlignFailed: "Échec de l'alignement automatique",
    scanResultAlignSkipped: "Alignement non démarré",
    scanResultAlignSummary:
      "{{pending}} à confirmer · {{unbound}} non mappées · {{noSource}} sans source",
    scanResultNoProducts: "Aucun produit lié",
    scanResultOverview: "{{products}} produits · {{variants}} variantes",
    scanResultPrewarmDone: "{{count}} catalogues source préchargés",
    scanAlignProgress: "{{processed}} / {{total}} produits traités",
    scanStageDesc: "Correspondance des variantes boutique aux SKU source…",
    scanStageHeading: "Alignement SKU automatique",
    scanStatusDone: "Terminé",
    scanStatusFailed: "Échec",
    scanStatusPending: "En attente",
    scanStatusRunning: "En cours…",
    scanStatusSkipped: "Ignoré",
    scanTaskAlign: "Aligner les variantes boutique",
    scanTaskOverview: "Charger les produits liés",
    scanTaskPrewarm: "Précharger les specs source (arrière-plan)",
  },
  es: {
    scanCopilotDone:
      "Coincidencia automática lista — revise los enlaces de variantes.",
    scanCopilotNextDone: "Ver resultados",
    scanCopilotNextRunning: "Vista previa del progreso",
    scanCopilotRunning:
      "Emparejando cada variante con specs Tangbuy y cargando datos de precio.",
    scanCopilotTitle: "Organización automática",
    scanInfo1: "Lee sus variantes de Shopify",
    scanInfo2: "Empareja specs de fuente Tangbuy",
    scanInfo3: "Marca elementos que requieren revisión",
    scanInfoTitle: "Qué ocurre",
    scanRecentAlignDone: "Alineación completada — {{summary}}",
    scanResultAlignDone: "{{matched}} variantes alineadas — {{summary}}",
    scanResultAlignFailed: "Error en la alineación automática",
    scanResultAlignSkipped: "Alineación no iniciada",
    scanResultAlignSummary:
      "{{pending}} por confirmar · {{unbound}} sin mapear · {{noSource}} sin fuente",
    scanResultNoProducts: "Sin productos vinculados",
    scanResultOverview: "{{products}} productos · {{variants}} variantes",
    scanResultPrewarmDone: "{{count}} catálogos de fuente precargados",
    scanAlignProgress: "{{processed}} / {{total}} productos procesados",
    scanStageDesc: "Emparejando variantes de la tienda con SKU de fuente…",
    scanStageHeading: "Alineación SKU automática",
    scanStatusDone: "Hecho",
    scanStatusFailed: "Error",
    scanStatusPending: "Pendiente",
    scanStatusRunning: "En curso…",
    scanStatusSkipped: "Omitido",
    scanTaskAlign: "Alinear variantes de la tienda",
    scanTaskOverview: "Cargar productos vinculados",
    scanTaskPrewarm: "Precargar specs de fuente (en segundo plano)",
  },
};

const apiHttpError = {
  zh: "请求失败（HTTP {{status}}）。",
};

for (const locale of LOCALES) {
  const file = join(ROOT, "src/i18n/messages", `${locale}.ts`);
  let src = readFileSync(file, "utf8");

  src = replaceTopLevelBlock(
    src,
    "shopSwitcher",
    formatBlock("shopSwitcher", shopSwitcher[locale])
  );
  src = replaceTopLevelBlock(
    src,
    "workbenchScan",
    formatBlock("workbenchScan", workbenchScan[locale])
  );
  src = mergeSkuScanKeys(src, skuScan[locale]);

  if (apiHttpError[locale]) {
    src = src.replace(
      /(    httpError: )[^,\n]+,/,
      `$1${JSON.stringify(apiHttpError[locale])},`
    );
  }

  writeFileSync(file, src);
  console.log(`Patched ${locale}.ts`);
}
