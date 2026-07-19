"use client";

import { useCallback, useRef, useState } from "react";
import { api, readableError } from "@/lib/api";
import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";
import type { ScanTaskView } from "@/components/workbench/scan-stage";

// Auto image-match is heavier than sku-align (upload + search + confirm per product) and hits the
// 1688 gateway, so keep the fan-out gentle.
const MATCH_CONCURRENCY = 2;
const RECENT_MAX = 6;
const RECOMMENDATION_LIMIT = 20;

const TASK_IDS = {
  sync: "sync",
  load: "load",
  match: "match",
  reco: "reco",
} as const;

function initialTasks(): ScanTaskView[] {
  return [
    { id: TASK_IDS.sync, label: "同步店铺商品镜像", status: "pending" },
    { id: TASK_IDS.load, label: "读取在售商品与货源关联", status: "pending" },
    { id: TASK_IDS.match, label: "自动图搜关联货源", status: "pending" },
    { id: TASK_IDS.reco, label: "生成 Tangbuy 商城候选", status: "pending" },
  ];
}

/**
 * Phase 1 client-orchestrated real scan for /products. Runs real steps over existing endpoints:
 *   1) syncShopProducts — pull the Shopify mirror
 *   2) getShopProducts + listImageBindings — read on-sale products and which already have a source
 *   3) auto image-match: for each unbound product with a primary image, imageSearch → confirm the
 *      first candidate as a real ACTIVE binding (concurrency-limited, streams "最近完成", fail-open,
 *      reversible later via the card's 重新查找/改绑)
 *   4) getRecommendations — warm the offline-catalog (path B) candidate count
 * Fail-open: sync/reco failures don't block; per-product match failures are skipped; cancel stops
 * scheduling further work. No backend/job — progress is tracked from the real calls themselves.
 */
export function useProductsScan(shopName: string) {
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
    const pushRecent = (line: string) =>
      setRecent((prev) => [line, ...prev].slice(0, RECENT_MAX));

    // Step 1 — sync mirror (non-blocking: on failure we still try the existing mirror)
    patch(TASK_IDS.sync, { status: "running" });
    try {
      const r = await api.syncShopProducts(shopName);
      patch(TASK_IDS.sync, { status: "done", resultText: `店铺共 ${r.productCount} 个商品` });
    } catch (err) {
      patch(TASK_IDS.sync, { status: "failed", error: readableError(err) });
    }
    if (cancelRef.current) return finalize();

    // Step 2 — read on-sale products + existing bindings
    patch(TASK_IDS.load, { status: "running" });
    let products: ShopMirrorProduct[] = [];
    const boundSet = new Set<string>();
    try {
      const [items, bound] = await Promise.all([
        api.getShopProducts(shopName),
        api.listImageBindings(shopName).catch(() => [] as ImageBindingView[]),
      ]);
      products = items;
      for (const b of bound) {
        if (b.bound && b.thirdPlatformItemId) boundSet.add(b.thirdPlatformItemId);
      }
      patch(TASK_IDS.load, {
        status: "done",
        resultText: `${products.length} 个在售商品 · ${boundSet.size} 个已关联`,
      });
    } catch (err) {
      patch(TASK_IDS.load, { status: "failed", error: readableError(err) });
      patch(TASK_IDS.match, { status: "skipped" });
      patch(TASK_IDS.reco, { status: "skipped" });
      return finalize();
    }
    if (cancelRef.current) return finalize();

    // Step 3 — auto image-match unbound products that have a primary image (persists bindings)
    const targets = products.filter(
      (p) => !boundSet.has(p.thirdPlatformItemId) && p.primaryImageUrl
    );
    if (targets.length === 0) {
      patch(TASK_IDS.match, { status: "skipped", resultText: "暂无待关联商品（或缺主图）" });
    } else {
      patch(TASK_IDS.match, { status: "running" });
      const queue = [...targets];
      let processed = 0;
      let linked = 0;
      const worker = async () => {
        while (queue.length > 0) {
          if (cancelRef.current) return;
          const p = queue.shift();
          if (!p) return;
          const name = p.title ?? p.thirdPlatformItemId;
          try {
            const res = await api.imageSearch(shopName, p.thirdPlatformItemId, 4);
            const cand = res.items?.[0];
            if (!cand) {
              pushRecent(`${name}：未召回货源`);
            } else {
              await api.confirmImageMatch({
                shopName,
                thirdPlatformItemId: p.thirdPlatformItemId,
                offerProductId: cand.productId,
                offerSkuId: cand.skuId,
                detailUrl: cand.detailUrl,
                similarityScore: cand.similarityScore,
                imageSource: res.imageSource,
                querySource: res.querySource,
                appliedQuery: res.appliedQuery,
                offerImageUrl: cand.imageUrl,
                offerPrice: cand.price,
                auto: true,
              });
              linked += 1;
              pushRecent(`${name}：AI 关联 ${cand.title || cand.productId}（待确认）`);
            }
          } catch {
            pushRecent(`${name}：跳过`);
          } finally {
            processed += 1;
            patch(TASK_IDS.match, {
              resultText: `已处理 ${processed}/${targets.length} · 关联 ${linked}`,
            });
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(MATCH_CONCURRENCY, targets.length) }, () => worker())
      );
      patch(TASK_IDS.match, {
        status: cancelRef.current ? "skipped" : "done",
        resultText: `已自动关联 ${linked} 个商品（${processed}/${targets.length}）`,
      });
    }
    if (cancelRef.current) return finalize();

    // Step 4 — warm offline-catalog candidates (path B)
    patch(TASK_IDS.reco, { status: "running" });
    try {
      const recs = await api.getRecommendations(shopName, RECOMMENDATION_LIMIT);
      patch(TASK_IDS.reco, { status: "done", resultText: `Tangbuy 商城 ${recs.length} 条可上架` });
    } catch (err) {
      patch(TASK_IDS.reco, { status: "failed", error: readableError(err) });
    }
    finalize();
  }, [shopName]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { tasks, recent, running, done, start, cancel };
}
