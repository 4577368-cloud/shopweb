"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { LogisticsAgentPanel } from "@/components/logistics/logistics-agent-panel";
import { LogisticsTemplateSetupCard } from "@/components/logistics/logistics-template-setup-card";
import {
  LogisticsDecisionList,
  type LogisticsFocusTarget,
  type MeasureOverride,
} from "@/components/logistics/logistics-decision-list";
import { LogisticsPlanStatusCard } from "@/components/logistics/logistics-plan-status-card";
import { LogisticsSyncConfirmCard } from "@/components/logistics/logistics-sync-confirm-card";
import { LogisticsTemplateDrawer } from "@/components/logistics/logistics-template-drawer";
import { PricingStrategyRailCard } from "@/components/select/pricing-strategy-rail-card";
import type { LogisticsCommandPlan } from "@/lib/agents/logistics/command-schema";
import { codesFromSelections } from "@/components/logistics/market-multi-select";
import { useOnboarding } from "@/context/onboarding-context";
import { useLogisticsIncrementalPipeline } from "@/hooks/use-logistics-incremental-pipeline";
import { hasSavedLogisticsTemplate } from "@/lib/logistics/incremental-pipeline";
import { api, readableError, type LogisticsAcceptDecisionRequest, type LogisticsEstimateResult } from "@/lib/api";
import type { LogisticsFilterMode } from "@/lib/logistics/display";
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
  collectProductQuotableVariantIds,
  computeLogisticsPlanMetrics,
} from "@/lib/logistics/display";
import {
  mergeQuoteResultsIntoAnalysis,
  readQuoteCache,
  writeQuoteCache,
} from "@/lib/logistics/quote-cache";
import { enrichVariantsWithMeasures } from "@/lib/logistics/variant-measures";
import { enrichVariantsWithEstimateGoodsIds } from "@/lib/logistics/resolve-estimate-goods-id";
import { quoteStatusForGoodsBlock } from "@/lib/logistics/estimate-goods-block";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsTemplate,
  LogisticsTypeCode,
  PricingTemplate,
  VariantLogisticsDecision,
} from "@/lib/types";

const BREADCRUMBS = [
  { label: "工作台", href: "/" },
  { label: "SKU 对齐", href: "/sku-align" },
  { label: "物流选择" },
];

const DEFAULT_TEMPLATE = (shopName: string): LogisticsTemplate => ({
  id: "default",
  shopName,
  name: "默认模板",
  packaging: "MINIMAL",
  speedPreference: "BALANCED",
  markets: [{ marketGroupId: "north_america", countryCodes: ["US"] }],
  isActive: true,
});

function LogisticsContent() {
  const router = useRouter();
  const { shop, isAuthorized, authSessionReady, saveLogistics, showToast, skuReadyForNext, workflowSku, logisticsCompleted, publishLogisticsStepSnapshot } =
    useOnboarding();
  const shopName = shop.name?.trim() || shop.domain?.trim() || "";
  const wb = useWorkbenchPage("logistics");

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
  const [quoteResults, setQuoteResults] = useState<
    Map<string, LogisticsEstimateResult>
  >(new Map());
  const [quoting, setQuoting] = useState(false);
  const [quotingProductId, setQuotingProductId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [focusTarget, setFocusTarget] = useState<LogisticsFocusTarget | null>(
    null
  );
  const [quoteMarketCode, setQuoteMarketCode] = useState<string | null>(null);
  const [pricingTemplate, setPricingTemplate] = useState<PricingTemplate | null>(null);
  const [measureOverrides, setMeasureOverrides] = useState<Map<string, MeasureOverride>>(
    new Map()
  );
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);

  const planMetrics = useMemo(
    () => computeLogisticsPlanMetrics(analysis, quoteResults),
    [analysis, quoteResults]
  );

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

  useEffect(() => {
    setQuoteMarketCode(resolveQuoteMarketCode(activeTemplate, null));
    if (!shopName || !templateScopeKey) {
      setQuoteResults(new Map());
      return;
    }
    const cached = readQuoteCache(shopName, templateScopeKey);
    setQuoteResults(cached);
    if (cached.size > 0) {
      setAnalysis((prev) =>
        prev ? mergeQuoteResultsIntoAnalysis(prev, cached) : prev
      );
    }
  }, [templateScopeKey, shopName, activeTemplate]);

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
          setActiveTemplate(DEFAULT_TEMPLATE(shopName));
        }
      } catch (err) {
        setError(readableError(err));
        const ts = await api.listLogisticsTemplates(shopName).catch(() => []);
        setTemplates(ts);
        setActiveTemplate(ts.length > 0 ? ts[0] : DEFAULT_TEMPLATE(shopName));
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
      showToast("已修正物流类型");
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
      showToast("物流模板已保存");
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
          remaining.length > 0 ? remaining[0] : DEFAULT_TEMPLATE(shopName)
        );
      }
      showToast("模板已删除");
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
      showToast("先选销售国家");
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
      showToast(completionGate.blockers[0] ?? "先处理阻塞项");
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

  const readyAcceptCount = useMemo(
    () => collectReadyVariants().length,
    [collectReadyVariants]
  );

  const fetchQuotesForVariants = useCallback(
    async (
      variantIds?: string[],
      overrides?: Map<string, MeasureOverride>,
      opts?: { includeExceptions?: boolean }
    ) => {
      const overrideMap = overrides ?? measureOverrides;
      const all = collectQuotableVariants(overrideMap, {
        includeExceptions: opts?.includeExceptions,
      });
      const targets = variantIds?.length
        ? all.filter((v) => variantIds.includes(v.thirdPlatformSkuId))
        : all;
      if (targets.length === 0) return new Map<string, LogisticsEstimateResult>();

      const marketCode = resolveQuoteMarketCode(activeTemplate, quoteMarketCode);
      if (!marketCode) {
        showToast("请先在模板中配置销售市场");
        return null;
      }
      const countryId = await resolveTangbuyCountryId(marketCode);
      const params = buildEstimateParams(activeTemplate, quoteMarketCode, countryId);
      if (!params) {
        showToast(
          `未解析到 ${marketCode} 的 Tangbuy countryId，请在 dropshipping 后台试算并从网络请求复制，写入 TANGBUY_COUNTRY_IDS`
        );
        return null;
      }

      const payloadVariants = targets.map(
        ({ decisionStatus: _status, ...variant }) => ({ ...variant })
      );
      await enrichVariantsWithMeasures(payloadVariants);
      const resolvedVariants = await enrichVariantsWithEstimateGoodsIds(
        payloadVariants,
        shopName
      );

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
        const response = await api.estimateLogistics({
          shopName,
          countryCode: params.countryCode,
          countryId: params.countryId,
          shippingOption: params.shippingOption,
          packaging: params.packaging,
          quoteCurrency: pricingTemplate?.targetCurrency?.trim().toUpperCase() || "USD",
          variants: quotableVariants.map(
            ({
              estimateGoodsId: _id,
              estimateGoodsError: _err,
              titleHint: _title,
              thirdPlatformItemId: _itemId,
              sourceIdentity: _identity,
              ...variant
            }) => ({
              ...variant,
              tangbuyGoodsId: variant.tangbuyGoodsId,
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
        });
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
    (variantIds?: string[]) =>
      fetchQuotesForVariants(variantIds, measureOverrides, {
        includeExceptions: true,
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
      evaluateLogisticsCompletionGate({
        hasSavedTemplate,
        pipelineActive: pipeline.pipelineRunning,
        analysis,
        quoteResults,
        templateMarketsConfigured: Boolean(
          activeTemplate && codesFromSelections(activeTemplate.markets).length > 0
        ),
      }),
    [
      hasSavedTemplate,
      pipeline.pipelineRunning,
      analysis,
      quoteResults,
      activeTemplate,
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
    if (!isAuthorized) {
      publishLogisticsStepSnapshot(null);
      return;
    }
    publishLogisticsStepSnapshot(
      deriveLogisticsStepSnapshot({
        skuReady: skuReadyForNext,
        pipelineActive: pipeline.pipelineActive,
        gate: completionGate,
        logisticsCompleted,
      })
    );
  }, [
    isAuthorized,
    skuReadyForNext,
    pipeline.pipelineActive,
    completionGate,
    logisticsCompleted,
    publishLogisticsStepSnapshot,
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
      showToast("本商品没有可拉取报价的 SKU");
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
      if (targets.length === 0) showToast("没有可拉取线路的规格");
      return;
    }

    setQuoting(true);
    try {
      const resultsMap = await fetchQuotesForVariants(variantIds, overrideMap);
      if (!resultsMap) return;
      const params = buildEstimateParams(activeTemplate, quoteMarketCode);
      const withLine = [...resultsMap.values()].filter((r) => r.recommendedLine)
        .length;
      const firstError = [...resultsMap.values()].find((r) => r.errorMessage)?.errorMessage;
      showToast(
        withLine > 0
          ? `已拉取 ${withLine}/${resultsMap.size} 条线路（${params?.countryCode ?? ""} · 时效${params?.shippingOption ?? ""}）`
          : firstError ||
              `已请求 ${resultsMap.size} 条报价，但 Tangbuy 未返回可用线路（${params?.countryCode ?? ""}）`
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
      if (variant.decisionStatus === "ready_for_quote" && !quote?.recommendedLine) {
        setFilterMode("all");
        showToast("该规格暂无可用线路报价，请先拉取或检查模板市场");
        return;
      }
      const result = await api.acceptLogisticsDecision({
        shopName,
        targetScope: "VARIANTS",
        variantIds: [variant.thirdPlatformSkuId],
        quotes: quote
          ? {
              [variant.thirdPlatformSkuId]: {
                recommendedLine: quote.recommendedLine,
                alternativeLines: quote.alternativeLines,
                quoteStatus: quote.quoteStatus,
              },
            }
          : undefined,
      });
      setAnalysis(result.analysis);
      setFilterMode("all");
      showToast(
        result.acceptedCount > 0 ? "已接受 AI 决策" : "该规格暂不可接受"
      );
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setAccepting(false);
    }
  };

  const handleAcceptAllReady = async () => {
    if (accepting) return;
    const readyVariants = collectReadyVariants();
    if (readyVariants.length === 0) {
      showToast("没有可接受的可报价项");
      return;
    }

    setAccepting(true);
    try {
      let results = quoteResults;
      const needsFetch = readyVariants.some(
        (v) => !quoteResults.get(v.thirdPlatformSkuId)?.recommendedLine
      );
      if (needsFetch) {
        setQuoting(true);
        try {
          const fetched = await fetchQuotesForReady();
          if (fetched === null) return;
          results = fetched;
        } finally {
          setQuoting(false);
        }
      }

      const quotable = readyVariants.filter((v) =>
        Boolean(results.get(v.thirdPlatformSkuId)?.recommendedLine)
      );
      if (quotable.length === 0) {
        setFilterMode("all");
        const resultList = [...results.values()];
        const ingesting = resultList.some((r) => r.quoteStatus === "INGESTING");
        const firstError = resultList.find((r) => r.errorMessage)?.errorMessage;
        showToast(
          ingesting
            ? "商品正在同步 Tangbuy 商品库，请稍后再拉取物流报价"
            : firstError ||
                "未获取到可用线路报价，请检查模板市场或稍后重试「拉取可报价线路」"
        );
        return;
      }

      const quotes: LogisticsAcceptDecisionRequest["quotes"] = {};
      for (const v of quotable) {
        const result = results.get(v.thirdPlatformSkuId);
        if (!result) continue;
        quotes[v.thirdPlatformSkuId] = {
          recommendedLine: result.recommendedLine,
          alternativeLines: result.alternativeLines,
          quoteStatus: result.quoteStatus,
        };
      }

      const result = await api.acceptLogisticsDecision({
        shopName,
        targetScope: "VARIANTS",
        variantIds: quotable.map((v) => v.thirdPlatformSkuId),
        quotes,
      });
      setAnalysis(result.analysis);
      setFilterMode("all");
      const skipped = readyVariants.length - quotable.length;
      showToast(
        result.acceptedCount > 0
          ? skipped > 0
            ? `已接受 ${result.acceptedCount} 条（含线路）；${skipped} 条因无报价未接受`
            : `已接受 ${result.acceptedCount} 条可报价决策`
          : "没有可接受的可报价项"
      );
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setAccepting(false);
    }
  };

  const handleFocusStatus = (status: LogisticsDecisionStatus) => {
    setFilterMode("issues");
    setFocusTarget({ status });
  };

  const logisticsPreviewGenerators = useMemo(
    () => ({
      accept_all_ready: async (_plan: LogisticsCommandPlan) => {
        const total = readyAcceptCount;
        if (total === 0) {
          throw new Error("没有可确认的可报价项");
        }
        return {
          sections: [
            {
              title: `批量确认 · ${total} 个可报价 SKU`,
              rows: [
                {
                  label: "物流决策",
                  before: "待确认",
                  after: "接受 AI 推荐线路",
                },
              ],
            },
          ],
          impact: {
            scope: `${total} 个 SKU 物流方案`,
            durationHint: `约 ${Math.max(5, total * 2)} 秒`,
            reversible: false,
          },
          payload: { totalCount: total },
        };
      },
    }),
    [readyAcceptCount]
  );

  const logisticsCommandExecutors = useMemo(
    () => ({
      accept_all_ready: async () => {
        await handleAcceptAllReady();
      },
    }),
    [handleAcceptAllReady]
  );

  if (!authSessionReady) {
    return (
      <WorkbenchShell sidebar={<StepSidebar />} {...wb.shellProps}>
        <WorkbenchPanel
          title="AI 物流方案"
          breadcrumbs={BREADCRUMBS}
          {...wb.panelProps}
        >
          <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            正在恢复店铺授权…
          </div>
          <TableSkeleton rows={4} />
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
                请先完成店铺授权。
              </div>
            }
          />
        }
        {...wb.shellProps}
      >
        <WorkbenchPanel
          title="AI 物流方案"
          breadcrumbs={BREADCRUMBS}
          {...wb.panelProps}
        >
          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-6 text-sm text-ink-muted">
            请先完成店铺授权。
            <Link
              href="/authorize"
              className="ml-2 text-brand-strong hover:underline"
            >
              去授权
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
              highRiskTypes={analysis?.highRiskTypes}
              skuReadyForNext={skuReadyForNext}
              quoting={quoting || pipeline.pipelineActive}
              accepting={accepting}
              readyAcceptCount={readyAcceptCount}
              pendingCount={planMetrics.pendingCount}
              confirmedCount={analysis?.decisionStatusCounts?.confirmed ?? 0}
              onFocusStatus={handleFocusStatus}
              onAcceptAllReady={() => void handleAcceptAllReady()}
              onFetchQuotes={() => void handleFetchQuotes()}
              onOpenTemplate={() => setShowDrawer(true)}
              pipelineProgress={pipeline.progress}
              pipelineActive={pipeline.pipelineActive}
              pendingReviewCount={planMetrics.pendingCount}
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
              onViewUnidentified={() => setFilterMode("unidentified")}
              onViewIssues={() => setFilterMode("issues")}
            />
          }
          strategyCards={
            <PricingStrategyRailCard
              template={pricingTemplate}
              analysisReady={Boolean(analysis)}
              onConfigure={() => router.push("/products")}
            />
          }
        />
      }
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title="AI 物流方案"
        breadcrumbs={BREADCRUMBS}
        {...wb.panelProps}
        actions={
          hasSavedTemplate && analysis ? (
            <Button
              size="sm"
              onClick={handleStartEstimate}
              disabled={
                loading ||
                pipeline.pipelineRunning ||
                planMetrics.autoReadyCount === 0
              }
              title={
                planMetrics.autoReadyCount > 0
                  ? `批量拉取 ${planMetrics.autoReadyCount} 个待报价 SKU 的线路`
                  : "当前没有待报价 SKU"
              }
            >
              {pipeline.pipelineRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {pipeline.pipelineRunning
                ? "预估中…"
                : planMetrics.autoReadyCount > 0
                  ? `一键预估 (${planMetrics.autoReadyCount})`
                  : "一键预估"}
            </Button>
          ) : null
        }
      >
        <div className="space-y-4">
          {!hasSavedTemplate && !loading ? (
            <LogisticsTemplateSetupCard onOpenTemplate={() => setShowDrawer(true)} />
          ) : null}

          {hasSavedTemplate && analysis ? (
            <LogisticsPlanStatusCard
              analysis={analysis}
              activeTemplate={activeTemplate}
              filterMode={filterMode}
              onFilterModeChange={setFilterMode}
              quoteMarketCode={quoteMarketCode}
              onOpenStrategy={() => setShowDrawer(true)}
              pipelineProgress={pipeline.progress}
              quoteResults={quoteResults}
            />
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
            <div className="flex items-center gap-2 py-12 text-sm text-ink-subtle">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在生成 AI 物流方案…
            </div>
          ) : error && !analysis ? (
            <div className="rounded-[var(--radius-card)] border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
              {error}
              <Button
                size="sm"
                variant="secondary"
                className="ml-3"
                onClick={() => void load(false)}
              >
                重试
              </Button>
            </div>
          ) : hasSavedTemplate && analysis ? (
            <LogisticsDecisionList
              analysis={analysis}
              filterMode={filterMode}
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
            />
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

export default function LogisticsPage() {
  return <LogisticsContent />;
}
