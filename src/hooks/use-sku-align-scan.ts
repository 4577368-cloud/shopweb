"use client";

import { useCallback, useRef, useState } from "react";
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

function initialTasks(): ScanTaskView[] {
  return [
    { id: TASK_IDS.overview, label: "读取已绑定商品", status: "pending" },
    { id: TASK_IDS.align, label: "静默对齐 SKU（V1）", status: "pending" },
    { id: TASK_IDS.prewarm, label: "预热 itemGet 规格表", status: "pending" },
  ];
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
  const [tasks, setTasks] = useState<ScanTaskView[]>(initialTasks);
  const [recent, setRecent] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);

  const start = useCallback(async () => {
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    setRecent([]);
    setTasks(initialTasks());

    const patch = (id: string, p: Partial<ScanTaskView>) =>
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)));
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
        resultText: `发现 ${overview.length} 个已绑定商品 · ${variants} 个变体`,
      });
      // Repair legacy IMAGE bindings missing title/spec/image snapshots before align/display.
      await api.backfillBindingSnapshots(shopName).catch(() => null);
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
      patch(TASK_IDS.align, { status: "skipped", resultText: "暂无已绑定商品可对齐" });
      patch(TASK_IDS.prewarm, { status: "skipped" });
      finalize();
      return;
    }

    // Step 2 — V1 alignment run (review + legacy dual-write)
    patch(TASK_IDS.align, { status: "running" });
    try {
      const productIds = overview.map((p) => p.thirdPlatformItemId);
      const run = await enqueueSkuAlignRun(shopName, {
        triggerType: "PAGE_ENTER",
        scopeType: "PRODUCT_BATCH",
        scopeIds: productIds,
      });
      if (!run) {
        patch(TASK_IDS.align, {
          status: "skipped",
          resultText: "对齐任务未受理",
        });
      } else {
        const summary = `建议 ${run.suggestedCount} · 未匹配 ${run.unmappedCount} · 无货源 ${run.noSourceCount}`;
        setRecent((prev) =>
          [`对齐完成：${summary}`, ...prev].slice(0, RECENT_MAX)
        );
        patch(TASK_IDS.align, {
          status: cancelRef.current ? "skipped" : run.runStatus === "FAILED" ? "failed" : "done",
          resultText: `已对齐 ${run.matchedCount} 个变体 · ${summary}`,
          error: run.runStatus === "FAILED" ? run.errorSummary ?? "对齐失败" : undefined,
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
        resultText: `itemGet 规格表已预热（${detailUrls.length} 个货源）`,
      });
    } catch (err) {
      patch(TASK_IDS.prewarm, { status: "failed", error: readableError(err) });
    }
    finalize();
  }, [shopName]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { tasks, recent, running, done, start, cancel };
}
