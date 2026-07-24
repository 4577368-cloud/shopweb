"use client";

import { useCallback, useRef, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import type { TranslateFn } from "@/i18n/server";
import { api, readableError } from "@/lib/api";
import {
  setSkuOverviewSession,
} from "@/lib/sku-align/overview-session-cache";
import {
  fetchSourceSkuMatrixResult,
  resolveSkuDetailUrl,
} from "@/lib/source-sku-matrix";
import { enqueueSkuAlignRun } from "@/lib/sku-align-v1/run-client";
import type { SkuProductOverview } from "@/lib/types";
import type { ScanTaskView } from "@/components/workbench/scan-stage";

const RECENT_MAX = 6;

const TASK_IDS = { overview: "overview", align: "align", prewarm: "prewarm" } as const;

function initialTasks(t: TranslateFn): ScanTaskView[] {
  return [
    { id: TASK_IDS.overview, label: t("sku.scanTaskOverview"), status: "pending" },
    { id: TASK_IDS.align, label: t("sku.scanTaskAlign"), status: "pending" },
    { id: TASK_IDS.prewarm, label: t("sku.scanTaskPrewarm"), status: "pending" },
  ];
}

function alignSummaryText(
  t: TranslateFn,
  run: { suggestedCount: number; unmappedCount: number; noSourceCount: number }
): string {
  return t("sku.scanResultAlignSummary", {
    pending: run.suggestedCount,
    unbound: run.unmappedCount,
    noSource: run.noSourceCount,
  });
}

function alignProgressText(
  t: TranslateFn,
  processed: number,
  total: number
): string {
  return t("sku.scanAlignProgress", { processed, total });
}

async function runPrewarmInBackground(
  shopName: string,
  t: TranslateFn,
  patch: (id: string, p: Partial<ScanTaskView>) => void,
  shouldAbort: () => boolean
): Promise<void> {
  if (shouldAbort()) {
    patch(TASK_IDS.prewarm, { status: "skipped" });
    return;
  }
  patch(TASK_IDS.prewarm, { status: "running" });
  try {
    const fresh = await api.getSkuOverview(shopName);
    setSkuOverviewSession(shopName, fresh);
    const detailUrls = Array.from(
      new Set(
        fresh
          .map((p) => resolveSkuDetailUrl(p.detailUrl, p.tangbuyProductId))
          .filter((url): url is string => Boolean(url))
      )
    );
    await Promise.all(
      detailUrls.map((url) => fetchSourceSkuMatrixResult(url).catch(() => null))
    );
    patch(TASK_IDS.prewarm, {
      status: shouldAbort() ? "skipped" : "done",
      resultText: t("sku.scanResultPrewarmDone", { count: detailUrls.length }),
    });
  } catch (err) {
    patch(TASK_IDS.prewarm, {
      status: "failed",
      error: readableError(err),
    });
  }
}

/**
 * Phase 1 client-orchestrated real scan for /sku-align. Runs three real steps over existing endpoints:
 *   1) getSkuOverview — find bound products/variants
 *   2) POST /sku-align/v1/runs — V1 engine writes review + legacy bindings, poll until done
 *   3) re-read overview + prewarm itemGet SKU matrix (background — does not block scan completion)
 * Fail-open: any per-product failure is skipped, never blocks; cancel stops scheduling further work.
 */
export function useSkuAlignScan(shopName: string) {
  const t = useT();
  const [tasks, setTasks] = useState<ScanTaskView[]>(() => initialTasks(t));
  const [recent, setRecent] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);

  const start = useCallback(async () => {
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    setRecent([]);
    setTasks(initialTasks(t));

    const patch = (id: string, p: Partial<ScanTaskView>) =>
      setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...p } : task)));
    const finalize = () => {
      setRunning(false);
      setDone(true);
    };

    // Step 1 — overview
    patch(TASK_IDS.overview, { status: "running" });
    let overview: SkuProductOverview[] = [];
    try {
      overview = await api.getSkuOverview(shopName);
      setSkuOverviewSession(shopName, overview);
      const variants = overview.reduce((a, p) => a + p.variants.length, 0);
      patch(TASK_IDS.overview, {
        status: "done",
        resultText: t("sku.scanResultOverview", {
          products: overview.length,
          variants,
        }),
      });
      void api.backfillBindingSnapshots(shopName).catch(() => null);
    } catch (err) {
      patch(TASK_IDS.overview, { status: "failed", error: readableError(err) });
      patch(TASK_IDS.align, { status: "skipped" });
      patch(TASK_IDS.prewarm, { status: "skipped" });
      finalize();
      return;
    }
    if (cancelRef.current) {
      finalize();
      return;
    }
    if (overview.length === 0) {
      patch(TASK_IDS.align, {
        status: "skipped",
        resultText: t("sku.scanResultNoProducts"),
      });
      patch(TASK_IDS.prewarm, { status: "skipped" });
      finalize();
      return;
    }

    // Step 2 — V1 alignment run (review + legacy dual-write)
    patch(TASK_IDS.align, { status: "running" });
    const productIds = overview.map((p) => p.thirdPlatformItemId);
    try {
      const run = await enqueueSkuAlignRun(
        shopName,
        {
          triggerType: "PAGE_ENTER",
          scopeType: "PRODUCT_BATCH",
          scopeIds: productIds,
        },
        () => cancelRef.current,
        (status) => {
          const processed =
            status.productSummaries?.length ??
            status.matchedCount ??
            0;
          patch(TASK_IDS.align, {
            resultText: alignProgressText(t, processed, productIds.length),
          });
        }
      );
      if (!run) {
        patch(TASK_IDS.align, {
          status: "skipped",
          resultText: t("sku.scanResultAlignSkipped"),
        });
      } else {
        const summary = alignSummaryText(t, run);
        setRecent((prev) =>
          [t("sku.scanRecentAlignDone", { summary }), ...prev].slice(0, RECENT_MAX)
        );
        patch(TASK_IDS.align, {
          status: cancelRef.current ? "skipped" : run.runStatus === "FAILED" ? "failed" : "done",
          resultText: t("sku.scanResultAlignDone", {
            matched: run.matchedCount,
            summary,
          }),
          error:
            run.runStatus === "FAILED"
              ? run.errorSummary ?? t("sku.scanResultAlignFailed")
              : undefined,
        });
        if (!cancelRef.current) {
          try {
            const aligned = await api.getSkuOverview(shopName);
            setSkuOverviewSession(shopName, aligned);
          } catch {
            /* page load will refetch */
          }
        }
      }
    } catch (err) {
      patch(TASK_IDS.align, { status: "failed", error: readableError(err) });
    }

    // Scan is usable after align — prewarm continues in background.
    finalize();
    void runPrewarmInBackground(shopName, t, patch, () => cancelRef.current);
  }, [shopName, t]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { tasks, recent, running, done, start, cancel };
}
