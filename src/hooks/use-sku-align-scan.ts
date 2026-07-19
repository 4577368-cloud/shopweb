"use client";

import { useCallback, useRef, useState } from "react";
import { api, readableError } from "@/lib/api";
import type { SkuProductOverview } from "@/lib/types";
import type { ScanTaskView } from "@/components/workbench/scan-stage";

const CONCURRENCY = 3;
const RECENT_MAX = 6;

const TASK_IDS = { overview: "overview", align: "align", prewarm: "prewarm" } as const;

function initialTasks(): ScanTaskView[] {
  return [
    { id: TASK_IDS.overview, label: "读取已绑定商品", status: "pending" },
    { id: TASK_IDS.align, label: "自动尝试对齐 SKU", status: "pending" },
    { id: TASK_IDS.prewarm, label: "预热货源明细", status: "pending" },
  ];
}

/**
 * Phase 1 client-orchestrated real scan for /sku-align. Runs three real steps over existing endpoints:
 *   1) getSkuOverview — find bound products/variants
 *   2) autoAlignSku per bound product (concurrency-limited, persists RULE bindings, streams "最近完成")
 *   3) re-read overview + prewarm getOfferDetail so the result view's 图/价 are ready
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

    // Step 2 — auto-align per product (concurrency-limited, real streaming)
    patch(TASK_IDS.align, { status: "running" });
    const queue = [...overview];
    let processed = 0;
    let alignedVariants = 0;
    const worker = async () => {
      while (queue.length > 0) {
        if (cancelRef.current) return;
        const p = queue.shift();
        if (!p) return;
        const name = p.title ?? p.thirdPlatformItemId;
        try {
          const res = await api.autoAlignSku(shopName, p.thirdPlatformItemId);
          alignedVariants += res.matchedCount;
          setRecent((prev) =>
            [`${name}：已对齐 ${res.matchedCount}/${res.totalVariants}`, ...prev].slice(
              0,
              RECENT_MAX
            )
          );
        } catch {
          setRecent((prev) => [`${name}：对齐跳过`, ...prev].slice(0, RECENT_MAX));
        } finally {
          processed += 1;
          patch(TASK_IDS.align, {
            resultText: `已处理 ${processed}/${overview.length} 个商品 · 对齐 ${alignedVariants} 个变体`,
          });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, overview.length) }, () => worker())
    );
    patch(TASK_IDS.align, {
      status: cancelRef.current ? "skipped" : "done",
      resultText: `已对齐 ${alignedVariants} 个变体（${processed}/${overview.length} 个商品）`,
    });
    if (cancelRef.current) {
      finalize();
      return;
    }

    // Step 3 — re-read overview + prewarm offer details for the comparison view
    patch(TASK_IDS.prewarm, { status: "running" });
    try {
      const fresh = await api.getSkuOverview(shopName);
      const offerIds = Array.from(
        new Set(
          fresh.flatMap((p) =>
            p.variants
              .map((v) => v.bound?.tangbuyProductId)
              .filter((id): id is string => Boolean(id))
          )
        )
      );
      await Promise.all(offerIds.map((id) => api.getOfferDetail(id).catch(() => null)));
      patch(TASK_IDS.prewarm, {
        status: "done",
        resultText: `货源明细已就绪（${offerIds.length} 个货源）`,
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
