#!/usr/bin/env node
/**
 * Restore UI drawer / panel i18n blocks corrupted by generate-missing-i18n.
 * Run: node scripts/patch-ui-drawer-i18n.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["en", "zh", "fr", "es"];
const BLOCK_NAMES = [
  "productsDecision",
  "pricingDrawer",
  "pricingRail",
  "productDetail",
  "catalogPublish",
  "matchCompare",
  "listingStatus",
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

const productsDecisionEn = {
  actionLocate: "Locate in list",
  currentConclusion: "Current conclusion",
  judgeRuleHint:
    "The decision panel prioritizes pending links, unbound products, and pricing gaps from your current shop state.",
  locate: "Locate",
  matchRuleHint:
    "Sources are ranked by image similarity, title overlap, and price band. High-confidence matches can be batch-confirmed.",
  nextStep: "Next step",
  noTodos: "Nothing needs attention right now",
  todoCount: "{{count}} items",
  todosTitle: "To-do",
  viewJudgeRules: "How priorities are scored",
  viewMatchRules: "How matching works",
};

const productsDecisionZh = {
  actionLocate: "在列表中定位",
  currentConclusion: "当前结论",
  judgeRuleHint:
    "决策面板会根据店铺当前状态，优先提示待确认关联、未匹配商品与定价缺口。",
  locate: "定位",
  matchRuleHint:
    "货源按图搜相似度、标题重合与价格带排序；高置信匹配可批量确认。",
  nextStep: "下一步",
  noTodos: "暂无需要处理的事项",
  todoCount: "{{count}} 项",
  todosTitle: "待办",
  viewJudgeRules: "优先级如何计算",
  viewMatchRules: "匹配规则说明",
};

const pricingDrawerEn = {
  addend: "Fixed addend",
  addendHint: "Added after multiplier, in target currency",
  addendStep: "+ {{addend}} → {{afterAdd}}",
  badgeDefault: "System default",
  badgeSaved: "Saved",
  calcHint: "Sample uses ¥33 procurement cost — your catalog follows the same formula.",
  calcTitle: "Sample calculation",
  cancel: "Cancel",
  clearing: "Resetting…",
  closeAria: "Close pricing drawer",
  decimals: "Decimal places",
  errAddend: "Enter a valid addend",
  errDecimals: "Decimals must be 0–4",
  errMultiplier: "Enter a valid multiplier > 0",
  errRate: "Enter a valid exchange rate > 0",
  exchangeRate: "Exchange rate (CNY → target)",
  fxStep: "÷ {{rate}} → {{converted}}",
  loading: "Loading template…",
  multiplier: "Markup multiplier",
  multiplierStep: "× {{multiplier}} → {{afterMul}}",
  purchaseLabel: "Procurement cost ",
  rateHint: "Target-currency units per 1 CNY of procurement cost",
  restoreDefault: "Restore system default",
  roundCeil: "Ceil",
  roundCharm99: ".99 charm",
  roundFloor: "Floor",
  roundHalfUp: "Half up",
  roundedResult: "Round ({{rounding}}) → ",
  roundingFallback: "Round",
  roundingStrategy: "Rounding",
  save: "Save template",
  saving: "Saving…",
  subtitle: "Set FX rate, multiplier, and rounding for Discovery suggested prices.",
  targetCurrency: "Target currency",
  title: "Pricing template",
};

const pricingDrawerZh = {
  addend: "固定加价",
  addendHint: "倍率之后按目标币种加的固定金额",
  addendStep: "+ {{addend}} → {{afterAdd}}",
  badgeDefault: "系统默认",
  badgeSaved: "已保存",
  calcHint: "样例按 ¥33 采购成本演示 — 目录商品按同一公式出价。",
  calcTitle: "计算示例",
  cancel: "取消",
  clearing: "正在恢复…",
  closeAria: "关闭定价侧栏",
  decimals: "小数位",
  errAddend: "请输入有效的固定加价",
  errDecimals: "小数位须为 0–4",
  errMultiplier: "请输入有效的倍率（> 0）",
  errRate: "请输入有效的汇率（> 0）",
  exchangeRate: "汇率（人民币 → 目标币）",
  fxStep: "÷ {{rate}} → {{converted}}",
  loading: "正在加载模板…",
  multiplier: "加价倍率",
  multiplierStep: "× {{multiplier}} → {{afterMul}}",
  purchaseLabel: "采购成本 ",
  rateHint: "每 1 元人民币兑换多少目标币种",
  restoreDefault: "恢复系统默认",
  roundCeil: "向上取整",
  roundCharm99: ".99 心理价",
  roundFloor: "向下取整",
  roundHalfUp: "四舍五入",
  roundedResult: "取整（{{rounding}}）→ ",
  roundingFallback: "取整",
  roundingStrategy: "取整策略",
  save: "保存模板",
  saving: "保存中…",
  subtitle: "配置汇率、倍率与取整规则，用于发现新品建议售价。",
  targetCurrency: "目标币种",
  title: "定价模板",
};

const pricingRailEn = {
  addend: "Addend",
  adjustPricing: "Adjust",
  configureNow: "Configure now",
  exchangeRate: "FX",
  loading: "Loading pricing…",
  multiplier: "Multiplier",
  setupDesc:
    "Configure currency, FX rate, and multiplier so Discovery suggested prices match your margin.",
  setupTitle: "Set up pricing first",
  summaryDesc: "Discovery suggested prices use this template.",
  targetCurrency: "Currency",
  title: "Pricing strategy",
};

const pricingRailZh = {
  addend: "加价",
  adjustPricing: "调整",
  configureNow: "立即配置",
  exchangeRate: "汇率",
  loading: "正在加载定价…",
  multiplier: "倍率",
  setupDesc: "配置目标币种、汇率与倍率，发现新品建议售价才会符合你的利润预期。",
  setupTitle: "先配置定价",
  summaryDesc: "发现新品建议售价按此模板计算。",
  targetCurrency: "币种",
  title: "定价策略",
};

const productDetailEn = {
  atLeastOneVariant: "Keep at least one variant",
  cannotDeleteLast: "Cannot remove the last variant",
  close: "Close",
  closeAria: "Close product detail",
  colOption: "Option",
  colPrice: "Price ({{currency}})",
  colSku: "SKU",
  colStock: "Stock",
  conflictBody:
    "This product changed on Shopify since you opened it. Reload for the latest, or force-save your edits.",
  conflictDetected: "Shopify was updated elsewhere",
  conflictMessage: "Could not save — refresh and try again",
  currencyFallback: "USD",
  deleteColAria: "Remove variant",
  deleteImage: "Remove image",
  deleteImageAria: "Remove image",
  deleteVariant: "Remove variant",
  deleteVariantAria: "Remove variant {{label}}",
  descHtmlNote: "Description syncs as HTML to Shopify.",
  descPlaceholder: "Product description (HTML supported)",
  discardReload: "Discard & reload",
  editText: "Edit HTML",
  editableSection: "Editable fields",
  errTitleEmpty: "Title cannot be empty",
  errVariantPriceEmpty: "Enter a price for « {{label}} »",
  errVariantPriceInvalid: "Invalid price for « {{label}} »",
  errVariantStockEmpty: "Enter stock for « {{label}} »",
  errVariantStockInvalid: "Invalid stock for « {{label}} »",
  fallbackTitle: "Untitled product",
  fieldDescription: "Description",
  fieldStatus: "Status",
  fieldTitle: "Title",
  forceSave: "Force save",
  galleryHint: "First image is the main product image on Shopify.",
  galleryPending: " · {{count}} pending removal",
  galleryTitle: "Images ({{count}}){{pending}}",
  htmlDetailHint: "Rendered as customers will see on your storefront.",
  htmlDetailTitle: "Description images ({{count}})",
  loading: "Loading…",
  loadingMirror: "Loading from Shopify…",
  mirrorUpdated: "Synced from Shopify",
  noDescription: "No description",
  noImage: "No image",
  noVariants: "No variants",
  previewHtml: "Preview",
  primaryImage: "Main",
  reload: "Reload",
  reset: "Reset",
  saveSync: "Save & sync",
  saving: "Saving…",
  statusActive: "Active",
  statusArchived: "Archived",
  statusDraft: "Draft",
  subtitle: "Edit title, status, variants — syncs to Shopify",
  title: "Shop product detail",
  variantsHint: "Price and inventory changes sync per variant.",
  variantsMarkedDelete: "{{count}} variant(s) marked for removal",
  variantsTitle: "Variants ({{count}})",
};

const productDetailZh = {
  atLeastOneVariant: "至少保留一个规格",
  cannotDeleteLast: "不能删除最后一个规格",
  close: "关闭",
  closeAria: "关闭商品详情",
  colOption: "规格",
  colPrice: "售价（{{currency}}）",
  colSku: "SKU",
  colStock: "库存",
  conflictBody:
    "打开详情后 Shopify 上已有更新。请重新加载查看最新内容，或强制保存你的修改。",
  conflictDetected: "Shopify 端已有更新",
  conflictMessage: "保存失败 — 请刷新后重试",
  currencyFallback: "USD",
  deleteColAria: "删除规格",
  deleteImage: "移除图片",
  deleteImageAria: "移除图片",
  deleteVariant: "移除规格",
  deleteVariantAria: "移除规格 {{label}}",
  descHtmlNote: "描述将以 HTML 同步到 Shopify。",
  descPlaceholder: "商品描述（支持 HTML）",
  discardReload: "放弃并重新加载",
  editText: "编辑 HTML",
  editableSection: "可编辑字段",
  errTitleEmpty: "标题不能为空",
  errVariantPriceEmpty: "请填写「{{label}}」的售价",
  errVariantPriceInvalid: "「{{label}}」售价格式无效",
  errVariantStockEmpty: "请填写「{{label}}」的库存",
  errVariantStockInvalid: "「{{label}}」库存须为非负整数",
  fallbackTitle: "未命名商品",
  fieldDescription: "描述",
  fieldStatus: "状态",
  fieldTitle: "标题",
  forceSave: "强制保存",
  galleryHint: "第一张图将作为 Shopify 主图。",
  galleryPending: " · {{count}} 张待移除",
  galleryTitle: "图片（{{count}}）{{pending}}",
  htmlDetailHint: "按店铺前台所见效果渲染。",
  htmlDetailTitle: "描述内图片（{{count}}）",
  loading: "加载中…",
  loadingMirror: "正在从 Shopify 加载…",
  mirrorUpdated: "已从 Shopify 同步",
  noDescription: "暂无描述",
  noImage: "暂无图片",
  noVariants: "暂无规格",
  previewHtml: "预览",
  primaryImage: "主图",
  reload: "重新加载",
  reset: "重置",
  saveSync: "保存并同步",
  saving: "保存中…",
  statusActive: "在售",
  statusArchived: "已归档",
  statusDraft: "草稿",
  subtitle: "编辑标题、状态与规格 — 同步到 Shopify",
  title: "店铺商品详情",
  variantsHint: "售价与库存按规格分别同步。",
  variantsMarkedDelete: "{{count}} 个规格已标记移除",
  variantsTitle: "规格（{{count}}）",
};

const catalogPublishEn = {
  confirmPublish: "List「{{title}}」to {{shopName}} at {{price}}?",
  loadFailed: "Failed to load catalog: {{error}}",
  publishFailed: "Listing failed",
  publishInProgress: "Listing in progress…",
  publishIncomplete: "Listing incomplete: {{message}}",
  publishSuccess: "Listed to store",
  retry: "Retry",
  toastSearchSaved: "Saved search「{{name}}」",
};

const catalogPublishZh = {
  confirmPublish: "将「{{title}}」以 {{price}} 上架到 {{shopName}}？",
  loadFailed: "加载目录失败：{{error}}",
  publishFailed: "上架失败",
  publishInProgress: "正在上架…",
  publishIncomplete: "上架未完成：{{message}}",
  publishSuccess: "已上架到店铺",
  retry: "重试",
  toastSearchSaved: "已保存筛选「{{name}}」",
};

const matchCompareEn = {
  adoptProduct: "Confirm link",
  adopted: "Linked",
  cost: "Cost",
  defer: "Defer",
  deferred: "Deferred",
  marginEstimate: "Est. margin",
  matchScore: "Match",
  matchedTo: "Linked to",
  rejected: "Rejected",
  shopProduct: "Shop product",
  sourceImageSearch: "Image search",
  sourceManual: "Manual",
  sourceTitleMatch: "Title match",
  statusConfirmed: "Confirmed",
  statusDeferred: "Deferred",
  statusFlagged: "Flagged",
  statusNeedsReview: "Needs review",
  statusRejected: "Rejected",
  statusUnlinked: "Unlinked",
  stockCount: "{{count}} in stock",
  stockInStock: "In stock",
  stockLow: "Low stock",
  stockOut: "Out of stock",
  swapCandidate: "Swap source",
  tangbuyRecommend: "Tangbuy pick",
  viewCandidates: "View candidates",
  viewDetails: "View details",
};

const matchCompareZh = {
  adoptProduct: "确认关联",
  adopted: "已关联",
  cost: "成本",
  defer: "暂缓",
  deferred: "已暂缓",
  marginEstimate: "预估毛利",
  matchScore: "匹配度",
  matchedTo: "已关联至",
  rejected: "已拒绝",
  shopProduct: "店铺商品",
  sourceImageSearch: "图搜",
  sourceManual: "手动",
  sourceTitleMatch: "标题匹配",
  statusConfirmed: "已确认",
  statusDeferred: "已暂缓",
  statusFlagged: "已标记",
  statusNeedsReview: "待审核",
  statusRejected: "已拒绝",
  statusUnlinked: "未关联",
  stockCount: "库存 {{count}}",
  stockInStock: "有货",
  stockLow: "库存偏低",
  stockOut: "缺货",
  swapCandidate: "更换货源",
  tangbuyRecommend: "Tangbuy 推荐",
  viewCandidates: "查看候选",
  viewDetails: "查看详情",
};

const listingStatusEn = {
  archived: "Archived",
  draft: "Draft (hidden from storefront)",
  transition: "{{from}} → {{to}} ({{label}})",
};

const listingStatusZh = {
  archived: "归档下架",
  draft: "草稿（前台不可见）",
  transition: "{{from}} → {{to}}（{{label}}）",
};

function frProductsDecision(en) {
  return {
    ...en,
    actionLocate: "Localiser dans la liste",
    currentConclusion: "Conclusion actuelle",
    judgeRuleHint:
      "Le panneau de décision priorise les liens en attente, produits non liés et écarts de prix selon l'état actuel de la boutique.",
    locate: "Localiser",
    matchRuleHint:
      "Les sources sont classées par similarité d'image, chevauchement de titre et fourchette de prix.",
    nextStep: "Étape suivante",
    noTodos: "Rien à traiter pour le moment",
    todoCount: "{{count}} éléments",
    todosTitle: "À faire",
    viewJudgeRules: "Comment les priorités sont calculées",
    viewMatchRules: "Comment fonctionne la correspondance",
  };
}

function esProductsDecision(en) {
  return {
    ...en,
    actionLocate: "Localizar en la lista",
    currentConclusion: "Conclusión actual",
    judgeRuleHint:
      "El panel de decisión prioriza enlaces pendientes, productos sin vincular y brechas de precio según el estado actual de la tienda.",
    locate: "Localizar",
    matchRuleHint:
      "Las fuentes se ordenan por similitud de imagen, coincidencia de título y rango de precio.",
    nextStep: "Siguiente paso",
    noTodos: "Nada requiere atención ahora",
    todoCount: "{{count}} elementos",
    todosTitle: "Pendientes",
    viewJudgeRules: "Cómo se calculan las prioridades",
    viewMatchRules: "Cómo funciona la coincidencia",
  };
}

function frPricingDrawer(en) {
  return {
    ...en,
    addend: "Addend fixe",
    addendHint: "Ajouté après le multiplicateur, en devise cible",
    badgeDefault: "Défaut système",
    badgeSaved: "Enregistré",
    calcHint: "Exemple avec coût d'achat ¥33 — votre catalogue suit la même formule.",
    calcTitle: "Exemple de calcul",
    cancel: "Annuler",
    clearing: "Réinitialisation…",
    closeAria: "Fermer le tiroir de prix",
    decimals: "Décimales",
    errAddend: "Entrez un addend valide",
    errDecimals: "Les décimales doivent être entre 0 et 4",
    errMultiplier: "Entrez un multiplicateur valide > 0",
    errRate: "Entrez un taux de change valide > 0",
    exchangeRate: "Taux de change (CNY → cible)",
    loading: "Chargement du modèle…",
    multiplier: "Multiplicateur de marge",
    purchaseLabel: "Coût d'achat ",
    rateHint: "Unités de devise cible par 1 CNY de coût d'achat",
    restoreDefault: "Restaurer le défaut système",
    roundCeil: "Arrondi supérieur",
    roundCharm99: "Charme .99",
    roundFloor: "Arrondi inférieur",
    roundHalfUp: "Arrondi standard",
    roundedResult: "Arrondi ({{rounding}}) → ",
    roundingFallback: "Arrondi",
    roundingStrategy: "Arrondi",
    save: "Enregistrer le modèle",
    saving: "Enregistrement…",
    subtitle: "Définissez taux, multiplicateur et arrondi pour les prix suggérés Discovery.",
    targetCurrency: "Devise cible",
    title: "Modèle de prix",
  };
}

function esPricingDrawer(en) {
  return {
    ...en,
    addend: "Addend fijo",
    addendHint: "Añadido tras el multiplicador, en moneda objetivo",
    badgeDefault: "Predeterminado del sistema",
    badgeSaved: "Guardado",
    calcHint: "Ejemplo con costo de compra ¥33 — su catálogo sigue la misma fórmula.",
    calcTitle: "Ejemplo de cálculo",
    cancel: "Cancelar",
    clearing: "Restableciendo…",
    closeAria: "Cerrar panel de precios",
    decimals: "Decimales",
    errAddend: "Introduzca un addend válido",
    errDecimals: "Los decimales deben ser 0–4",
    errMultiplier: "Introduzca un multiplicador válido > 0",
    errRate: "Introduzca una tasa de cambio válida > 0",
    exchangeRate: "Tipo de cambio (CNY → objetivo)",
    loading: "Cargando plantilla…",
    multiplier: "Multiplicador de margen",
    purchaseLabel: "Costo de compra ",
    rateHint: "Unidades de moneda objetivo por 1 CNY de costo",
    restoreDefault: "Restaurar predeterminado del sistema",
    roundCeil: "Redondeo superior",
    roundCharm99: "Encanto .99",
    roundFloor: "Redondeo inferior",
    roundHalfUp: "Redondeo estándar",
    roundedResult: "Redondeo ({{rounding}}) → ",
    roundingFallback: "Redondeo",
    roundingStrategy: "Redondeo",
    save: "Guardar plantilla",
    saving: "Guardando…",
    subtitle: "Configure tasa, multiplicador y redondeo para precios sugeridos Discovery.",
    targetCurrency: "Moneda objetivo",
    title: "Plantilla de precios",
  };
}

function frPricingRail(en) {
  return {
    ...en,
    addend: "Addend",
    adjustPricing: "Ajuster",
    configureNow: "Configurer maintenant",
    exchangeRate: "Taux",
    loading: "Chargement des prix…",
    multiplier: "Multiplicateur",
    setupDesc:
      "Configurez devise, taux et multiplicateur pour que les prix Discovery correspondent à votre marge.",
    setupTitle: "Configurez d'abord les prix",
    summaryDesc: "Les prix suggérés Discovery utilisent ce modèle.",
    targetCurrency: "Devise",
    title: "Stratégie de prix",
  };
}

function esPricingRail(en) {
  return {
    ...en,
    addend: "Addend",
    adjustPricing: "Ajustar",
    configureNow: "Configurar ahora",
    exchangeRate: "Tasa",
    loading: "Cargando precios…",
    multiplier: "Multiplicador",
    setupDesc:
      "Configure moneda, tasa y multiplicador para que los precios Discovery coincidan con su margen.",
    setupTitle: "Configure precios primero",
    summaryDesc: "Los precios sugeridos Discovery usan esta plantilla.",
    targetCurrency: "Moneda",
    title: "Estrategia de precios",
  };
}

function frProductDetail(en) {
  return {
    ...en,
    atLeastOneVariant: "Conservez au moins une variante",
    cannotDeleteLast: "Impossible de supprimer la dernière variante",
    close: "Fermer",
    closeAria: "Fermer le détail produit",
    colOption: "Option",
    colPrice: "Prix ({{currency}})",
    colSku: "SKU",
    colStock: "Stock",
    conflictBody:
      "Ce produit a changé sur Shopify depuis l'ouverture. Rechargez ou forcez l'enregistrement.",
    conflictDetected: "Shopify a été mis à jour ailleurs",
    conflictMessage: "Enregistrement impossible — actualisez et réessayez",
    deleteColAria: "Supprimer variante",
    deleteImage: "Retirer l'image",
    deleteImageAria: "Retirer l'image",
    deleteVariant: "Retirer variante",
    deleteVariantAria: "Retirer variante {{label}}",
    descHtmlNote: "La description se synchronise en HTML sur Shopify.",
    descPlaceholder: "Description produit (HTML accepté)",
    discardReload: "Abandonner et recharger",
    editText: "Modifier HTML",
    editableSection: "Champs modifiables",
    errTitleEmpty: "Le titre ne peut pas être vide",
    errVariantPriceEmpty: "Entrez un prix pour « {{label}} »",
    errVariantPriceInvalid: "Prix invalide pour « {{label}} »",
    errVariantStockEmpty: "Entrez le stock pour « {{label}} »",
    errVariantStockInvalid: "Stock invalide pour « {{label}} »",
    fallbackTitle: "Produit sans titre",
    fieldDescription: "Description",
    fieldStatus: "Statut",
    fieldTitle: "Titre",
    forceSave: "Forcer l'enregistrement",
    galleryHint: "La première image est l'image principale sur Shopify.",
    galleryPending: " · {{count}} en attente de suppression",
    galleryTitle: "Images ({{count}}){{pending}}",
    htmlDetailHint: "Rendu tel que vu sur votre boutique.",
    htmlDetailTitle: "Images dans la description ({{count}})",
    loading: "Chargement…",
    loadingMirror: "Chargement depuis Shopify…",
    mirrorUpdated: "Synchronisé depuis Shopify",
    noDescription: "Pas de description",
    noImage: "Pas d'image",
    noVariants: "Pas de variantes",
    previewHtml: "Aperçu",
    primaryImage: "Principale",
    reload: "Recharger",
    reset: "Réinitialiser",
    saveSync: "Enregistrer et synchroniser",
    saving: "Enregistrement…",
    statusActive: "Actif",
    statusArchived: "Archivé",
    statusDraft: "Brouillon",
    subtitle: "Modifier titre, statut, variantes — sync Shopify",
    title: "Détail produit boutique",
    variantsHint: "Prix et stock synchronisés par variante.",
    variantsMarkedDelete: "{{count}} variante(s) marquée(s) pour suppression",
    variantsTitle: "Variantes ({{count}})",
  };
}

function esProductDetail(en) {
  return {
    ...en,
    atLeastOneVariant: "Mantenga al menos una variante",
    cannotDeleteLast: "No se puede eliminar la última variante",
    close: "Cerrar",
    closeAria: "Cerrar detalle del producto",
    colOption: "Opción",
    colPrice: "Precio ({{currency}})",
    colSku: "SKU",
    colStock: "Stock",
    conflictBody:
      "Este producto cambió en Shopify desde que lo abrió. Recargue o guarde forzadamente.",
    conflictDetected: "Shopify se actualizó en otro lugar",
    conflictMessage: "No se pudo guardar — actualice e intente de nuevo",
    deleteColAria: "Eliminar variante",
    deleteImage: "Quitar imagen",
    deleteImageAria: "Quitar imagen",
    deleteVariant: "Quitar variante",
    deleteVariantAria: "Quitar variante {{label}}",
    descHtmlNote: "La descripción se sincroniza como HTML en Shopify.",
    descPlaceholder: "Descripción del producto (HTML admitido)",
    discardReload: "Descartar y recargar",
    editText: "Editar HTML",
    editableSection: "Campos editables",
    errTitleEmpty: "El título no puede estar vacío",
    errVariantPriceEmpty: "Introduzca precio para « {{label}} »",
    errVariantPriceInvalid: "Precio inválido para « {{label}} »",
    errVariantStockEmpty: "Introduzca stock para « {{label}} »",
    errVariantStockInvalid: "Stock inválido para « {{label}} »",
    fallbackTitle: "Producto sin título",
    fieldDescription: "Descripción",
    fieldStatus: "Estado",
    fieldTitle: "Título",
    forceSave: "Forzar guardado",
    galleryHint: "La primera imagen es la principal en Shopify.",
    galleryPending: " · {{count}} pendientes de eliminar",
    galleryTitle: "Imágenes ({{count}}){{pending}}",
    htmlDetailHint: "Renderizado como lo verán los clientes.",
    htmlDetailTitle: "Imágenes en la descripción ({{count}})",
    loading: "Cargando…",
    loadingMirror: "Cargando desde Shopify…",
    mirrorUpdated: "Sincronizado desde Shopify",
    noDescription: "Sin descripción",
    noImage: "Sin imagen",
    noVariants: "Sin variantes",
    previewHtml: "Vista previa",
    primaryImage: "Principal",
    reload: "Recargar",
    reset: "Restablecer",
    saveSync: "Guardar y sincronizar",
    saving: "Guardando…",
    statusActive: "Activo",
    statusArchived: "Archivado",
    statusDraft: "Borrador",
    subtitle: "Editar título, estado, variantes — sync Shopify",
    title: "Detalle producto tienda",
    variantsHint: "Precio e inventario se sincronizan por variante.",
    variantsMarkedDelete: "{{count}} variante(s) marcadas para eliminar",
    variantsTitle: "Variantes ({{count}})",
  };
}

function frCatalogPublish(en) {
  return {
    ...en,
    confirmPublish: "Lister « {{title}} » sur {{shopName}} à {{price}} ?",
    loadFailed: "Échec du chargement du catalogue : {{error}}",
    publishFailed: "Échec de la mise en ligne",
    publishInProgress: "Mise en ligne en cours…",
    publishIncomplete: "Mise en ligne incomplète : {{message}}",
    publishSuccess: "Mis en ligne sur la boutique",
    retry: "Réessayer",
    toastSearchSaved: "Recherche enregistrée « {{name}} »",
  };
}

function esCatalogPublish(en) {
  return {
    ...en,
    confirmPublish: "¿Publicar « {{title}} » en {{shopName}} a {{price}}?",
    loadFailed: "Error al cargar catálogo: {{error}}",
    publishFailed: "Error al publicar",
    publishInProgress: "Publicación en curso…",
    publishIncomplete: "Publicación incompleta: {{message}}",
    publishSuccess: "Publicado en la tienda",
    retry: "Reintentar",
    toastSearchSaved: "Búsqueda guardada « {{name}} »",
  };
}

function frMatchCompare(en) {
  return {
    ...en,
    adoptProduct: "Confirmer le lien",
    adopted: "Lié",
    cost: "Coût",
    defer: "Reporter",
    deferred: "Reporté",
    marginEstimate: "Marge est.",
    matchScore: "Correspondance",
    matchedTo: "Lié à",
    rejected: "Rejeté",
    shopProduct: "Produit boutique",
    sourceImageSearch: "Recherche d'image",
    sourceManual: "Manuel",
    sourceTitleMatch: "Correspondance titre",
    statusConfirmed: "Confirmé",
    statusDeferred: "Reporté",
    statusFlagged: "Signalé",
    statusNeedsReview: "À revoir",
    statusRejected: "Rejeté",
    statusUnlinked: "Non lié",
    stockCount: "{{count}} en stock",
    stockInStock: "En stock",
    stockLow: "Stock faible",
    stockOut: "Rupture",
    swapCandidate: "Changer la source",
    tangbuyRecommend: "Choix Tangbuy",
    viewCandidates: "Voir candidats",
    viewDetails: "Voir détails",
  };
}

function esMatchCompare(en) {
  return {
    ...en,
    adoptProduct: "Confirmar enlace",
    adopted: "Vinculado",
    cost: "Costo",
    defer: "Posponer",
    deferred: "Pospuesto",
    marginEstimate: "Margen est.",
    matchScore: "Coincidencia",
    matchedTo: "Vinculado a",
    rejected: "Rechazado",
    shopProduct: "Producto tienda",
    sourceImageSearch: "Búsqueda por imagen",
    sourceManual: "Manual",
    sourceTitleMatch: "Coincidencia de título",
    statusConfirmed: "Confirmado",
    statusDeferred: "Pospuesto",
    statusFlagged: "Marcado",
    statusNeedsReview: "Revisión pendiente",
    statusRejected: "Rechazado",
    statusUnlinked: "Sin vincular",
    stockCount: "{{count}} en stock",
    stockInStock: "En stock",
    stockLow: "Stock bajo",
    stockOut: "Agotado",
    swapCandidate: "Cambiar fuente",
    tangbuyRecommend: "Recomendación Tangbuy",
    viewCandidates: "Ver candidatos",
    viewDetails: "Ver detalles",
  };
}

function frListingStatus(en) {
  return {
    ...en,
    archived: "Archivé",
    draft: "Brouillon (masqué en boutique)",
    transition: "{{from}} → {{to}} ({{label}})",
  };
}

function esListingStatus(en) {
  return {
    ...en,
    archived: "Archivado",
    draft: "Borrador (oculto en tienda)",
    transition: "{{from}} → {{to}} ({{label}})",
  };
}

const blocks = {
  en: {
    productsDecision: productsDecisionEn,
    pricingDrawer: pricingDrawerEn,
    pricingRail: pricingRailEn,
    productDetail: productDetailEn,
    catalogPublish: catalogPublishEn,
    matchCompare: matchCompareEn,
    listingStatus: listingStatusEn,
  },
  zh: {
    productsDecision: productsDecisionZh,
    pricingDrawer: pricingDrawerZh,
    pricingRail: pricingRailZh,
    productDetail: productDetailZh,
    catalogPublish: catalogPublishZh,
    matchCompare: matchCompareZh,
    listingStatus: listingStatusZh,
  },
  fr: {
    productsDecision: frProductsDecision(productsDecisionEn),
    pricingDrawer: frPricingDrawer(pricingDrawerEn),
    pricingRail: frPricingRail(pricingRailEn),
    productDetail: frProductDetail(productDetailEn),
    catalogPublish: frCatalogPublish(catalogPublishEn),
    matchCompare: frMatchCompare(matchCompareEn),
    listingStatus: frListingStatus(listingStatusEn),
  },
  es: {
    productsDecision: esProductsDecision(productsDecisionEn),
    pricingDrawer: esPricingDrawer(pricingDrawerEn),
    pricingRail: esPricingRail(pricingRailEn),
    productDetail: esProductDetail(productDetailEn),
    catalogPublish: esCatalogPublish(catalogPublishEn),
    matchCompare: esMatchCompare(matchCompareEn),
    listingStatus: esListingStatus(listingStatusEn),
  },
};

for (const locale of LOCALES) {
  const file = join(ROOT, "src/i18n/messages", `${locale}.ts`);
  let src = readFileSync(file, "utf8");
  for (const name of BLOCK_NAMES) {
    src = replaceTopLevelBlock(src, name, formatBlock(name, blocks[locale][name]));
  }
  writeFileSync(file, src);
  const counts = BLOCK_NAMES.map(
    (n) => `${n}=${Object.keys(blocks[locale][n]).length}`
  ).join(", ");
  console.log(`${locale}: patched (${counts})`);
}
