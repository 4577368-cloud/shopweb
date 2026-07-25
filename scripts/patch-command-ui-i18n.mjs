#!/usr/bin/env node
/**
 * Restore commandUi, productsAiTask, productsIntent (fr/es) i18n blocks.
 * Run: node scripts/patch-command-ui-i18n.mjs
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

const commandUiEn = {
  afterLabel: "After · {{label}}",
  allVariantsUnified: "All variants → same price",
  autoApplyIn: "Auto-apply in {{seconds}}s",
  batchFailed: "{{count}} failed",
  batchSuccess: "{{count}} ok",
  beforeLabel: "Before · {{label}}",
  colAfter: "After",
  colCurrentPrice: "Current",
  colVariant: "Variant",
  confirmExecute: "Confirm",
  confirmHeader: "Confirm command",
  confirmModify: "Confirm change",
  detail: "Details",
  empty: "(empty)",
  execute: "Run",
  executing: "Running…",
  generatingPreview: "Generating preview…",
  hintAmbiguous:
    "Multiple variants match “{{hint}}”: {{matches}} — pick one below",
  hintPreselected: "Matched “{{hint}}” → {{label}}",
  impactConfirm: "Impact",
  impactDuration: "Est. duration: {{duration}}",
  impactIrreversible: "✗ Not easily reversible",
  impactReversible: "✓ Reversible (can undo manually)",
  impactScope: "Scope: {{scope}}",
  loadingVariants: "Loading variants…",
  multiVariantHint: "{{count}} variants — choose scope:",
  newPrice: "New price",
  noVariants: "No variants found",
  preparing: "Preparing batch…",
  selectScopeHint: "Select one variant or apply to all",
  singleVariantOnly: "This variant only",
  singleVariantSummary: "{{current}} → {{next}}",
  stepApplying: "Applying…",
  stepBatchRunning: "Batch running…",
  stepDone: "Done",
  stepError: "Error",
  stepExecuting: "Running…",
  stepPreviewReady: "Preview ready",
  target: "Target: {{label}}",
  targetLabel: "Target",
};

const commandUiZh = {
  afterLabel: "改后 · {{label}}",
  allVariantsUnified: "全部规格统一改价",
  autoApplyIn: "{{seconds}} 秒后自动执行",
  batchFailed: "失败 {{count}}",
  batchSuccess: "成功 {{count}}",
  beforeLabel: "改前 · {{label}}",
  colAfter: "改后",
  colCurrentPrice: "当前",
  colVariant: "规格",
  confirmExecute: "确认执行",
  confirmHeader: "命令确认",
  confirmModify: "确认修改",
  detail: "详情",
  empty: "（空）",
  execute: "执行",
  executing: "执行中…",
  generatingPreview: "正在生成预览…",
  hintAmbiguous: "「{{hint}}」匹配多个规格：{{matches}} — 请在下方点选",
  hintPreselected: "已匹配「{{hint}}」→ {{label}}",
  impactConfirm: "影响说明",
  impactDuration: "预计耗时：{{duration}}",
  impactIrreversible: "✗ 不易撤销",
  impactReversible: "✓ 可撤销（支持手动改回）",
  impactScope: "范围：{{scope}}",
  loadingVariants: "正在加载规格…",
  multiVariantHint: "共 {{count}} 个规格 — 请选择范围：",
  newPrice: "新售价",
  noVariants: "未找到规格",
  preparing: "正在准备批量任务…",
  selectScopeHint: "点选某一规格，或选择全部统一改价",
  singleVariantOnly: "仅改此规格",
  singleVariantSummary: "{{current}} → {{next}}",
  stepApplying: "正在应用…",
  stepBatchRunning: "批量执行中…",
  stepDone: "完成",
  stepError: "出错",
  stepExecuting: "执行中…",
  stepPreviewReady: "预览就绪",
  target: "目标：{{label}}",
  targetLabel: "目标",
};

const productsAiTaskEn = {
  titleReady: "Store analysis complete",
  titleRunning: "Analyzing store products…",
  summaryReady:
    "Analyzed {{analyzed}} products · {{matched}} matched · {{pending}} pending confirmation",
  summaryRunning: "Syncing products and matching sources…",
  pctMatched: "{{pct}}% matched",
  reading: "Reading store…",
  sourcesReady: " · all sources ready",
  confirmed: "Confirmed {{count}}",
  unbound: "Unlinked {{count}}",
  refreshTitle: "Re-run analysis",
  refreshAria: "Re-run analysis (sync products and auto-match sources)",
};

const productsAiTaskZh = {
  titleReady: "AI 已完成店铺商品分析",
  titleRunning: "正在分析店铺商品…",
  summaryReady:
    "已分析 {{analyzed}} 个商品 · 已匹配 {{matched}} · 待确认 {{pending}}",
  summaryRunning: "正在同步商品并自动关联货源…",
  pctMatched: "已匹配 {{pct}}%",
  reading: "读取中…",
  sourcesReady: " · 货源已就绪",
  confirmed: "已确认 {{count}}",
  unbound: "未匹配 {{count}}",
  refreshTitle: "重新分析",
  refreshAria: "重新分析（同步商品并自动关联货源）",
};

const productsIntentEn = {
  addendSuffix: " + {{addend}}",
  applyOneClick: "Apply in one click",
  collapseAnalysis: "Collapse",
  compareCandidates: "Why this source?",
  completed: "Done",
  configurePricing: "Configure pricing",
  configurePricingHint:
    "Set target currency, FX rate, and multiplier so suggested prices follow your rules.",
  currentFilters: "No extra filters applied.",
  currentPriority: "Current priority",
  currentProduct: "Current product",
  discoverNew: "Discover new products",
  expandAnalysis: "Expand",
  explainMatchReason: "Explain match reason",
  explainMatchRisk: "Match risk points",
  filterSuggestions: "Filter suggestions",
  findMoreCandidates: "Find more candidates",
  fxToTarget: "FX → target",
  imageSearchHint: "Try image search",
  locatePendingList: "Locate pending list",
  locateUnboundList: "Locate unlinked list",
  matched: "Matched",
  matchedCount: "{{matched}} / {{analyzed}}",
  multiplierAddend: "Multiplier · addend",
  noCategoryPresets: "No category presets",
  noExtraFilters: "No extra filters applied.",
  noPendingProducts: "No products pending",
  noRecommendedCategories: "No recommended categories",
  noUnboundProducts: "No unlinked products",
  noUnlinkedProducts: "Rematch all unlinked",
  notConfigured: "Not configured",
  openDiscover: "Open discovery",
  openDiscoverLabel: "Open discovery",
  openImageSearch: "Search candidates",
  openPricingDrawer: "Open pricing",
  pending: "Pending",
  pendingProducts: "Pending products",
  pricing: "Pricing",
  pricingActive: "Pricing is active",
  pricingAfterConfig: "Suggested prices update after you save.",
  pricingChain: "Pricing chain",
  pricingLine: "{{currency}} · FX {{rate}} · ×{{multiplier}}",
  pricingNotConfigured: "Pricing not configured yet",
  pricingReady: "Pricing ready",
  profitPerOrder: "Profit / order",
  purchaseAligned: " · purchase display aligned",
  purchaseCost: "Purchase cost",
  purchaseCostRmb: "Purchase cost (CNY)",
  purchaseDisplay: "Purchase display",
  rerunAllUnbound: "Rematch all unlinked",
  rerunCandidates: "Rematch candidates",
  rerunUnboundCount: "Rematch {{count}} unlinked",
  rerunUnboundHint: "Re-run image search for unlinked products",
  searchFirstItem: "Search candidates for the first item",
  selectProductFirst: "Select a product first",
  selectProductHint: "Select a product first",
  shopStatus: "Shop status",
  statusDetails: "Status details",
  task: "Task",
  unbound: "Unlinked",
  unboundProducts: "Unlinked products",
  usePriorityCard: "Use the priority card",
  viewAdjustPricing: "View / adjust pricing",
  viewPending: "View pending",
  viewPendingLabel: "View pending",
  viewUnboundLabel: "View unlinked",
};

const productsIntentZh = {
  addendSuffix: " + {{addend}}",
  applyOneClick: "一键应用",
  collapseAnalysis: "收起",
  compareCandidates: "为什么推荐这个货源",
  completed: "已完成",
  configurePricing: "配置定价",
  configurePricingHint:
    "配置目标币种、汇率与倍率后，主区建议售价才会按你的规则计算。",
  currentFilters: "尚未应用额外筛选。",
  currentPriority: "当前优先",
  currentProduct: "当前商品",
  discoverNew: "发现新品",
  expandAnalysis: "展开",
  explainMatchReason: "解释匹配原因",
  explainMatchRisk: "匹配不确定点",
  filterSuggestions: "筛选建议",
  findMoreCandidates: "为这个商品找更多候选",
  fxToTarget: "汇率 → 目标币",
  imageSearchHint: "建议图搜",
  locatePendingList: "定位待确认列表",
  locateUnboundList: "定位未匹配列表",
  matched: "已匹配",
  matchedCount: "{{matched}} / {{analyzed}}",
  multiplierAddend: "倍率 · 加价",
  noCategoryPresets: "暂无类目预设",
  noExtraFilters: "尚未应用额外筛选。",
  noPendingProducts: "暂无待确认商品",
  noRecommendedCategories: "暂无推荐类目",
  noUnboundProducts: "暂无未匹配商品",
  noUnlinkedProducts: "重搜全部未匹配",
  notConfigured: "未配置",
  openDiscover: "打开发现新品",
  openDiscoverLabel: "打开发现新品",
  openImageSearch: "重搜候选",
  openPricingDrawer: "打开定价侧栏",
  pending: "待确认",
  pendingProducts: "待确认商品",
  pricing: "定价",
  pricingActive: "定价已生效",
  pricingAfterConfig: "保存后建议售价会按规则更新。",
  pricingChain: "定价因果链",
  pricingLine: "{{currency}} · 汇率 {{rate}} · ×{{multiplier}}",
  pricingNotConfigured: "尚未配置定价",
  pricingReady: "定价已就绪",
  profitPerOrder: "每单获利",
  purchaseAligned: " · 采购价展示已对齐",
  purchaseCost: "采购价",
  purchaseCostRmb: "采购价（人民币）",
  purchaseDisplay: "采购价展示",
  rerunAllUnbound: "重搜全部未匹配",
  rerunCandidates: "重搜候选",
  rerunUnboundCount: "重搜 {{count}} 个未匹配",
  rerunUnboundHint: "对未匹配商品重新图搜",
  searchFirstItem: "为第一个商品重搜候选",
  selectProductFirst: "请先在列表中点选商品",
  selectProductHint: "请先在列表中点选商品",
  shopStatus: "店铺状态",
  statusDetails: "状态详情",
  task: "任务",
  unbound: "未匹配",
  unboundProducts: "未匹配商品",
  usePriorityCard: "使用右侧优先任务卡",
  viewAdjustPricing: "查看 / 调整定价",
  viewPending: "看待确认",
  viewPendingLabel: "看待确认",
  viewUnboundLabel: "看未匹配",
};

function frCommandUi(en) {
  return {
    ...en,
    afterLabel: "Après · {{label}}",
    allVariantsUnified: "Toutes les variantes → même prix",
    autoApplyIn: "Application auto dans {{seconds}} s",
    batchFailed: "{{count}} échec(s)",
    batchSuccess: "{{count}} ok",
    beforeLabel: "Avant · {{label}}",
    colAfter: "Après",
    colCurrentPrice: "Actuel",
    colVariant: "Variante",
    confirmExecute: "Confirmer",
    confirmHeader: "Confirmer la commande",
    confirmModify: "Confirmer la modification",
    detail: "Détails",
    empty: "(vide)",
    execute: "Exécuter",
    executing: "En cours…",
    generatingPreview: "Génération de l'aperçu…",
    hintAmbiguous:
      "Plusieurs variantes correspondent à « {{hint}} » : {{matches}} — choisissez ci-dessous",
    hintPreselected: "Correspondance « {{hint}} » → {{label}}",
    impactConfirm: "Impact",
    impactDuration: "Durée estimée : {{duration}}",
    impactIrreversible: "✗ Difficile à annuler",
    impactReversible: "✓ Réversible (annulation manuelle possible)",
    impactScope: "Portée : {{scope}}",
    loadingVariants: "Chargement des variantes…",
    multiVariantHint: "{{count}} variantes — choisissez la portée :",
    newPrice: "Nouveau prix",
    noVariants: "Aucune variante trouvée",
    preparing: "Préparation du lot…",
    selectScopeHint: "Sélectionnez une variante ou appliquez à toutes",
    singleVariantOnly: "Cette variante seulement",
    singleVariantSummary: "{{current}} → {{next}}",
    stepApplying: "Application…",
    stepBatchRunning: "Lot en cours…",
    stepDone: "Terminé",
    stepError: "Erreur",
    stepExecuting: "En cours…",
    stepPreviewReady: "Aperçu prêt",
    target: "Cible : {{label}}",
    targetLabel: "Cible",
  };
}

function esCommandUi(en) {
  return {
    ...en,
    afterLabel: "Después · {{label}}",
    allVariantsUnified: "Todas las variantes → mismo precio",
    autoApplyIn: "Auto-aplicar en {{seconds}} s",
    batchFailed: "{{count}} fallidos",
    batchSuccess: "{{count}} ok",
    beforeLabel: "Antes · {{label}}",
    colAfter: "Después",
    colCurrentPrice: "Actual",
    colVariant: "Variante",
    confirmExecute: "Confirmar",
    confirmHeader: "Confirmar comando",
    confirmModify: "Confirmar cambio",
    detail: "Detalles",
    empty: "(vacío)",
    execute: "Ejecutar",
    executing: "Ejecutando…",
    generatingPreview: "Generando vista previa…",
    hintAmbiguous:
      "Varias variantes coinciden con « {{hint}} »: {{matches}} — elija abajo",
    hintPreselected: "Coincidencia « {{hint}} » → {{label}}",
    impactConfirm: "Impacto",
    impactDuration: "Duración est.: {{duration}}",
    impactIrreversible: "✗ No se revierte fácilmente",
    impactReversible: "✓ Reversible (se puede deshacer manualmente)",
    impactScope: "Alcance: {{scope}}",
    loadingVariants: "Cargando variantes…",
    multiVariantHint: "{{count}} variantes — elija alcance:",
    newPrice: "Nuevo precio",
    noVariants: "No se encontraron variantes",
    preparing: "Preparando lote…",
    selectScopeHint: "Seleccione una variante o aplique a todas",
    singleVariantOnly: "Solo esta variante",
    singleVariantSummary: "{{current}} → {{next}}",
    stepApplying: "Aplicando…",
    stepBatchRunning: "Lote en ejecución…",
    stepDone: "Listo",
    stepError: "Error",
    stepExecuting: "Ejecutando…",
    stepPreviewReady: "Vista previa lista",
    target: "Objetivo: {{label}}",
    targetLabel: "Objetivo",
  };
}

function frProductsAiTask(en) {
  return {
    ...en,
    titleReady: "Analyse de la boutique terminée",
    titleRunning: "Analyse des produits de la boutique…",
    summaryReady:
      "{{analyzed}} produits analysés · {{matched}} associés · {{pending}} en attente de confirmation",
    summaryRunning: "Synchronisation des produits et association des sources…",
    pctMatched: "{{pct}} % associés",
    reading: "Lecture de la boutique…",
    sourcesReady: " · toutes les sources prêtes",
    confirmed: "Confirmés {{count}}",
    unbound: "Non liés {{count}}",
    refreshTitle: "Relancer l'analyse",
    refreshAria:
      "Relancer l'analyse (sync produits et association auto des sources)",
  };
}

function esProductsAiTask(en) {
  return {
    ...en,
    titleReady: "Análisis de la tienda completado",
    titleRunning: "Analizando productos de la tienda…",
    summaryReady:
      "{{analyzed}} productos analizados · {{matched}} vinculados · {{pending}} pendientes de confirmación",
    summaryRunning: "Sincronizando productos y asociando fuentes…",
    pctMatched: "{{pct}} % vinculados",
    reading: "Leyendo tienda…",
    sourcesReady: " · todas las fuentes listas",
    confirmed: "Confirmados {{count}}",
    unbound: "Sin vincular {{count}}",
    refreshTitle: "Re-ejecutar análisis",
    refreshAria:
      "Re-ejecutar análisis (sync productos y auto-asociación de fuentes)",
  };
}

function frProductsIntent(en) {
  return {
    ...en,
    applyOneClick: "Appliquer en un clic",
    collapseAnalysis: "Réduire",
    compareCandidates: "Pourquoi cette source ?",
    completed: "Terminé",
    configurePricing: "Configurer les prix",
    configurePricingHint:
      "Définissez devise, taux de change et multiplicateur pour que les prix suggérés suivent vos règles.",
    currentFilters: "Aucun filtre supplémentaire appliqué.",
    currentPriority: "Priorité actuelle",
    currentProduct: "Produit actuel",
    discoverNew: "Découvrir de nouveaux produits",
    expandAnalysis: "Développer",
    explainMatchReason: "Expliquer la raison de correspondance",
    explainMatchRisk: "Points d'incertitude",
    filterSuggestions: "Suggestions de filtres",
    findMoreCandidates: "Trouver plus de candidats",
    fxToTarget: "Taux → devise cible",
    imageSearchHint: "Essayer la recherche d'image",
    locatePendingList: "Localiser la liste en attente",
    locateUnboundList: "Localiser la liste non liée",
    matched: "Associés",
    multiplierAddend: "Multiplicateur · addend",
    noCategoryPresets: "Aucun préréglage de catégorie",
    noExtraFilters: "Aucun filtre supplémentaire appliqué.",
    noPendingProducts: "Aucun produit en attente",
    noRecommendedCategories: "Aucune catégorie recommandée",
    noUnboundProducts: "Aucun produit non lié",
    noUnlinkedProducts: "Re-rechercher tous les non liés",
    notConfigured: "Non configuré",
    openDiscover: "Ouvrir la découverte",
    openDiscoverLabel: "Ouvrir la découverte",
    openImageSearch: "Rechercher des candidats",
    openPricingDrawer: "Ouvrir les prix",
    pending: "En attente",
    pendingProducts: "Produits en attente",
    pricing: "Prix",
    pricingActive: "Tarification active",
    pricingAfterConfig: "Les prix suggérés se mettent à jour après enregistrement.",
    pricingChain: "Chaîne de tarification",
    pricingLine: "{{currency}} · taux {{rate}} · ×{{multiplier}}",
    pricingNotConfigured: "Tarification pas encore configurée",
    pricingReady: "Tarification prête",
    profitPerOrder: "Profit / commande",
    purchaseAligned: " · affichage achat aligné",
    purchaseCost: "Coût d'achat",
    purchaseCostRmb: "Coût d'achat (CNY)",
    purchaseDisplay: "Affichage achat",
    rerunAllUnbound: "Re-rechercher tous les non liés",
    rerunCandidates: "Re-rechercher candidats",
    rerunUnboundCount: "Re-rechercher {{count}} non liés",
    rerunUnboundHint: "Relancer la recherche d'image pour les produits non liés",
    searchFirstItem: "Rechercher des candidats pour le premier article",
    selectProductFirst: "Sélectionnez d'abord un produit",
    selectProductHint: "Sélectionnez d'abord un produit",
    shopStatus: "Statut boutique",
    statusDetails: "Détails du statut",
    task: "Tâche",
    unbound: "Non liés",
    unboundProducts: "Produits non liés",
    usePriorityCard: "Utiliser la carte de priorité",
    viewAdjustPricing: "Voir / ajuster les prix",
    viewPending: "Voir en attente",
    viewPendingLabel: "Voir en attente",
    viewUnboundLabel: "Voir non liés",
  };
}

function esProductsIntent(en) {
  return {
    ...en,
    applyOneClick: "Aplicar en un clic",
    collapseAnalysis: "Contraer",
    compareCandidates: "¿Por qué esta fuente?",
    completed: "Hecho",
    configurePricing: "Configurar precios",
    configurePricingHint:
      "Configure moneda, tasa de cambio y multiplicador para que los precios sugeridos sigan sus reglas.",
    currentFilters: "Sin filtros extra aplicados.",
    currentPriority: "Prioridad actual",
    currentProduct: "Producto actual",
    discoverNew: "Descubrir nuevos productos",
    expandAnalysis: "Expandir",
    explainMatchReason: "Explicar razón de coincidencia",
    explainMatchRisk: "Puntos de incertidumbre",
    filterSuggestions: "Sugerencias de filtros",
    findMoreCandidates: "Encontrar más candidatos",
    fxToTarget: "Tasa → moneda objetivo",
    imageSearchHint: "Probar búsqueda por imagen",
    locatePendingList: "Localizar lista pendiente",
    locateUnboundList: "Localizar lista sin vincular",
    matched: "Vinculados",
    multiplierAddend: "Multiplicador · addend",
    noCategoryPresets: "Sin presets de categoría",
    noExtraFilters: "Sin filtros extra aplicados.",
    noPendingProducts: "Sin productos pendientes",
    noRecommendedCategories: "Sin categorías recomendadas",
    noUnboundProducts: "Sin productos sin vincular",
    noUnlinkedProducts: "Re-buscar todos sin vincular",
    notConfigured: "No configurado",
    openDiscover: "Abrir descubrimiento",
    openDiscoverLabel: "Abrir descubrimiento",
    openImageSearch: "Buscar candidatos",
    openPricingDrawer: "Abrir precios",
    pending: "Pendiente",
    pendingProducts: "Productos pendientes",
    pricing: "Precios",
    pricingActive: "Tarificación activa",
    pricingAfterConfig: "Los precios sugeridos se actualizan al guardar.",
    pricingChain: "Cadena de tarificación",
    pricingLine: "{{currency}} · tasa {{rate}} · ×{{multiplier}}",
    pricingNotConfigured: "Tarificación aún no configurada",
    pricingReady: "Tarificación lista",
    profitPerOrder: "Beneficio / pedido",
    purchaseAligned: " · visualización compra alineada",
    purchaseCost: "Costo de compra",
    purchaseCostRmb: "Costo de compra (CNY)",
    purchaseDisplay: "Visualización compra",
    rerunAllUnbound: "Re-buscar todos sin vincular",
    rerunCandidates: "Re-buscar candidatos",
    rerunUnboundCount: "Re-buscar {{count}} sin vincular",
    rerunUnboundHint: "Re-ejecutar búsqueda por imagen para productos sin vincular",
    searchFirstItem: "Buscar candidatos para el primer artículo",
    selectProductFirst: "Seleccione primero un producto",
    selectProductHint: "Seleccione primero un producto",
    shopStatus: "Estado de la tienda",
    statusDetails: "Detalles del estado",
    task: "Tarea",
    unbound: "Sin vincular",
    unboundProducts: "Productos sin vincular",
    usePriorityCard: "Usar la tarjeta de prioridad",
    viewAdjustPricing: "Ver / ajustar precios",
    viewPending: "Ver pendientes",
    viewPendingLabel: "Ver pendientes",
    viewUnboundLabel: "Ver sin vincular",
  };
}

const blocks = {
  en: {
    commandUi: commandUiEn,
    productsAiTask: productsAiTaskEn,
    productsIntent: productsIntentEn,
  },
  zh: {
    commandUi: commandUiZh,
    productsAiTask: productsAiTaskZh,
    productsIntent: productsIntentZh,
  },
  fr: {
    commandUi: frCommandUi(commandUiEn),
    productsAiTask: frProductsAiTask(productsAiTaskEn),
    productsIntent: frProductsIntent(productsIntentEn),
  },
  es: {
    commandUi: esCommandUi(commandUiEn),
    productsAiTask: esProductsAiTask(productsAiTaskEn),
    productsIntent: esProductsIntent(productsIntentEn),
  },
};

const BLOCK_NAMES = ["commandUi", "productsAiTask", "productsIntent"];

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
