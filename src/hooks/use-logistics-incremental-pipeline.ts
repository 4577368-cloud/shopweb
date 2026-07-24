"use client";

import { useCallback, useRef, useState } from "react";
import type { LogisticsAcceptDecisionRequest, LogisticsEstimateResult } from "@/lib/api";
import {
  canAutoAcceptVariant,
  computeNeedsWork,
  countPipelineSkippedVariants,
  INITIAL_PIPELINE_PROGRESS,
  type LogisticsPipelineProgress,
  type ProductPipelineWork,
} from "@/lib/logistics/incremental-pipeline";
import {
  collectIngestingVariantIds,
  INGESTING_RETRY_DELAY_MS,
  mapWithConcurrency,
  PIPELINE_PRODUCT_CONCURRENCY,
  sleepMs,
} from "@/lib/logistics/estimate-batch";
import type { LogisticsAnalysis, VariantLogisticsDecision } from "@/lib/types";

type FetchQuotesFn = (
  variantIds?: string[],
  signal?: AbortSignal
) => Promise<Map<string, LogisticsEstimateResult> | null>;

type AcceptFn = (
  body: LogisticsAcceptDecisionRequest
) => Promise<{ analysis: LogisticsAnalysis; acceptedCount: number }>;

export function useLogisticsIncrementalPipeline({
  shopName,
  analysis,
  templateScopeKey,
  quoteResults,
  fetchQuotesForVariants,
  acceptDecision,
  setAnalysis,
  showToast,
}: {
  shopName: string;
  analysis: LogisticsAnalysis | null;
  templateScopeKey: string;
  quoteResults: Map<string, LogisticsEstimateResult>;
  fetchQuotesForVariants: FetchQuotesFn;
  acceptDecision: AcceptFn;
  setAnalysis: (analysis: LogisticsAnalysis) => void;
  showToast: (message: string) => void;
}) {
  const [progress, setProgress] = useState<LogisticsPipelineProgress>(
    INITIAL_PIPELINE_PROGRESS
  );
  const ranScopeRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const isCancelled = useCallback(
    () => cancelledRef.current || abortRef.current?.signal.aborted === true,
    []
  );

  const pipelineRunning = progress.phase === "running";
  const pipelineActive =
    progress.phase === "waiting" || progress.phase === "running";

  const alreadyRanForScope = useCallback(
    (scopeKey: string) => ranScopeRef.current === scopeKey,
    []
  );

  const resetScopeRun = useCallback(() => {
    ranScopeRef.current = null;
  }, []);

  const runIncrementalPipeline = useCallback(
    async (options?: { force?: boolean }) => {
      if (!shopName || !analysis || !templateScopeKey) return;
      if (runningRef.current) return;
      if (!options?.force && ranScopeRef.current === templateScopeKey) return;

      const works = computeNeedsWork(analysis, quoteResults);
      const skipped = countPipelineSkippedVariants(analysis);

      if (works.length === 0) {
        ranScopeRef.current = templateScopeKey;
        setProgress({
          phase: "done",
          productIndex: 0,
          productTotal: 0,
          currentProductId: null,
          currentProductTitle: null,
          currentSkuStep: null,
          stats: {
            autoAccepted: 0,
            pendingReview: 0,
            failed: 0,
            skipped,
          },
          error: null,
        });
        return;
      }

      abortRef.current = new AbortController();
      cancelledRef.current = false;
      runningRef.current = true;
      setProgress({
        phase: "running",
        productIndex: 0,
        productTotal: works.length,
        currentProductId: works[0]?.productId ?? null,
        currentProductTitle: works[0]?.title ?? null,
        currentSkuStep: null,
        stats: { autoAccepted: 0, pendingReview: 0, failed: 0, skipped },
        error: null,
      });

      const stats = {
        autoAccepted: 0,
        pendingReview: 0,
        failed: 0,
        skipped,
      };
      let latestQuotes = new Map(quoteResults);
      let completedProducts = 0;
      const activeProductIds = new Set<string>();
      const workTitleById = new Map(works.map((w) => [w.productId, w.title]));
      let lockChain = Promise.resolve();

      const withLock = async <T>(fn: () => T | Promise<T>): Promise<T> => {
        const run = lockChain.then(fn, fn);
        lockChain = run.then(
          () => undefined,
          () => undefined
        );
        return run;
      };

      const resolveActiveTitle = (): string | null => {
        if (activeProductIds.size !== 1) return null;
        const id = [...activeProductIds][0];
        return id ? (workTitleById.get(id) ?? null) : null;
      };

      const syncProgress = (patch?: Partial<LogisticsPipelineProgress>) => {
        if (isCancelled()) return;
        setProgress((prev) => ({
          ...prev,
          phase: "running",
          productIndex: completedProducts,
          productTotal: works.length,
          activeProductIds: [...activeProductIds],
          currentProductId:
            activeProductIds.size === 1 ? [...activeProductIds][0]! : null,
          currentProductTitle: resolveActiveTitle(),
          stats: { ...stats },
          ...patch,
        }));
      };

      const processProduct = async (work: ProductPipelineWork) => {
        if (isCancelled()) return;

        activeProductIds.add(work.productId);
        syncProgress({
          currentProductTitle: work.title,
          currentSkuStep:
            work.quoteVariantIds.length > 0
              ? "quote"
              : work.acceptVariantIds.length > 0
                ? "accept"
                : null,
        });

        try {
          if (work.quoteVariantIds.length > 0) {
            if (isCancelled()) return;
            syncProgress({ currentSkuStep: "quote" });

            let fetched: Map<string, LogisticsEstimateResult> | null = null;
            try {
              fetched = await fetchQuotesForVariants(
                work.quoteVariantIds,
                abortRef.current?.signal
              );
            } catch (err) {
              if (
                isCancelled() ||
                (err instanceof Error && err.name === "AbortError")
              ) {
                return;
              }
              await withLock(() => {
                stats.failed += work.quoteVariantIds.length;
              });
              return;
            }

            await withLock(() => {
              if (fetched === null) {
                stats.failed += work.quoteVariantIds.length;
                return;
              }
              latestQuotes = new Map([...latestQuotes, ...fetched]);
              for (const skuId of work.quoteVariantIds) {
                const result = fetched.get(skuId);
                if (result?.quoteStatus === "INGESTING") continue;
                if (!result?.recommendedLine) stats.failed += 1;
              }
            });
          }

          if (isCancelled()) return;

          const autoAcceptIds = await withLock(() =>
            collectAutoAcceptIds(work, latestQuotes, analysis)
          );

          if (autoAcceptIds.length > 0) {
            syncProgress({ currentSkuStep: "accept" });

            const quotes: NonNullable<LogisticsAcceptDecisionRequest["quotes"]> =
              {};
            await withLock(() => {
              for (const skuId of autoAcceptIds) {
                const quote = latestQuotes.get(skuId);
                if (!quote?.recommendedLine) continue;
                quotes[skuId] = {
                  recommendedLine: quote.recommendedLine,
                  alternativeLines: quote.alternativeLines,
                  quoteStatus: quote.quoteStatus,
                };
              }
            });

            const acceptIds = Object.keys(quotes);
            if (acceptIds.length > 0) {
              if (isCancelled()) return;
              await withLock(async () => {
                try {
                  const result = await acceptDecision({
                    shopName,
                    targetScope: "VARIANTS",
                    variantIds: acceptIds,
                    quotes,
                  });
                  setAnalysis(result.analysis);
                  stats.autoAccepted += result.acceptedCount;
                } catch {
                  stats.failed += acceptIds.length;
                }
              });
            }
          }
        } finally {
          activeProductIds.delete(work.productId);
          completedProducts += 1;
          syncProgress({ currentSkuStep: null });
        }
      };

      try {
        await mapWithConcurrency(
          works,
          PIPELINE_PRODUCT_CONCURRENCY,
          processProduct,
          isCancelled
        );

        if (isCancelled()) {
          return;
        }

        const allQuotedIds = works.flatMap((w) => w.quoteVariantIds);
        const ingestingIds = collectIngestingVariantIds(latestQuotes, allQuotedIds);
        if (ingestingIds.length > 0) {
          if (!isCancelled()) {
            showToast(
              `${ingestingIds.length} 个 SKU 入库中，约 ${Math.round(INGESTING_RETRY_DELAY_MS / 1000)} 秒后自动重试报价`
            );
            setProgress((prev) => ({
              ...prev,
              currentSkuStep: "quote",
              currentProductTitle: null,
              stats: { ...stats, ingestingRetry: ingestingIds.length },
            }));
          }
          try {
            await sleepMs(INGESTING_RETRY_DELAY_MS, abortRef.current?.signal);
          } catch {
            return;
          }
          if (!isCancelled()) {
            try {
              const retried = await fetchQuotesForVariants(
                ingestingIds,
                abortRef.current?.signal
              );
              if (retried) {
                latestQuotes = new Map([...latestQuotes, ...retried]);
              }
            } catch {
              // Ingesting retry is best-effort — main pass already completed.
            }
          }
        }

        ranScopeRef.current = templateScopeKey;
        setProgress((prev) => ({
          ...prev,
          phase: "done",
          currentSkuStep: null,
          stats: { ...stats },
        }));

        if (stats.autoAccepted > 0) {
          showToast(`已自动确认 ${stats.autoAccepted} 个普货 SKU 物流方案`);
        }
      } catch (err) {
        if (isCancelled() || (err instanceof Error && err.name === "AbortError")) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "物流自动匹配失败，请稍后重试";
        setProgress((prev) => ({
          ...prev,
          phase: "error",
          error: message,
          stats: { ...stats },
        }));
      } finally {
        runningRef.current = false;
        abortRef.current = null;
      }
    },
    [
      shopName,
      analysis,
      templateScopeKey,
      quoteResults,
      fetchQuotesForVariants,
      acceptDecision,
      setAnalysis,
      showToast,
      isCancelled,
    ]
  );

  const startWaiting = useCallback(() => {
    setProgress((prev) =>
      prev.phase === "idle"
        ? { ...INITIAL_PIPELINE_PROGRESS, phase: "waiting" }
        : prev
    );
  }, []);

  const cancelPipeline = useCallback(() => {
    if (!runningRef.current && progress.phase !== "running") return;
    cancelledRef.current = true;
    abortRef.current?.abort();
    runningRef.current = false;
    setProgress(INITIAL_PIPELINE_PROGRESS);
    showToast("已取消运费预估");
  }, [progress.phase, showToast]);

  return {
    progress,
    pipelineActive,
    pipelineRunning,
    runIncrementalPipeline,
    alreadyRanForScope,
    resetScopeRun,
    startWaiting,
    cancelPipeline,
  };
}

function collectAutoAcceptIds(
  work: ProductPipelineWork,
  quotes: Map<string, LogisticsEstimateResult>,
  analysis: LogisticsAnalysis | null
): string[] {
  const variantById = new Map<string, VariantLogisticsDecision>();
  for (const product of analysis?.productProfiles ?? []) {
    if (product.thirdPlatformItemId !== work.productId) continue;
    for (const variant of product.variantDecisions ?? []) {
      variantById.set(variant.thirdPlatformSkuId, variant);
    }
  }

  const ids = new Set<string>(work.acceptVariantIds);
  for (const skuId of work.quoteVariantIds) {
    const variant = variantById.get(skuId);
    if (!variant) continue;
    if (canAutoAcceptVariant(variant, quotes.get(skuId))) {
      ids.add(skuId);
    }
  }
  return [...ids];
}
