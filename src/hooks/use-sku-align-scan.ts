"use client";

import { useCallback, useRef, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import type { TranslateFn } from "@/i18n/server";
import { api, readableError } from "@/lib/api";
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

/**
 * Phase 1 client-orchestrated real scan for /sku-align. Runs three real steps over existing endpoints:
 *   1) getSkuOverview — find bound products/variants
 *   2) POST /sku-align/v1/runs — V1 engine writes review + legacy bindings, poll until done
 *   3) re-read overview + prewarm itemGet SKU matrix so the result view's 图/价 are ready
 * Fail-open: any per-product failure is skipped, never blocks; cancel stops scheduling further work.
 * No backend/job — progress is tracked from the real calls themselves.
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
      const variants = overview.reduce((a, p) => a + p.variants.length, 0);
      patch(TASK_IDS.overview, {
        status: "done",
        resultText: t("sku.scanResultOverview", {
          products: overview.length,
          variants,
        }),
      });
      // Repair snapshots in the background — must not block step 2 (can take minutes for large shops).
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
    try {
      const productIds = overview.map((p) => p.thirdPlatformItemId);
      const run = await enqueueSkuAlignRun(
        shopName,
        {
          triggerType: "PAGE_ENTER",
          scopeType: "PRODUCT_BATCH",
          scopeIds: productIds,
        },
        () => cancelRef.current
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
      }
    } catch (err) {
      patch(TASK_IDS.align, { status: "failed", error: readableError(err) });
    }
    if (cancelRef.current) {
      finalize();
      return;
    }

    // Step 3 — re-read overview + prewarm itemGet matrices for the comparison view
    patch(TASK_IDS.prewarm, { status: "running" });
    try {
      const fresh = await api.getSkuOverview(shopName);
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
        status: "done",
        resultText: t("sku.scanResultPrewarmDone", { count: detailUrls.length }),
      });
    } catch (err) {
      patch(TASK_IDS.prewarm, { status: "failed", error: readableError(err) });
    }
    finalize();
  }, [shopName, t]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { tasks, recent, running, done, start, cancel };
}
