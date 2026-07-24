"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { FadeSwap } from "@/components/ui/fade-swap";
import type { LogisticsCommandPlan } from "@/lib/agents/logistics/command-schema";
import { codesFromSelections } from "@/components/logistics/market-multi-select";
import { useOnboarding } from "@/context/onboarding-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { useLogisticsIncrementalPipeline } from "@/hooks/use-logistics-incremental-pipeline";
import { hasSavedLogisticsTemplate } from "@/lib/logistics/incremental-pipeline";
import { api, readableError, type LogisticsAcceptDecisionRequest, type LogisticsEstimateResult } from "@/lib/api";
import type { LogisticsFilterMode, PostalLimitFilter } from "@/lib/logistics/display";
import {
  coerceLogisticsFilterMode,
  normalizeLogisticsFilterMode,
} from "@/lib/logistics/display";
import {
  buildEstimateParams,
  listTemplateCountryCodes,
  packagingToIncrementList,
  resolveQuoteMarketCode,
} from "@/lib/logistics/template-params";
import { resolveTangbuyCountryId } from "@/lib/logistics/tangbuy-country";
import {
  evaluateLogisticsCompletionGate,
  deriveLogisticsStepSnapshot,
  type CompletionGateResult,
} from "@/lib/logistics/completion-gate";
import { stashLogisticsSyncExceptionCount } from "@/lib/logistics/sync-handoff";
import {
  collectBatchAcceptableVariants,
  collectProductQuotableVariantIds,
  buildAcceptQuotePayload,
} from "@/lib/logistics/display";
import { deriveLogisticsWorkbenchState } from "@/lib/logistics/workbench-state";
import {
  mergeQuoteResultsIntoAnalysis,
  readQuoteCache,
  writeQuoteCache,
} from "@/lib/logistics/quote-cache";
import { enrichVariantsWithMeasures } from "@/lib/logistics/variant-measures";
import { GOODS_INGESTING_MESSAGE } from "@/lib/logistics/estimate-goods-block";
import { enrichVariantsWithEstimateGoodsIds } from "@/lib/logistics/resolve-estimate-goods-id";
import { quoteStatusForGoodsBlock } from "@/lib/logistics/estimate-goods-block";
import { countCatalogIngestingProducts } from "@/lib/tangbuy/catalog-ingest-display";
import { isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";
import { aggregateDecisionCounts } from "@/lib/logistics/decision-engine";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsTemplate,
  LogisticsTypeCode,
  PricingTemplate,
  VariantLogisticsDecision,
} from "@/lib/types";
import type { LogisticsFocusTarget, MeasureOverride } from "@/components/logistics/logistics-decision-list";
import type { LogisticsWorkflowStep } from "@/components/logistics/logistics-workflow-steps";

const LogisticsAgentPanel = dynamic(() => import("@/components/logistics/logistics-agent-panel").then((m) => ({ default: m.LogisticsAgentPanel })), { ssr: false });
const LogisticsTemplateSetupCard = dynamic(() => import("@/components/logistics/logistics-template-setup-card").then((m) => ({ default: m.LogisticsTemplateSetupCard })), { ssr: false });
const LogisticsDecisionList = dynamic(() => import("@/components/logistics/logistics-decision-list").then((m) => ({ default: m.LogisticsDecisionList })), { ssr: false });
const LogisticsPlanStatusCard = dynamic(() => import("@/components/logistics/logistics-plan-status-card").then((m) => ({ default: m.LogisticsPlanStatusCard })), { ssr: false });
const LogisticsSyncConfirmCard = dynamic(() => import("@/components/logistics/logistics-sync-confirm-card").then((m) => ({ default: m.LogisticsSyncConfirmCard })), { ssr: false });
const LogisticsTemplateDrawer = dynamic(() => import("@/components/logistics/logistics-template-drawer").then((m) => ({ default: m.LogisticsTemplateDrawer })), { ssr: false });
const LogisticsWorkflowSteps = dynamic(() => import("@/components/logistics/logistics-workflow-steps").then((m) => ({ default: m.LogisticsWorkflowSteps })), { ssr: false });
const LogisticsClassifyStage = dynamic(() => import("@/components/logistics/logistics-classify-stage").then((m) => ({ default: m.LogisticsClassifyStage })), { ssr: false });

import { deriveLogisticsWorkflowStep } from "@/components/logistics/logistics-workflow-steps";

const DEFAULT_TEMPLATE = (shopName: string, name = "Default template"): LogisticsTemplate => ({
  id: "default",
  shopName,
  name,
  packaging: "MINIMAL",
  speedPreference: "BALANCED",
  markets: [{ marketGroupId: "north_america", countryCodes: ["US"] }],
  isActive: true,
});

function LogisticsContent() {
  const router = useRouter();
  const { shop, isAuthorized, authSessionReady, saveLogistics, showToast, skuReadyForNext, workflowSku, logisticsCompleted, publishLogisticsStepSnapshot, publishLogisticsPipelineActive } =
    useOnboarding();
  const shopName = shop.name?.trim() || shop.domain?.trim() || "";
  const wb = useWorkbenchPage("logistics");
  const t = useT();
  const locale = useLocale();

  const breadcrumbs = [
    { label: t("nav.workbench"), href: localePath(locale, "/") },
    { label: t("sku.breadcrumb"), href: localePath(locale, "/sku-align") },
    { label: t("nav.logistics") },
  ];

  const [analysis, setAnalysis] = useState<LogisticsAnalysis | null>(null);
  const [templates, setTemplates] = useState<LogisticsTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<LogisticsTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [filterMode, setFilterMode] = useState<LogisticsFilterMode>("all");
  const [workflowStep, setWorkflowStep] = useState<LogisticsWorkflowStep>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const step = params.get("step") as LogisticsWorkflowStep;
      if (step === "setup" || step === "estimate" || step === "confirm") {
        return step;
      }
    }
    return "setup";
  });

  useEffect(() => {
    router.replace(`/logistics?step=${workflowStep}`, { scroll: false });
  }, [workflowStep, router]);
  const [postalLimitFilter, setPostalLimitFilter] = useState<PostalLimitFilter>("all");
  const [quoteResults, setQuoteResults] = useState<
    Map<string, LogisticsEstimateResult>
  >(new Map());
  const [quoting, setQuoting] = useState(false);
  const [quotingProductId, setQuotingProductId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [batchFailedVariantIds, setBatchFailedVariantIds] = useState<string[]>([]);
  const [focusTarget, setFocusTarget] = useState<LogisticsFocusTarget | null>(
    null
  );
  const [quoteMarketCode, setQuoteMarketCode] = useState<string | null>(null);
  const [pricingTemplate, setPricingTemplate] = useState<PricingTemplate | null>(null);
  const [measureOverrides, setMeasureOverrides] = useState<Map<string, MeasureOverride>>(
    new Map()
  );
  const [selectedLineByVariant, setSelectedLineByVariant] = useState<
    Map<string, string>
  >(new Map());
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const batchAcceptCancelRef = useRef(false);
  const logisticsListRef = useRef<HTMLDivElement>(null);

  const scrollToLogisticsList = useCallback(() => {
    requestAnimationFrame(() => {
      logisticsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const handleSelectLine = useCallback((variantId: string, lineKey: string) => {
    setSelectedLineByVariant((prev) => {
      const next = new Map(prev);
      next.set(variantId, lineKey);
      return next;
    });
  }, []);

  const handleViewPendingConfirm = useCallback(() => {
    setFilterMode("pending");
    setFocusTarget(null);
    scrollToLogisticsList();
  }, [scrollToLogisticsList]);

  const handleViewExceptions = useCallback(() => {
    setFilterMode("needs_attention");
    setFocusTarget(null);
    scrollToLogisticsList();
  }, [scrollToLogisticsList]);

  const workbench = useMemo(
    () => deriveLogisticsWorkbenchState(analysis, quoteResults),
    [analysis, quoteResults]
  );
  const planMetrics = workbench.metrics;

  const catalogIngestingCount = useMemo(() => {
    if (!analysis || !shopName) return 0;
    const variantsByProduct = new Map<string, VariantLogisticsDecision[]>();
    for (const profile of analysis.productProfiles ?? []) {
      variantsByProduct.set(
        profile.thirdPlatformItemId,
        profile.variantDecisions ?? []
      );
    }
    return countCatalogIngestingProducts({
      shopName,
      productIds: (analysis.productProfiles ?? []).map(
        (profile) => profile.thirdPlatformItemId
      ),
      variantsByProduct,
      quoteResults,
    });
  }, [analysis, shopName, quoteResults]);

  const hasSavedTemplate = hasSavedLogisticsTemplate(templates);

  const templateScopeKey = useMemo(() => {
    if (!activeTemplate) return "";
    return [
      activeTemplate.id,
      activeTemplate.packaging,
      activeTemplate.speedPreference,
      JSON.stringify(activeTemplate.markets ?? []),
    ].join("|");
  }, [activeTemplate]);

  const prevScopeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setQuoteMarketCode(resolveQuoteMarketCode(activeTemplate, null));
    if (!shopName || !templateScopeKey) {
      setQuoteResults(new Map());
      prevScopeKeyRef.current = templateScopeKey || null;
      return;
    }

    // 仅当模板维度真正变化（非首次装载）时，把基于旧模板的已确认 SKU
    // 回退为待确认，避免 completion-gate 被旧确认误导。
    // 限制：accept 文件按 shop 全局存储，刷新后服务端会重新合并全局确认；
    // 彻底按模板区分需改造 accept 存储（更大改动），此处覆盖会话内切换场景。
    if (prevScopeKeyRef.current && prevScopeKeyRef.current !== templateScopeKey) {
      setAnalysis((prev) => {
        if (!prev) return prev;
        const productProfiles = (prev.productProfiles ?? []).map((product) => {
          const variantDecisions = (product.variantDecisions ?? []).map((v) =>
            v.decisionConfirmed || v.decisionStatus === "confirmed"
              ? {
                  ...v,
                  decisionStatus: "ready_for_quote" as const,
                  decisionConfirmed: false,
                  decisionReason: undefined,
                }
              : v
          );
          return {
            ...product,
            variantDecisions,
            decisionStatusCounts: aggregateDecisionCounts(variantDecisions),
          };
        });
        return { ...prev, productProfiles };
      });
      showToast(t("logistics.templateSwitchResetConfirm"));
    }
    prevScopeKeyRef.current = templateScopeKey;

    const cached = readQuoteCache(shopName, templateScopeKey);
    setQuoteResults(cached);
    if (cached.size > 0) {
      setAnalysis((prev) =>
        prev ? mergeQuoteResultsIntoAnalysis(prev, cached) : prev
      );
    }
  }, [templateScopeKey, shopName, activeTemplate, showToast, t]);

  // measureOverrides 持久化：重量/尺寸是物理属性，与模板无关，按 shop 维度存储。
  useEffect(() => {
    if (shopName) setMeasureOverrides(readMeasureOverrides(shopName));
  }, [shopName]);

  useEffect(() => {
    if (shopName) writeMeasureOverrides(shopName, measureOverrides);
  }, [shopName, measureOverrides]);

  const load = useCallback(
    async (forceClassify: boolean) => {
      setLoading(true);
      setError(null);
      try {
        setClassifying(true);
        const [a, ts, pt] = await Promise.all([
          forceClassify
            ? api.analyzeLogistics(shopName, true)
            : api.analyzeLogistics(shopName, false),
          api.listLogisticsTemplates(shopName),
          api.getPricingTemplate(shopName),
        ]);
        setAnalysis(a);
        setTemplates(ts);
        setPricingTemplate(pt);
        if (ts.length > 0) {
          setActiveTemplate(ts[0]);
        } else {
          setActiveTemplate(DEFAULT_TEMPLATE(shopName, t("logistics.defaultTemplateName")));
        }
      } catch (err) {
        setError(readableError(err));
        const ts = await api.listLogisticsTemplates(shopName).catch(() => []);
        setTemplates(ts);
        setActiveTemplate(ts.length > 0 ? ts[0] : DEFAULT_TEMPLATE(shopName, t("logistics.defaultTemplateName")));
      } finally {
        setClassifying(false);
        setLoading(false);
      }
    },
    [shopName]
  );

  useEffect(() => {
    if (!isAuthorized) return;
    void load(false);
  }, [isAuthorized, load]);

  const handleCorrect = async (itemId: string, type: LogisticsTypeCode) => {
    if (correctingId) return;
    setCorrectingId(itemId);
    try {
      const updated = await api.correctLogisticsType(shopName, itemId, type);
      setAnalysis((prev) => {
        if (!prev) return prev;
        const productProfiles = prev.productProfiles.map((p) =>
          p.thirdPlatformItemId === itemId ? updated : p
        );

        const totalVariants = productProfiles.reduce(
          (sum, p) => sum + p.totalVariants,
          0
        );
        const decisionStatusCounts: Record<LogisticsDecisionStatus, number> = {
          pending_sku: 0,
          pending_postal_meta: 0,
          ready_for_quote: 0,
          confirmed: 0,
          restricted: 0,
          needs_review: 0,
        };
        for (const p of productProfiles) {
          for (const [status, count] of Object.entries(p.decisionStatusCounts)) {
            decisionStatusCounts[status as LogisticsDecisionStatus] += count;
          }
        }

        const highRiskTypes = productProfiles
          .map((p) => p.dominantLogisticsType)
          .filter(
            (t, i, arr) =>
              (t === "BATTERY_MAGNETIC" || t === "FOOD" || t === "BLADE") &&
              arr.indexOf(t) === i
          );

        return {
          ...prev,
          productProfiles,
          totalVariants,
          decisionStatusCounts,
          highRiskTypes,
        };
      });
      showToast(t("logistics.toastTypeCorrected"));
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setCorrectingId(null);
    }
  };

  const handleSaveTemplate = async (
    upsertData: {
      shopName: string;
      name?: string;
      packaging: string;
      speedPreference: string;
      markets: { marketGroupId: string; countryCodes: string[] }[];
    },
    id?: string
  ) => {
    setSaving(true);
    try {
      const saved = await api.upsertLogisticsTemplate(shopName, upsertData as any, id);
      setTemplates((prev) => {
        if (id) {
          return prev.map((t) => (t.id === id ? saved : t));
        }
        return [saved, ...prev];
      });
      setActiveTemplate(saved);
      showToast(t("logistics.toastTemplateSaved"));
      setWorkflowStep("estimate");
      return saved;
    } catch (err) {
      showToast(readableError(err));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await api.deleteLogisticsTemplate(shopName, id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (activeTemplate?.id === id) {
        const remaining = templates.filter((t) => t.id !== id);
        setActiveTemplate(
          remaining.length > 0 ? remaining[0] : DEFAULT_TEMPLATE(shopName, t("logistics.defaultTemplateName"))
        );
      }
      showToast(t("logistics.toastTemplateDeleted"));
    } catch (err) {
      showToast(readableError(err));
    }
  };

  const handleSelectTemplate = (template: LogisticsTemplate) => {
    setActiveTemplate(template);
    setQuoteMarketCode(resolveQuoteMarketCode(template, null));
  };

  const handleSave = async (goSync = false, syncExceptionCount?: number) => {
    if (!activeTemplate || saving) return;
    const codes = codesFromSelections(activeTemplate.markets);
    if (codes.length === 0) {
      showToast(t("logistics.toastPickMarket"));
      return;
    }
    setSaving(true);
    try {
      saveLogistics();
      if (goSync) {
        if (syncExceptionCount && syncExceptionCount > 0) {
          stashLogisticsSyncExceptionCount(syncExceptionCount);
        }
        router.push("/sync");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndSync = () => {
    if (completionGate.tier === "blocked") {
      showToast(completionGate.blockers[0] ?? t("logistics.toastHandleBlocker"));
      return;
    }
    if (completionGate.tier === "confirm") {
      setShowSyncConfirm(true);
      return;
    }
    void handleSave(true);
  };

  const collectQuotableVariants = useCallback(
    (
      overrides: Map<string, MeasureOverride> = measureOverrides,
      opts?: { includeExceptions?: boolean }
    ) => {
    const incrementList = packagingToIncrementList(activeTemplate?.packaging);
    const quotableStatuses: VariantLogisticsDecision["decisionStatus"][] =
      opts?.includeExceptions
        ? [
            "ready_for_quote",
            "confirmed",
            "needs_review",
            "restricted",
            "pending_postal_meta",
          ]
        : ["ready_for_quote", "confirmed"];
    const variants: Array<{
      thirdPlatformSkuId: string;
      thirdPlatformItemId: string;
      tangbuySkuId: string;
      tangbuyGoodsId: string;
      titleHint?: string;
      incrementList: string[];
      quantity: number;
      detailUrl?: string;
      weightG?: number;
      lengthCm?: number;
      widthCm?: number;
      heightCm?: number;
      postalLimitClass?: string;
      decisionStatus: VariantLogisticsDecision["decisionStatus"];
    }> = [];
    for (const p of analysis?.productProfiles ?? []) {
      for (const v of p.variantDecisions ?? []) {
        if (
          quotableStatuses.includes(v.decisionStatus) &&
          v.tangbuySkuId &&
          v.tangbuyGoodsId
        ) {
          const override = overrides.get(v.thirdPlatformSkuId);
          variants.push({
            thirdPlatformSkuId: v.thirdPlatformSkuId,
            thirdPlatformItemId: p.thirdPlatformItemId,
            tangbuySkuId: v.tangbuySkuId,
            tangbuyGoodsId: v.tangbuyGoodsId,
            titleHint: p.title ?? undefined,
            incrementList,
            quantity: 1,
            detailUrl: p.detailUrl ?? undefined,
            weightG: override?.weightG ?? v.estimatedWeightG ?? undefined,
            lengthCm: override?.lengthCm ?? v.estimatedLengthCm ?? undefined,
            widthCm: override?.widthCm ?? v.estimatedWidthCm ?? undefined,
            heightCm: override?.heightCm ?? v.estimatedHeightCm ?? undefined,
            postalLimitClass: v.postalLimitClass ?? undefined,
            decisionStatus: v.decisionStatus,
          });
        }
      }
    }
    return variants;
  },
    [activeTemplate?.packaging, analysis?.productProfiles, measureOverrides]
  );

  const collectReadyVariants = useCallback(() => {
    return collectQuotableVariants().filter(
      (variant) => variant.decisionStatus === "ready_for_quote"
    );
  }, [collectQuotableVariants]);

  const fetchQuotesForVariants = useCallback(
    async (
      variantIds?: string[],
      overrides?: Map<string, MeasureOverride> | AbortSignal,
      opts?: { includeExceptions?: boolean; signal?: AbortSignal }
    ) => {
      const signal =
        overrides instanceof AbortSignal
          ? overrides
          : opts?.signal;
      const overrideMap =
        overrides instanceof AbortSignal ? measureOverrides : (overrides ?? measureOverrides);
      const includeExceptions =
        overrides instanceof AbortSignal
          ? opts?.includeExceptions
          : opts?.includeExceptions;

      if (signal?.aborted) return null;

      const all = collectQuotableVariants(overrideMap, {
        includeExceptions,
      });
      const targets = variantIds?.length
        ? all.filter((v) => variantIds.includes(v.thirdPlatformSkuId))
        : all;
      if (targets.length === 0) return new Map<string, LogisticsEstimateResult>();

      if (signal?.aborted) return null;

      const marketCode = resolveQuoteMarketCode(activeTemplate, quoteMarketCode);
      if (!marketCode) {
        showToast(t("logistics.toastConfigMarket"));
        return null;
      }
      const countryId = await resolveTangbuyCountryId(marketCode);
      const params = buildEstimateParams(activeTemplate, quoteMarketCode, countryId);
      if (!params) {
        showToast(
          t("logistics.toastCountryIdMissing", { market: marketCode })
        );
        return null;
      }

      const payloadVariants = targets.map(
        ({ decisionStatus: _status, ...variant }) => ({ ...variant })
      );
      await enrichVariantsWithMeasures(payloadVariants);
      if (signal?.aborted) return null;
      const resolvedVariants = await enrichVariantsWithEstimateGoodsIds(
        payloadVariants,
        shopName
      );
      if (signal?.aborted) return null;

      setAnalysis((prev) => {
        if (!prev) return prev;
        const bySku = new Map(
          resolvedVariants.map((v) => [v.thirdPlatformSkuId, v] as const)
        );
        return {
          ...prev,
          productProfiles: (prev.productProfiles ?? []).map((product) => ({
            ...product,
            variantDecisions: (product.variantDecisions ?? []).map((variant) => {
              const enriched = bySku.get(variant.thirdPlatformSkuId);
              if (!enriched) return variant;
              return {
                ...variant,
                estimatedWeightG: enriched.weightG ?? variant.estimatedWeightG,
                estimatedLengthCm: enriched.lengthCm ?? variant.estimatedLengthCm,
                estimatedWidthCm: enriched.widthCm ?? variant.estimatedWidthCm,
                estimatedHeightCm: enriched.heightCm ?? variant.estimatedHeightCm,
                measureSource:
                  enriched.weightG || enriched.lengthCm
                    ? "itemGet"
                    : variant.measureSource,
              };
            }),
          })),
        };
      });

      const quotableVariants = resolvedVariants.filter((v) => v.estimateGoodsId);
      const unresolvedVariants = resolvedVariants.filter((v) => v.estimateGoodsError);
      const resultsMap = new Map<string, LogisticsEstimateResult>();

      for (const unresolved of unresolvedVariants) {
        const blockReason = unresolved.estimateBlockReason ?? "unresolved_offer";
        resultsMap.set(unresolved.thirdPlatformSkuId, {
          thirdPlatformSkuId: unresolved.thirdPlatformSkuId,
          quoteStatus: quoteStatusForGoodsBlock(blockReason),
          errorMessage: unresolved.estimateGoodsError,
        });
      }

      if (quotableVariants.length > 0) {
        const response = await api.estimateLogistics(
          {
            shopName,
            countryCode: params.countryCode,
            countryId: params.countryId,
            shippingOption: params.shippingOption,
            packaging: params.packaging,
            quoteCurrency: pricingTemplate?.targetCurrency?.trim().toUpperCase() || "USD",
            variants: quotableVariants.map(
              ({
                estimateGoodsId,
                estimateGoodsError: _err,
                titleHint: _title,
                thirdPlatformItemId: _itemId,
                sourceIdentity: _identity,
                ...variant
              }) => ({
                ...variant,
                tangbuyGoodsId: estimateGoodsId ?? variant.tangbuyGoodsId,
              })
            ),
            needOtherLine: true,
            needMeasure: quotableVariants.some(
              (v) =>
                v.weightG == null ||
                v.lengthCm == null ||
                v.widthCm == null ||
                v.heightCm == null
            ),
          },
          signal
        );
        for (const r of response.results) {
          resultsMap.set(r.thirdPlatformSkuId, r);
        }
      }
      setQuoteResults((prev) => {
        const next = new Map(prev);
        for (const [skuId, result] of resultsMap) {
          next.set(skuId, result);
        }
        if (shopName && templateScopeKey) {
          writeQuoteCache(shopName, templateScopeKey, next);
        }
        return next;
      });
      setAnalysis((prev) =>
        prev ? mergeQuoteResultsIntoAnalysis(prev, resultsMap) : prev
      );

      const confirmedQuotes: NonNullable<
        LogisticsAcceptDecisionRequest["quotes"]
      > = {};
      for (const target of targets) {
        if (target.decisionStatus !== "confirmed") continue;
        const result = resultsMap.get(target.thirdPlatformSkuId);
        if (!result?.recommendedLine) continue;
        confirmedQuotes[target.thirdPlatformSkuId] = {
          recommendedLine: result.recommendedLine,
          alternativeLines: result.alternativeLines,
          quoteStatus: result.quoteStatus,
        };
      }
      if (Object.keys(confirmedQuotes).length > 0) {
        const patched = await api.patchLogisticsQuotes({
          shopName,
          quotes: confirmedQuotes,
        });
        setAnalysis(patched.analysis);
      }

      return resultsMap;
    },
    [
      activeTemplate,
      collectQuotableVariants,
      quoteMarketCode,
      shopName,
      showToast,
      templateScopeKey,
      measureOverrides,
      pricingTemplate,
    ]
  );

  const fetchQuotesForPipeline = useCallback(
    (variantIds?: string[], signal?: AbortSignal) =>
      fetchQuotesForVariants(variantIds, measureOverrides, {
        includeExceptions: true,
        signal,
      }),
    [fetchQuotesForVariants, measureOverrides]
  );

  const pipeline = useLogisticsIncrementalPipeline({
    shopName,
    analysis,
    templateScopeKey,
    quoteResults,
    fetchQuotesForVariants: fetchQuotesForPipeline,
    acceptDecision: api.acceptLogisticsDecision,
    setAnalysis,
    showToast,
  });

  const completionGate = useMemo(
    () =>
      evaluateLogisticsCompletionGate(
        {
          hasSavedTemplate,
          pipelineActive: pipeline.pipelineRunning,
          analysis,
          quoteResults,
          templateMarketsConfigured: Boolean(
            activeTemplate && codesFromSelections(activeTemplate.markets).length > 0
          ),
        },
        t
      ),
    [
      hasSavedTemplate,
      pipeline.pipelineRunning,
      analysis,
      quoteResults,
      activeTemplate,
      t,
    ]
  );

  const skuBindingGap = useMemo(() => {
    if (workflowSku) {
      return {
        products: workflowSku.issueProductCount,
        skus: workflowSku.needsReview + workflowSku.unbound,
      };
    }
    let products = 0;
    let skus = 0;
    for (const product of analysis?.productProfiles ?? []) {
      const pending = (product.variantDecisions ?? []).filter(
        (v) => v.decisionStatus === "pending_sku"
      );
      if (pending.length > 0) {
        products += 1;
        skus += pending.length;
      }
    }
    return { products, skus };
  }, [workflowSku, analysis]);

  useEffect(() => {
    publishLogisticsPipelineActive(pipeline.pipelineActive);
  }, [pipeline.pipelineActive, publishLogisticsPipelineActive]);

  useEffect(() => {
    if (!isAuthorized) {
      publishLogisticsStepSnapshot(null);
      return;
    }
    publishLogisticsStepSnapshot(
      deriveLogisticsStepSnapshot(
        {
          skuReady: skuReadyForNext,
          pipelineActive: pipeline.pipelineActive,
          gate: completionGate,
          logisticsCompleted,
        },
        t
      )
    );
  }, [
    isAuthorized,
    skuReadyForNext,
    pipeline.pipelineActive,
    completionGate,
    logisticsCompleted,
    publishLogisticsStepSnapshot,
    t,
  ]);

  const handleStartEstimate = useCallback(() => {
    pipeline.resetScopeRun();
    void pipeline.runIncrementalPipeline({ force: true });
  }, [pipeline.resetScopeRun, pipeline.runIncrementalPipeline]);

  const handleRetryPipeline = useCallback(() => {
    handleStartEstimate();
  }, [handleStartEstimate]);

  const handleFetchQuoteForVariant = (
    variant: VariantLogisticsDecision,
    override?: MeasureOverride
  ) => {
    if (override) {
      setMeasureOverrides((prev) => {
        const next = new Map(prev);
        next.set(variant.thirdPlatformSkuId, override);
        return next;
      });
      setAnalysis((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          productProfiles: prev.productProfiles.map((product) => ({
            ...product,
            variantDecisions: (product.variantDecisions ?? []).map((v) =>
              v.thirdPlatformSkuId === variant.thirdPlatformSkuId
                ? {
                    ...v,
                    estimatedWeightG: override.weightG ?? v.estimatedWeightG,
                    estimatedLengthCm: override.lengthCm ?? v.estimatedLengthCm,
                    estimatedWidthCm: override.widthCm ?? v.estimatedWidthCm,
                    estimatedHeightCm: override.heightCm ?? v.estimatedHeightCm,
                    measureSource:
                      override.weightG || override.lengthCm ? "manual" : v.measureSource,
                  }
                : v
            ),
          })),
        };
      });
    }
    void handleFetchQuotes([variant.thirdPlatformSkuId], override);
  };

  const handleFetchQuotesForProduct = (
    _productId: string,
    variants: VariantLogisticsDecision[]
  ) => {
    const ids = collectProductQuotableVariantIds(
      variants,
      quoteResults,
      pipeline.pipelineRunning
    );
    if (ids.length === 0) {
      showToast(t("logistics.toastNoEstimableSku"));
      return;
    }
    setQuotingProductId(_productId);
    void handleFetchQuotes(ids).finally(() => setQuotingProductId(null));
  };

  const fetchQuotesForReady = useCallback(async () => {
    const readyIds = collectReadyVariants().map((v) => v.thirdPlatformSkuId);
    return fetchQuotesForVariants(readyIds);
  }, [collectReadyVariants, fetchQuotesForVariants]);

  const handleFetchQuotes = async (
    variantIds?: string[],
    singleOverride?: MeasureOverride
  ) => {
    const overrideMap =
      singleOverride && variantIds?.length === 1
        ? new Map([[variantIds[0]!, singleOverride]])
        : measureOverrides;
    const targets = variantIds?.length
      ? collectQuotableVariants(overrideMap).filter((v) =>
          variantIds.includes(v.thirdPlatformSkuId)
        )
      : collectQuotableVariants(overrideMap);
    if (quoting || targets.length === 0) {
      if (targets.length === 0) showToast(t("logistics.toastNoRoutes"));
      return;
    }

    setQuoting(true);
    try {
      const resultsMap = await fetchQuotesForVariants(variantIds, overrideMap);
      if (!resultsMap) return;
      const params = buildEstimateParams(activeTemplate, quoteMarketCode);
      const results = [...resultsMap.values()];
      const withLine = results.filter((r) => r.recommendedLine).length;
      const ingestingCount = results.filter((r) => r.quoteStatus === "INGESTING").length;
      showToast(
        withLine > 0
          ? t("logistics.toastRoutesFetched", { withLine, total: resultsMap.size, country: params?.countryCode ?? "", speed: params?.shippingOption ?? "" })
          : ingestingCount > 0
            ? GOODS_INGESTING_MESSAGE
            : results.find((r) => r.errorMessage)?.errorMessage ||
              t("logistics.toastNoRoutesReturned", { total: resultsMap.size, country: params?.countryCode ?? "" })
      );
      setFilterMode("all");
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setQuoting(false);
    }
  };

  const handleAcceptAi = async (
    variant: VariantLogisticsDecision,
    _productId: string
  ) => {
    if (accepting) return;
    setAccepting(true);
    try {
      let quote = quoteResults.get(variant.thirdPlatformSkuId);
      if (!quote?.recommendedLine && variant.decisionStatus === "ready_for_quote") {
        setQuoting(true);
        try {
          const fetched = await fetchQuotesForReady();
          if (fetched === null) return;
          quote = fetched.get(variant.thirdPlatformSkuId);
        } finally {
          setQuoting(false);
        }
      }
      const quotePayload = buildAcceptQuotePayload(
        variant,
        quote,
        selectedLineByVariant.get(variant.thirdPlatformSkuId)
      );
      if (variant.decisionStatus === "ready_for_quote" && !quotePayload?.recommendedLine) {
        setFilterMode("all");
        showToast(t("logistics.toastNoQuoteAvailable"));
        return;
      }
      const result = await api.acceptLogisticsDecision({
        shopName,
        targetScope: "VARIANTS",
        variantIds: [variant.thirdPlatformSkuId],
        quotes: quotePayload
          ? { [variant.thirdPlatformSkuId]: quotePayload }
          : undefined,
      });
      setAnalysis(result.analysis);
      setFilterMode("all");
      showToast(
        result.acceptedCount > 0 ? t("logistics.toastAcceptAiDone") : t("logistics.toastAcceptAiNone")
      );
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setAccepting(false);
    }
  };

  const handleAcceptAllReady = async (opts?: {
    onProgress?: (current: number, total: number, success: number, failed: number) => void;
    isCancelled?: () => boolean;
    onlyVariantIds?: string[];
  }) => {
    if (accepting) return;
    const allTargets = collectBatchAcceptableVariants(analysis, quoteResults);
    const targets =
      opts?.onlyVariantIds && opts.onlyVariantIds.length > 0
        ? allTargets.filter((v) => opts.onlyVariantIds!.includes(v.thirdPlatformSkuId))
        : allTargets;
    if (targets.length === 0) {
      showToast(t("logistics.toastNoPendingQuote"));
      return;
    }

    const total = targets.length;
    opts?.onProgress?.(0, total, 0, 0);

    setAccepting(true);
    const failedIds: string[] = [];
    try {
      const CHUNK_SIZE = 10;
      let acceptedTotal = 0;
      let failedTotal = 0;

      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        if (opts?.isCancelled?.()) {
          showToast(t("logistics.toastBatchAcceptCancelled"));
          return;
        }

        const chunk = targets.slice(i, i + CHUNK_SIZE);
        const quotes: LogisticsAcceptDecisionRequest["quotes"] = {};
        for (const variant of chunk) {
          const result = quoteResults.get(variant.thirdPlatformSkuId);
          const payload = buildAcceptQuotePayload(
            variant,
            result,
            selectedLineByVariant.get(variant.thirdPlatformSkuId)
          );
          if (!payload?.recommendedLine) continue;
          quotes[variant.thirdPlatformSkuId] = payload;
        }

        const variantIds = chunk
          .map((v) => v.thirdPlatformSkuId)
          .filter((id) => quotes[id]);
        if (variantIds.length === 0) continue;

        try {
          const result = await api.acceptLogisticsDecision({
            shopName,
            targetScope: "VARIANTS",
            variantIds,
            quotes,
          });
          setAnalysis(result.analysis);
          acceptedTotal += result.acceptedCount;
          if (result.acceptedCount < variantIds.length) {
            failedTotal += variantIds.length - result.acceptedCount;
            failedIds.push(...variantIds);
          }
        } catch {
          failedTotal += variantIds.length;
          failedIds.push(...variantIds);
        }

        opts?.onProgress?.(
          Math.min(i + chunk.length, targets.length),
          total,
          acceptedTotal,
          failedTotal
        );
      }

      setBatchFailedVariantIds(failedIds);
      setFilterMode("all");
      if (opts?.isCancelled?.()) return;
      showToast(
        acceptedTotal > 0
          ? t("logistics.toastBatchAccepted", { accepted: acceptedTotal })
          : failedTotal > 0
            ? t("logistics.toastBatchFailed", { failed: failedTotal })
            : t("logistics.toastNoAcceptable")
      );
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setAccepting(false);
    }
  };

  const handleFocusStatus = (status: LogisticsDecisionStatus) => {
    if (status === "pending_sku") {
      setFilterMode("needs_attention");
    } else {
      setFilterMode("pending");
    }
    setFocusTarget({ status });
  };

  const handleSetFilter = useCallback((mode: string) => {
    setFilterMode(normalizeLogisticsFilterMode(mode));
    setFocusTarget(null);
  }, []);

  useEffect(() => {
    setFilterMode((prev) => coerceLogisticsFilterMode(prev, planMetrics));
  }, [planMetrics]);

  useEffect(() => {
    if (!hasSavedTemplate) {
      setWorkflowStep("setup");
      return;
    }
    setWorkflowStep((prev) => {
      if (prev === "setup") {
        return deriveLogisticsWorkflowStep({ hasSavedTemplate, metrics: planMetrics });
      }
      return prev;
    });
  }, [hasSavedTemplate, planMetrics]);

  const handleWorkflowStepChange = useCallback(
    (step: LogisticsWorkflowStep) => {
      setWorkflowStep(step);
      if (step === "estimate") {
        setFilterMode("pending");
        scrollToLogisticsList();
      } else if (step === "confirm") {
        const attention = planMetrics.exceptionCount + planMetrics.skuUnlinkedCount;
        setFilterMode(attention > 0 ? "needs_attention" : "pending");
        scrollToLogisticsList();
      } else {
        setFilterMode("all");
      }
    },
    [planMetrics.exceptionCount, planMetrics.skuUnlinkedCount, scrollToLogisticsList]
  );

  const logisticsPreviewGenerators = useMemo(
    () => ({
      accept_all_ready: async (_plan: LogisticsCommandPlan) => {
        const total = workbench.batchAcceptCount;
        if (total === 0) {
          throw new Error(t("logistics.previewNoPending"));
        }
        return {
          sections: [
            {
              title: t("logistics.previewTitle", { total }),
              rows: [
                {
                  label: t("logistics.previewLabel"),
                  before: t("logistics.previewBefore"),
                  after: t("logistics.previewAfter"),
                },
              ],
            },
          ],
          impact: {
            scope: t("logistics.previewScope", { total }),
            durationHint: t("sku.confirmDuration", { seconds: Math.max(5, total * 2) }),
            reversible: false,
          },
          payload: { totalCount: total },
        };
      },
    }),
    [workbench.batchAcceptCount]
  );

  const logisticsCommandExecutors = useMemo(
    () => ({
      accept_all_ready: async (payload: Record<string, unknown>) => {
        batchAcceptCancelRef.current = false;
        const onProgress = payload.onProgress as
          | ((current: number, total: number, success: number, failed: number) => void)
          | undefined;
        await handleAcceptAllReady({
          onProgress,
          isCancelled: () => batchAcceptCancelRef.current,
        });
      },
    }),
    [handleAcceptAllReady]
  );

  if (!authSessionReady) {
    return (
      <WorkbenchShell sidebar={<StepSidebar />} {...wb.shellProps}>
        <WorkbenchPanel
          title={t("logistics.pageTitle")}
          breadcrumbs={breadcrumbs}
          {...wb.panelProps}
        >
          <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-[#325BE6]" />
            {t("logistics.restoringAuth")}
          </div>
          <FadeSwap loading minHeightClass="min-h-[320px]" skeleton={<TableSkeleton rows={4} />}>
            <div />
          </FadeSwap>
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  if (!isAuthorized) {
    return (
      <WorkbenchShell
        sidebar={<StepSidebar />}
        rail={
          <AssistantRail
            assistantContent={
              <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-xs text-ink-subtle">
                {t("logistics.authNeeded")}
              </div>
            }
          />
        }
        {...wb.shellProps}
      >
        <WorkbenchPanel
          title={t("logistics.pageTitle")}
          breadcrumbs={breadcrumbs}
          {...wb.panelProps}
        >
          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-6 text-sm text-ink-muted">
            {t("logistics.authNeeded")}
            <Link
              href={localePath(locale, "/authorize")}
              className="ml-2 text-link hover:text-link-hover hover:underline"
            >
              {t("logistics.goAuthorize")}
            </Link>
          </div>
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  return (
    <WorkbenchShell
      sidebar={<StepSidebar />}
      rail={
        <AssistantRail
          assistantContent={
            <LogisticsAgentPanel
              analysis={analysis}
              activeTemplate={activeTemplate}
              decisionStatusCounts={analysis?.decisionStatusCounts}
              skuReadyForNext={skuReadyForNext}
              quoting={quoting || pipeline.pipelineActive}
              accepting={accepting}
              onFocusStatus={handleFocusStatus}
              onAcceptAllReady={() => void handleAcceptAllReady()}
              onFetchQuotes={() => void handleFetchQuotes()}
              onOpenTemplate={() => setShowDrawer(true)}
              pipelineProgress={pipeline.progress}
              pipelineActive={pipeline.pipelineActive}
              pendingReviewCount={planMetrics.pendingQuoteCount}
              onRetryPipeline={handleRetryPipeline}
              onCancelPipeline={pipeline.cancelPipeline}
              previewGenerators={logisticsPreviewGenerators}
              commandExecutors={logisticsCommandExecutors}
              planMetrics={planMetrics}
              completionGate={completionGate}
              pipelineRunning={pipeline.pipelineRunning}
              saving={saving}
              skuBindingGap={skuBindingGap}
              onStartEstimate={handleStartEstimate}
              onSaveAndSync={handleSaveAndSync}
              onViewUnidentified={() => {
                setFilterMode("needs_attention");
                scrollToLogisticsList();
              }}
              onViewPendingConfirm={handleViewPendingConfirm}
              onViewExceptions={handleViewExceptions}
              onSetFilter={handleSetFilter}
              onCancelBatchAccept={() => {
                batchAcceptCancelRef.current = true;
              }}
              catalogIngestingCount={catalogIngestingCount}
            />
          }
        />
      }
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title={t("logistics.pageTitle")}
        breadcrumbs={breadcrumbs}
        {...wb.panelProps}
        actions={
          hasSavedTemplate && analysis ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void load(true);
                  showToast(t("logistics.actionReanalyze"));
                }}
                disabled={loading || classifying}
                title={t("logistics.actionReanalyze")}
              >
                {classifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {t("logistics.actionReanalyze")}
              </Button>
              <Button
                size="sm"
                onClick={handleStartEstimate}
                disabled={
                  loading ||
                  pipeline.pipelineRunning ||
                  !workbench.actions.canEstimate
                }
                title={
                  planMetrics.pendingQuoteCount > 0
                    ? t("logistics.estimateTitle", { count: planMetrics.pendingQuoteCount })
                    : t("logistics.estimateNone")
                }
              >
                {pipeline.pipelineRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
              {pipeline.pipelineRunning
                ? t("logistics.estimating")
                : planMetrics.pendingQuoteCount > 0
                  ? t("logistics.estimateWithCount", { count: planMetrics.pendingQuoteCount })
                  : t("logistics.actionEstimate")}
              </Button>
              {batchFailedVariantIds.length > 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void handleAcceptAllReady({ onlyVariantIds: batchFailedVariantIds })
                  }
                  disabled={accepting}
                  title={t("logistics.actionRetryFailed", {
                    count: batchFailedVariantIds.length,
                  })}
                >
                  {accepting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("logistics.actionRetryFailed", {
                    count: batchFailedVariantIds.length,
                  })}
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        <div className="space-y-4">
          {!isMallGatewayConfigured() ? (
            <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
              {t("logistics.tokenMissing")}
            </div>
          ) : null}
          {!loading || analysis ? (
            <LogisticsWorkflowSteps
              step={workflowStep}
              onStepChange={handleWorkflowStepChange}
              hasSavedTemplate={hasSavedTemplate}
              metrics={planMetrics}
            />
          ) : null}

          {workflowStep === "setup" && !hasSavedTemplate && !loading ? (
            <LogisticsTemplateSetupCard onOpenTemplate={() => setShowDrawer(true)} />
          ) : null}

          {hasSavedTemplate && analysis && workflowStep !== "setup" ? (
            <LogisticsPlanStatusCard
              analysis={analysis}
              activeTemplate={activeTemplate}
              filterMode={filterMode}
              onFilterModeChange={setFilterMode}
              postalLimitFilter={postalLimitFilter}
              onPostalLimitFilterChange={setPostalLimitFilter}
              quoteMarketCode={quoteMarketCode}
              onOpenStrategy={() => setShowDrawer(true)}
              pipelineProgress={pipeline.progress}
              quoteResults={quoteResults}
            />
          ) : null}

          {workflowStep === "setup" && hasSavedTemplate && analysis ? (
            <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/20 px-4 py-6 text-center">
              <p className="text-sm font-medium text-ink">{t("logistics.strategyConfigured")}</p>
              <p className="mt-1 text-xs text-ink-subtle">
                {t("logistics.strategyConfiguredDesc")}
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" onClick={() => handleWorkflowStepChange("estimate")}>
                  {t("logistics.actionEstimate")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowDrawer(true)}
                >
                  {t("logistics.editStrategy")}
                </Button>
              </div>
            </div>
          ) : null}

          {showSyncConfirm ? (
            <LogisticsSyncConfirmCard
              gate={completionGate}
              saving={saving}
              onConfirm={() => {
                setShowSyncConfirm(false);
                void handleSave(true, completionGate.exceptionCount);
              }}
              onCancel={() => setShowSyncConfirm(false)}
            />
          ) : null}

          {loading && !analysis ? (
            <LogisticsClassifyStage
              phase={classifying ? "classifying" : "loading"}
              productCount={workflowSku?.productCount}
            />
          ) : error && !analysis ? (
            <div className="rounded-[var(--radius-card)] border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
              {error}
              <Button
                size="sm"
                variant="secondary"
                className="ml-3"
                onClick={() => void load(false)}
              >
                {t("logistics.retry")}
              </Button>
            </div>
          ) : hasSavedTemplate && analysis && workflowStep !== "setup" ? (
            <div ref={logisticsListRef} className="scroll-mt-4">
            {planMetrics.skuUnlinkedCount > 0 ? (
              <div className="mb-4 rounded-[var(--radius-card)] border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                <Link href="/sku-align" className="font-medium text-amber-700 underline">
                  {t("logistics.pendingSkuWarning", { count: planMetrics.skuUnlinkedCount })}
                </Link>
              </div>
            ) : null}
            <div className="relative">
              <LogisticsDecisionList
                analysis={analysis}
                shopName={shopName}
                filterMode={filterMode}
                postalLimitFilter={postalLimitFilter}
                quoteResults={quoteResults}
                activeTemplate={activeTemplate}
                correctingId={correctingId}
                focusTarget={focusTarget}
                onCorrect={(id, type) => void handleCorrect(id, type)}
                onAcceptAi={(v, pid) => void handleAcceptAi(v, pid)}
                onFetchProductQuotes={(productId, variants) =>
                  handleFetchQuotesForProduct(productId, variants)
                }
                onMeasureOverride={(variantId, next) => {
                  setMeasureOverrides((prev) => {
                    const map = new Map(prev);
                    map.set(variantId, next);
                    return map;
                  });
                }}
                accepting={accepting}
                quotingProductId={quotingProductId}
                onClearFocus={() => setFocusTarget(null)}
                pricing={pricingTemplate}
                pipelineActive={pipeline.pipelineActive}
                pipelineProgress={pipeline.progress}
                selectedLineByVariant={selectedLineByVariant}
                onSelectLine={handleSelectLine}
              />
              {pipeline.pipelineRunning && pipeline.progress.productTotal > 0 ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-surface/60 backdrop-blur-[1px]">
                  <div className="w-full max-w-xs space-y-3 px-4">
                    <div className="text-center text-sm font-medium text-ink">
                      {t("logistics.pipelineRunningTitle")}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-[#90AAFF] transition-all duration-300"
                        style={{ width: `${Math.round(((pipeline.progress.productIndex + 1) / pipeline.progress.productTotal) * 100)}%` }}
                      />
                    </div>
                    <div className="text-center text-xs text-ink-subtle">
                      {t("logistics.pipelineRunningProgress", {
                        current: pipeline.progress.productIndex + 1,
                        total: pipeline.progress.productTotal,
                        title: pipeline.progress.currentProductTitle ?? "",
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            </div>
          ) : null}
        </div>
      </WorkbenchPanel>

      {showDrawer ? (
        <LogisticsTemplateDrawer
          shopName={shopName}
          templates={templates}
          activeTemplate={activeTemplate}
          onSave={handleSaveTemplate}
          onDelete={handleDeleteTemplate}
          onSelect={handleSelectTemplate}
          onClose={() => setShowDrawer(false)}
        />
      ) : null}
    </WorkbenchShell>
  );
}

const MEASURE_OVERRIDES_PREFIX = "logistics-measures:v1:";

function measureOverridesStorageKey(shopName: string): string {
  return `${MEASURE_OVERRIDES_PREFIX}${shopName}`;
}

function readMeasureOverrides(shopName: string): Map<string, MeasureOverride> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(measureOverridesStorageKey(shopName));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Array<[string, MeasureOverride]>;
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed);
  } catch {
    return new Map();
  }
}

function writeMeasureOverrides(
  shopName: string,
  map: Map<string, MeasureOverride>
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      measureOverridesStorageKey(shopName),
      JSON.stringify([...map.entries()])
    );
  } catch {
    // ignore quota / private mode
  }
}

export default function LogisticsPage() {
  return <LogisticsContent />;
}
