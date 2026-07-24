"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { MeasureOverride } from "@/components/logistics/logistics-decision-list";
import { useLogisticsIncrementalPipeline } from "@/hooks/use-logistics-incremental-pipeline";
import {
  api,
  readableError,
  type LogisticsAcceptDecisionRequest,
  type LogisticsEstimateResult,
} from "@/lib/api";
import type { LogisticsFilterMode } from "@/lib/logistics/display";
import {
  buildAcceptQuotePayload,
  collectBatchAcceptableVariants,
  collectProductQuotableVariantIds,
} from "@/lib/logistics/display";
import {
  GOODS_INGESTING_MESSAGE,
  quoteStatusForGoodsBlock,
  userFacingQuoteErrorMessage,
} from "@/lib/logistics/estimate-goods-block";
import {
  chunkEstimateVariants,
  ESTIMATE_CHUNK_CONCURRENCY,
  mapWithConcurrency,
} from "@/lib/logistics/estimate-batch";
import { mergeQuoteAcceptancesIntoAnalysis } from "@/lib/logistics/merge-acceptances-into-analysis";
import {
  readMeasureOverrides,
  writeMeasureOverrides,
} from "@/lib/logistics/measure-overrides-storage";
import type { LogisticsWorkflowStep } from "@/lib/logistics/page-constants";
import {
  applyCatalogIngestQuoteReset,
  clearLogisticsQuotesForTemplateSwitch,
  mergeQuoteResultsIntoAnalysis,
  readQuoteCache,
  stripStaleGoodsBlockedQuotesForIdentities,
  writeQuoteCache,
} from "@/lib/logistics/quote-cache";
import { enrichVariantsWithMeasures } from "@/lib/logistics/variant-measures";
import {
  enrichVariantsWithEstimateGoodsIds,
  ingestProductSourceForLogistics,
} from "@/lib/logistics/resolve-estimate-goods-id";
import {
  buildEstimateParams,
  packagingToIncrementList,
  resolveQuoteMarketCode,
} from "@/lib/logistics/template-params";
import { resolveTangbuyCountryId } from "@/lib/logistics/tangbuy-country";
import {
  setLogisticsMirrorCache,
} from "@/lib/logistics/logistics-mirror-cache";
import { setLogisticsSession } from "@/lib/logistics/logistics-session-cache";
import type {
  LogisticsAnalysis,
  LogisticsTemplate,
  PricingTemplate,
  ProductLogisticsProfile,
  VariantLogisticsDecision,
} from "@/lib/types";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface UseLogisticsQuoteEstimateParams {
  shopName: string;
  analysis: LogisticsAnalysis | null;
  setAnalysis: Dispatch<SetStateAction<LogisticsAnalysis | null>>;
  activeTemplate: LogisticsTemplate | null;
  pricingTemplate: PricingTemplate | null;
  templates: LogisticsTemplate[];
  showToast: (message: string) => void;
  t: TranslateFn;
  setFilterMode: Dispatch<SetStateAction<LogisticsFilterMode>>;
  setWorkflowStep: (step: LogisticsWorkflowStep) => void;
}

/** Quote cache, estimate API, accept decisions, and incremental pipeline. */
export function useLogisticsQuoteEstimate({
  shopName,
  analysis,
  setAnalysis,
  activeTemplate,
  pricingTemplate,
  templates,
  showToast,
  t,
  setFilterMode,
  setWorkflowStep,
}: UseLogisticsQuoteEstimateParams) {
  const [quoteResults, setQuoteResults] = useState<
    Map<string, LogisticsEstimateResult>
  >(new Map());
  const [quoting, setQuoting] = useState(false);
  const [quotingProductId, setQuotingProductId] = useState<string | null>(null);
  const [ingestingProductId, setIngestingProductId] = useState<string | null>(
    null
  );
  const [quotingVariantId, setQuotingVariantId] = useState<string | null>(null);
  const [quoteRevealVariantIds, setQuoteRevealVariantIds] = useState<Set<string>>(
    () => new Set()
  );
  const [accepting, setAccepting] = useState(false);
  const [batchFailedVariantIds, setBatchFailedVariantIds] = useState<string[]>(
    []
  );
  const [quoteMarketCode, setQuoteMarketCode] = useState<string | null>(null);
  const [measureOverrides, setMeasureOverrides] = useState<
    Map<string, MeasureOverride>
  >(new Map());
  const [selectedLineByVariant, setSelectedLineByVariant] = useState<
    Map<string, string>
  >(new Map());

  const prevScopeKeyRef = useRef<string | null>(null);
  const skipQuoteCacheHydrateRef = useRef(false);
  const suppressScopeSwitchToastRef = useRef(false);
  const pendingPipelineResetRef = useRef(false);

  const handleSelectLine = useCallback((variantId: string, lineKey: string) => {
    setSelectedLineByVariant((prev) => {
      const next = new Map(prev);
      next.set(variantId, lineKey);
      return next;
    });
  }, []);

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
      prevScopeKeyRef.current = templateScopeKey || null;
      return;
    }

    if (prevScopeKeyRef.current && prevScopeKeyRef.current !== templateScopeKey) {
      skipQuoteCacheHydrateRef.current = true;
      pendingPipelineResetRef.current = true;
      setQuoteResults(new Map());
      writeQuoteCache(shopName, templateScopeKey, new Map());
      setAnalysis((prev) => {
        if (!prev) return prev;
        return clearLogisticsQuotesForTemplateSwitch(prev);
      });
      if (!suppressScopeSwitchToastRef.current) {
        showToast(t("logistics.templateSwitchRecalcHint"));
      }
      suppressScopeSwitchToastRef.current = false;
    }
    prevScopeKeyRef.current = templateScopeKey;

    if (skipQuoteCacheHydrateRef.current) {
      skipQuoteCacheHydrateRef.current = false;
      return;
    }

    const cached = readQuoteCache(shopName, templateScopeKey);
    setAnalysis((prev) => {
      if (!prev) {
        setQuoteResults(cached);
        return prev;
      }
      const { analysis: stripped, quoteResults: sanitized } =
        stripStaleGoodsBlockedQuotesForIdentities(prev, cached, shopName);
      const merged = mergeQuoteResultsIntoAnalysis(stripped, sanitized);
      setQuoteResults(sanitized);
      if (sanitized.size > 0 || cached.size > 0) {
        writeQuoteCache(shopName, templateScopeKey, sanitized);
      }
      return merged;
    });
  }, [templateScopeKey, shopName, activeTemplate, showToast, t, setAnalysis]);

  useEffect(() => {
    if (shopName) setMeasureOverrides(readMeasureOverrides(shopName));
  }, [shopName]);

  useEffect(() => {
    if (shopName) writeMeasureOverrides(shopName, measureOverrides);
  }, [shopName, measureOverrides]);

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
      opts?: { includeExceptions?: boolean; signal?: AbortSignal; bulkMode?: boolean }
    ) => {
      const signal =
        overrides instanceof AbortSignal ? overrides : opts?.signal;
      const overrideMap =
        overrides instanceof AbortSignal
          ? measureOverrides
          : (overrides ?? measureOverrides);
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
        showToast(t("logistics.toastCountryIdMissing", { market: marketCode }));
        return null;
      }

      const payloadVariants = targets.map(
        ({ decisionStatus: _status, ...variant }) => ({ ...variant })
      );
      await enrichVariantsWithMeasures(payloadVariants);
      if (signal?.aborted) return null;
      const resolvedVariants = await enrichVariantsWithEstimateGoodsIds(
        payloadVariants,
        shopName,
        undefined,
        opts?.bulkMode ? { bulkMode: true } : undefined
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
        type QuotableVariant = (typeof quotableVariants)[number];
        const toEstimatePayload = ({
          estimateGoodsId,
          estimateGoodsError: _err,
          titleHint: _title,
          thirdPlatformItemId: _itemId,
          sourceIdentity: _identity,
          ...variant
        }: QuotableVariant) => ({
          ...variant,
          tangbuyGoodsId: estimateGoodsId ?? variant.tangbuyGoodsId,
        });

        const chunks = chunkEstimateVariants(quotableVariants);
        await mapWithConcurrency(
          chunks,
          ESTIMATE_CHUNK_CONCURRENCY,
          async (chunk) => {
            if (signal?.aborted) return;
            try {
              const response = await api.estimateLogistics(
                {
                  shopName,
                  countryCode: params.countryCode,
                  countryId: params.countryId,
                  shippingOption: params.shippingOption,
                  packaging: params.packaging,
                  quoteCurrency:
                    pricingTemplate?.targetCurrency?.trim().toUpperCase() || "USD",
                  variants: chunk.map(toEstimatePayload),
                  needOtherLine: true,
                  needMeasure: chunk.some(
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
            } catch (err) {
              if (signal?.aborted) return;
              const message = readableError(err);
              for (const variant of chunk) {
                resultsMap.set(variant.thirdPlatformSkuId, {
                  thirdPlatformSkuId: variant.thirdPlatformSkuId,
                  quoteStatus: "FAILED",
                  errorMessage: message,
                });
              }
            }
          },
          () => signal?.aborted === true
        );
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
      setBatchFailedVariantIds((prev) => {
        if (prev.length === 0) return prev;
        return prev.filter((id) => {
          const fresh = resultsMap.get(id);
          if (!fresh) return true;
          const hasLine = Boolean(
            fresh.recommendedLine?.lineName?.trim() ||
              fresh.recommendedLine?.lineCode?.trim()
          );
          return !hasLine;
        });
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
      setAnalysis,
      t,
    ]
  );

  const fetchQuotesForPipeline = useCallback(
    (
      variantIds?: string[],
      signal?: AbortSignal,
      options?: { bulkMode?: boolean }
    ) =>
      fetchQuotesForVariants(variantIds, measureOverrides, {
        includeExceptions: true,
        signal,
        bulkMode: options?.bulkMode !== false,
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
    setAnalysis: (next) => setAnalysis(next),
    showToast,
  });

  useEffect(() => {
    if (!pendingPipelineResetRef.current) return;
    pendingPipelineResetRef.current = false;
    pipeline.resetScopeRun();
    setWorkflowStep("estimate");
  }, [templateScopeKey, pipeline.resetScopeRun, setWorkflowStep]);

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
          ? t("logistics.toastRoutesFetched", {
              withLine,
              total: resultsMap.size,
              country: params?.countryCode ?? "",
              speed: params?.shippingOption ?? "",
            })
          : ingestingCount > 0
            ? GOODS_INGESTING_MESSAGE
            : userFacingQuoteErrorMessage(
                results.find((r) => r.errorMessage)?.errorMessage
              ) ||
              t("logistics.toastNoRoutesReturned", {
                total: resultsMap.size,
                country: params?.countryCode ?? "",
              })
      );
      const quotedIds =
        variantIds?.filter((id) => resultsMap.get(id)?.recommendedLine) ?? [];
      if (quotedIds.length > 0) {
        setQuoteRevealVariantIds((prev) => new Set([...prev, ...quotedIds]));
        window.setTimeout(() => {
          setQuoteRevealVariantIds((prev) => {
            const next = new Set(prev);
            for (const id of quotedIds) next.delete(id);
            return next;
          });
        }, 1000);
      }
      if (!variantIds?.length || variantIds.length > 1) {
        setFilterMode("all");
      }
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setQuoting(false);
    }
  };

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
    setQuotingVariantId(variant.thirdPlatformSkuId);
    void handleFetchQuotes([variant.thirdPlatformSkuId], override).finally(() => {
      setQuotingVariantId(null);
    });
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

  const handleIngestProductSource = (
    productId: string,
    profile: ProductLogisticsProfile
  ) => {
    if (!shopName?.trim()) {
      showToast(t("logistics.tokenMissing"));
      return;
    }
    setIngestingProductId(productId);
    void (async () => {
      try {
        const { ready, ingesting } = await ingestProductSourceForLogistics({
          shopName,
          profile,
        });
        if (ready) {
          setQuoteResults((prevQuotes) => {
            setAnalysis((prevAnalysis) => {
              const { analysis: nextAnalysis, quoteResults: nextQuotes } =
                applyCatalogIngestQuoteReset(prevAnalysis, productId, prevQuotes);
              if (shopName && templateScopeKey) {
                writeQuoteCache(shopName, templateScopeKey, nextQuotes);
              }
              setQuoteResults(nextQuotes);
              return nextAnalysis ?? prevAnalysis;
            });
            return prevQuotes;
          });
          showToast(t("logistics.toastIngestSuccess"));
        } else if (ingesting) {
          showToast(t("logistics.toastIngestPending"));
        } else {
          showToast(t("logistics.toastIngestFailed"));
        }
      } catch {
        showToast(t("logistics.toastIngestFailed"));
      } finally {
        setIngestingProductId(null);
      }
    })();
  };

  const handleCatalogIngestComplete = useCallback(
    (profile: ProductLogisticsProfile) => {
      const title = profile.title?.trim() || profile.thirdPlatformItemId;
      const productId = profile.thirdPlatformItemId;
      setQuoteResults((prevQuotes) => {
        setAnalysis((prevAnalysis) => {
          const { analysis: nextAnalysis, quoteResults: nextQuotes } =
            applyCatalogIngestQuoteReset(prevAnalysis, productId, prevQuotes);
          if (shopName && templateScopeKey) {
            writeQuoteCache(shopName, templateScopeKey, nextQuotes);
          }
          setQuoteResults(nextQuotes);
          return nextAnalysis ?? prevAnalysis;
        });
        return prevQuotes;
      });
      showToast(t("logistics.toastIngestReadyForProduct", { title }));
    },
    [shopName, templateScopeKey, showToast, t, setAnalysis]
  );

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
      const snapshot = analysis;
      const quotes = quotePayload
        ? { [variant.thirdPlatformSkuId]: quotePayload }
        : undefined;
      if (snapshot && quotes) {
        setAnalysis(
          mergeQuoteAcceptancesIntoAnalysis(snapshot, quotes, [
            variant.thirdPlatformSkuId,
          ])
        );
      }
      const result = await api.acceptLogisticsDecision({
        shopName,
        targetScope: "VARIANTS",
        variantIds: [variant.thirdPlatformSkuId],
        quotes,
      });
      setAnalysis(result.analysis);
      const cachePayload = {
        analysis: result.analysis,
        templates,
        pricingTemplate,
      };
      setLogisticsMirrorCache(shopName, cachePayload);
      setLogisticsSession(shopName, cachePayload);
      setFilterMode("all");
      showToast(
        result.acceptedCount > 0
          ? t("logistics.toastAcceptAiDone")
          : t("logistics.toastAcceptAiNone")
      );
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setAccepting(false);
    }
  };

  const handleAcceptAllReady = async (opts?: {
    onProgress?: (
      current: number,
      total: number,
      success: number,
      failed: number
    ) => void;
    isCancelled?: () => boolean;
    onlyVariantIds?: string[];
  }) => {
    if (accepting || !analysis) return;
    const allTargets = collectBatchAcceptableVariants(analysis, quoteResults);
    const targets =
      opts?.onlyVariantIds && opts.onlyVariantIds.length > 0
        ? allTargets.filter((v) =>
            opts.onlyVariantIds!.includes(v.thirdPlatformSkuId)
          )
        : allTargets;
    if (targets.length === 0) {
      showToast(t("logistics.toastNoPendingQuote"));
      return;
    }

    const quotes: NonNullable<LogisticsAcceptDecisionRequest["quotes"]> = {};
    const variantIds: string[] = [];
    for (const variant of targets) {
      const result = quoteResults.get(variant.thirdPlatformSkuId);
      const payload = buildAcceptQuotePayload(
        variant,
        result,
        selectedLineByVariant.get(variant.thirdPlatformSkuId)
      );
      if (!payload?.recommendedLine) continue;
      quotes[variant.thirdPlatformSkuId] = payload;
      variantIds.push(variant.thirdPlatformSkuId);
    }

    const total = variantIds.length;
    const skippedNoQuote = targets.length - total;
    if (total === 0) {
      showToast(t("logistics.toastAcceptMissingQuoteLines"));
      return;
    }

    opts?.onProgress?.(0, total, 0, 0);
    setAccepting(true);
    setBatchFailedVariantIds([]);

    const snapshot = analysis;
    setAnalysis(mergeQuoteAcceptancesIntoAnalysis(snapshot, quotes, variantIds));
    setFilterMode("all");

    try {
      if (opts?.isCancelled?.()) {
        setAnalysis(snapshot);
        showToast(t("logistics.toastBatchAcceptCancelled"));
        return;
      }

      const result = await api.acceptLogisticsDecision({
        shopName,
        targetScope: "VARIANTS",
        variantIds,
        quotes,
      });

      setAnalysis(result.analysis);
      const payload = {
        analysis: result.analysis,
        templates,
        pricingTemplate,
      };
      setLogisticsMirrorCache(shopName, payload);
      setLogisticsSession(shopName, payload);

      opts?.onProgress?.(
        total,
        total,
        result.acceptedCount,
        total - result.acceptedCount
      );

      if (result.acceptedCount < total) {
        setBatchFailedVariantIds(variantIds.slice(result.acceptedCount));
      }

      if (result.acceptedCount > 0) {
        showToast(
          t("logistics.toastBatchAccepted", { accepted: result.acceptedCount })
        );
      } else if (skippedNoQuote > 0 && total === 0) {
        showToast(t("logistics.toastAcceptMissingQuoteLines"));
      } else {
        showToast(t("logistics.toastBatchFailed", { failed: total }));
        setAnalysis(snapshot);
      }
    } catch (err) {
      setAnalysis(snapshot);
      showToast(readableError(err));
    } finally {
      setAccepting(false);
    }
  };

  const handleStartEstimate = useCallback(() => {
    pipeline.resetScopeRun();
    void pipeline.runIncrementalPipeline({ force: true });
  }, [pipeline.resetScopeRun, pipeline.runIncrementalPipeline]);

  const handleRetryPipeline = useCallback(() => {
    handleStartEstimate();
  }, [handleStartEstimate]);

  return {
    quoteResults,
    quoting,
    quotingProductId,
    ingestingProductId,
    quotingVariantId,
    quoteRevealVariantIds,
    accepting,
    batchFailedVariantIds,
    quoteMarketCode,
    setQuoteMarketCode,
    measureOverrides,
    setMeasureOverrides,
    selectedLineByVariant,
    handleSelectLine,
    templateScopeKey,
    pipeline,
    suppressScopeSwitchToastRef,
    handleFetchQuotes,
    handleFetchQuoteForVariant,
    handleFetchQuotesForProduct,
    handleIngestProductSource,
    handleCatalogIngestComplete,
    handleAcceptAi,
    handleAcceptAllReady,
    handleStartEstimate,
    handleRetryPipeline,
  };
}
