"use client";

import { useCallback, useRef, useState } from "react";
import { api, readableError } from "@/lib/api";
import type { ImageBindingView, MatchJobProgress, ShopMirrorProduct } from "@/lib/types";
import {
  computeShopProductBindingStats,
  indexImageBindings,
} from "@/lib/shop-product-binding-stats";
import type { ScanTaskView } from "@/components/workbench/scan-stage";
import type { ScanSummaryStats } from "@/lib/scan/copilot-workflow";
import {
  EMPTY_SHOP_SCAN_CONTEXT,
  fetchShopScanContext,
} from "@/lib/scan/shop-scan-context";

const POLL_MS = 1200;
/** Minimum visible dwell between workflow phases (UI pacing, not fake data). */
const DWELL_AFTER_SYNC_MS = 700;
const DWELL_AFTER_LOAD_MS = 900;
const DWELL_BEFORE_DONE_MS = 600;

const EMPTY_STATS: ScanSummaryStats = {
  productCount: 0,
  matchedCount: 0,
  pendingCount: 0,
  confirmedCount: 0,
  unboundCount: 0,
  matchJobTotal: 0,
  matchJobProcessed: 0,
  matchJobLinked: 0,
  matchJobSkipped: 0,
  shopContext: EMPTY_SHOP_SCAN_CONTEXT,
};

function bindingStats(
  products: ShopMirrorProduct[],
  bound: ImageBindingView[]
): Pick<
  ScanSummaryStats,
  "matchedCount" | "pendingCount" | "confirmedCount" | "unboundCount"
> {
  const stats = computeShopProductBindingStats(products, indexImageBindings(bound));
  return {
    matchedCount: stats.matched,
    pendingCount: stats.pending,
    confirmedCount: stats.confirmed,
    unboundCount: stats.unbound,
  };
}

const TASK_IDS = {
  sync: "sync",
  link: "link",
  load: "load",
  orders: "orders",
  match: "match",
} as const;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isJobActive(status: MatchJobProgress["jobStatus"]) {
  return status === "PENDING" || status === "RUNNING";
}

function initialTasks(): ScanTaskView[] {
  return [
    { id: TASK_IDS.sync, label: "同步店铺商品镜像", status: "pending" },
    { id: TASK_IDS.link, label: "关联从 Tangbuy 商城上架的商品", status: "pending" },
    { id: TASK_IDS.load, label: "读取在售商品与货源关联", status: "pending" },
    { id: TASK_IDS.orders, label: "读取店铺订单", status: "pending" },
    { id: TASK_IDS.match, label: "自动图搜关联剩余商品", status: "pending" },
  ];
}

/**
 * Phase 1 scan for /products. Image-match runs on the backend queue (started after OAuth sync);
 * this hook polls real job progress for the progress bar and recent lines.
 */
export function useProductsScan(shopName: string) {
  const [tasks, setTasks] = useState<ScanTaskView[]>(initialTasks);
  const [recent, setRecent] = useState<string[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [stats, setStats] = useState<ScanSummaryStats>(EMPTY_STATS);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);

  const refreshBindingStats = useCallback(async () => {
    try {
      const [items, bound] = await Promise.all([
        api.getShopProducts(shopName).catch(() => []),
        api.listImageBindings(shopName).catch(() => [] as ImageBindingView[]),
      ]);
      const productIds = new Set(items.map((p) => p.thirdPlatformItemId));
      setStats((prev) => ({
        ...prev,
        productCount: productIds.size,
        ...bindingStats(items, bound),
      }));
    } catch {
      /* keep prior stats */
    }
  }, [shopName]);

  const patch = useCallback(
    (id: string, p: Partial<ScanTaskView>) =>
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t))),
    []
  );

  const applyJobProgress = useCallback(
    (job: MatchJobProgress) => {
      setProgressPercent(job.percent);
      if (job.recent?.length) setRecent(job.recent);
      setStats((prev) => ({
        ...prev,
        matchJobTotal: job.total,
        matchJobProcessed: job.processed,
        matchJobLinked: job.linked,
        matchJobSkipped: job.skipped + job.failed,
      }));
      patch(TASK_IDS.match, {
        status: isJobActive(job.jobStatus)
          ? "running"
          : job.jobStatus === "FAILED"
            ? "failed"
            : "done",
        resultText:
          job.total > 0
            ? `${job.processed} / ${job.total} 处理中`
            : job.jobStatus === "COMPLETED"
              ? "无可匹配商品"
              : undefined,
        error: job.jobStatus === "FAILED" ? job.lastError ?? "图搜队列失败" : undefined,
      });
      if (!isJobActive(job.jobStatus)) {
        void refreshBindingStats();
      }
    },
    [patch, refreshBindingStats]
  );

  const pollJob = useCallback(
    async (jobId: number) => {
      while (!cancelRef.current) {
        const job = await api.getMatchJob(jobId);
        applyJobProgress(job);
        if (!isJobActive(job.jobStatus)) break;
        await sleep(POLL_MS);
      }
    },
    [applyJobProgress]
  );

  const runMatchQueue = useCallback(async () => {
    patch(TASK_IDS.match, { status: "running" });
    let job = (await api.getActiveMatchJob(shopName)) ?? null;
    if (!job || !isJobActive(job.jobStatus)) {
      job = await api.startMatchQueue(shopName);
    }
    applyJobProgress(job);
    if (isJobActive(job.jobStatus)) {
      await pollJob(job.jobId);
    }
    const finalJob = await api.getMatchJob(job.jobId);
    applyJobProgress(finalJob);
  }, [shopName, patch, applyJobProgress, pollJob]);

  const start = useCallback(async () => {
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    setRecent([]);
    setProgressPercent(0);
    setStats(EMPTY_STATS);
    setTasks(initialTasks());

    const finalize = async () => {
      await refreshBindingStats();
      setRunning(false);
      setDone(true);
    };

    patch(TASK_IDS.sync, { status: "running" });
    try {
      const r = await api.syncShopProducts(shopName);
      patch(TASK_IDS.sync, { status: "done", resultText: `店铺共 ${r.productCount} 个商品` });
    } catch (err) {
      patch(TASK_IDS.sync, { status: "failed", error: readableError(err) });
    }
    if (cancelRef.current) return void finalize();
    await sleep(DWELL_AFTER_SYNC_MS);

    patch(TASK_IDS.link, { status: "running" });
    patch(TASK_IDS.link, { status: "done", resultText: "由后台队列自动处理" });
    if (cancelRef.current) return void finalize();

    patch(TASK_IDS.load, { status: "running" });
    try {
      const [items, bound] = await Promise.all([
        api.getShopProducts(shopName),
        api.listImageBindings(shopName).catch(() => [] as ImageBindingView[]),
      ]);
      const productIds = new Set(items.map((p) => p.thirdPlatformItemId));
      setStats({
        productCount: productIds.size,
        ...bindingStats(items, bound),
        matchJobTotal: 0,
        matchJobProcessed: 0,
        matchJobLinked: 0,
        matchJobSkipped: 0,
        shopContext: EMPTY_SHOP_SCAN_CONTEXT,
      });
      patch(TASK_IDS.load, {
        status: "done",
        resultText: `${productIds.size} / ${productIds.size} 已理解`,
      });
    } catch (err) {
      patch(TASK_IDS.load, { status: "failed", error: readableError(err) });
      patch(TASK_IDS.orders, { status: "skipped" });
      patch(TASK_IDS.match, { status: "skipped" });
      return finalize();
    }
    if (cancelRef.current) return void finalize();
    await sleep(DWELL_AFTER_LOAD_MS);

    patch(TASK_IDS.orders, { status: "running" });
    const shopContext = await fetchShopScanContext(shopName);
    setStats((prev) => ({ ...prev, shopContext }));
    patch(TASK_IDS.orders, {
      status: "done",
      resultText:
        shopContext.orderCount != null && shopContext.orderCount > 0
          ? shopContext.unfulfilledOrderCount != null &&
            shopContext.unfulfilledOrderCount > 0
            ? `${shopContext.unfulfilledOrderCount} 笔待发货`
            : `${shopContext.orderCount} 笔订单`
          : "暂无订单数据",
    });
    if (cancelRef.current) return void finalize();
    await sleep(500);

    try {
      await runMatchQueue();
    } catch (err) {
      patch(TASK_IDS.match, { status: "failed", error: readableError(err) });
    }
    if (cancelRef.current) return void finalize();
    await refreshBindingStats();
    await sleep(DWELL_BEFORE_DONE_MS);
    await finalize();
  }, [shopName, patch, runMatchQueue, refreshBindingStats]);

  /** Resume polling when auth already kicked off the backend queue. */
  const resumeActiveJob = useCallback(async (): Promise<boolean> => {
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    setRecent([]);
    setProgressPercent(0);
    setStats(EMPTY_STATS);
    setTasks(initialTasks());

    let active: MatchJobProgress | null = null;
    try {
      active = (await api.getActiveMatchJob(shopName)) ?? null;
    } catch {
      setRunning(false);
      return false;
    }
    if (!active || !isJobActive(active.jobStatus)) {
      setRunning(false);
      return false;
    }

    try {
      const items = await api.getShopProducts(shopName).catch(() => []);
      const productIds = new Set(items.map((p) => p.thirdPlatformItemId));
      const shopContext = await fetchShopScanContext(shopName);
      setStats((prev) => ({
        ...prev,
        productCount: productIds.size,
        shopContext,
      }));
    } catch {
      /* ignore */
    }

    patch(TASK_IDS.sync, { status: "skipped", resultText: "授权后已在后台运行" });
    patch(TASK_IDS.link, { status: "skipped", resultText: "由后台队列处理" });
    patch(TASK_IDS.load, { status: "skipped", resultText: "进入页面时读取" });
    patch(TASK_IDS.orders, { status: "skipped", resultText: "进入页面时读取" });
    applyJobProgress(active);
    try {
      await pollJob(active.jobId);
      const finalJob = await api.getMatchJob(active.jobId);
      applyJobProgress(finalJob);
    } catch (err) {
      patch(TASK_IDS.match, { status: "failed", error: readableError(err) });
    }
    await refreshBindingStats();
    await sleep(DWELL_BEFORE_DONE_MS);
    await refreshBindingStats();
    setRunning(false);
    setDone(true);
    return true;
  }, [shopName, patch, applyJobProgress, pollJob, refreshBindingStats]);

  const pollActiveMatchJobInBackground = useCallback(async () => {
    try {
      const active = (await api.getActiveMatchJob(shopName)) ?? null;
      if (!active || !isJobActive(active.jobStatus)) return;
      while (!cancelRef.current) {
        const job = await api.getMatchJob(active.jobId);
        if (!isJobActive(job.jobStatus)) break;
        await sleep(POLL_MS);
      }
    } catch {
      /* best-effort */
    }
  }, [shopName]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return {
    tasks,
    recent,
    stats,
    progressPercent,
    running,
    done,
    start,
    resumeActiveJob,
    pollActiveMatchJobInBackground,
    cancel,
  };
}
