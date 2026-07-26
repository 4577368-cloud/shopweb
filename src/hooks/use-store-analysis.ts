// 竞店充实 Hook（store/detail 族）：并行拉取店铺级 6 端点，
// 全部经统一出站 run（自带 3 天免费窗口 / 会话缓存 / 真实扣点记账）。
// 仅 store id 维度；抽屉打开时触发，store 变化即重新拉取。

"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketingRunFn } from "./use-marketing-runner";
import {
  fetchStoreAdTrend,
  fetchStoreDataAnalysis,
  fetchStoreDeliveryAnalysis,
  fetchStoreFbPages,
  fetchStoreLongestRunAds,
  fetchStoreMostUsedAds,
  fetchStoreRegionAnalysis,
} from "@/lib/marketing/api";
import type {
  StoreAdTrendPoint,
  StoreDataAnalysis,
  StoreDeliveryAnalysis,
  StoreFbPage,
  StoreLongestRunAd,
  StoreMostUsedAd,
  StoreRegionAnalysis,
} from "@/lib/marketing/types";

export interface StoreAnalysisState {
  loading: boolean;
  error?: boolean;
  adTrend?: StoreAdTrendPoint[];
  longest?: StoreLongestRunAd[];
  mostUsed?: StoreMostUsedAd[];
  fbPages?: StoreFbPage[];
  dataAnalysis?: StoreDataAnalysis;
  regionAnalysis?: StoreRegionAnalysis[];
  delivery?: StoreDeliveryAnalysis;
}

export function useStoreAnalysis(storeId: string, run: MarketingRunFn): StoreAnalysisState {
  const [state, setState] = useState<StoreAnalysisState>({ loading: false });
  // run 经 ref 持有，避免其 identity 变化触发重复拉取。
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!storeId) {
      setState({ loading: false });
      return;
    }
    let cancelled = false;
    setState({ loading: true });
    Promise.all([
      runRef.current("store/ad-trend", `storeTrend:${storeId}`, () => fetchStoreAdTrend({ id: storeId })),
      runRef.current("store/longest-run-ads", `storeLongest:${storeId}`, () => fetchStoreLongestRunAds({ id: storeId })),
      runRef.current("store/most-used-ads", `storeMostUsed:${storeId}`, () => fetchStoreMostUsedAds({ id: storeId })),
      runRef.current("store/fb-pages", `storeFb:${storeId}`, () => fetchStoreFbPages({ id: storeId })),
      runRef.current("store/data-analysis", `storeData:${storeId}`, () => fetchStoreDataAnalysis({ id: storeId })),
      runRef.current("store/region-analysis", `storeRegion:${storeId}`, () => fetchStoreRegionAnalysis({ id: storeId })),
      runRef.current("store/delivery-analysis", `storeDelivery:${storeId}`, () => fetchStoreDeliveryAnalysis({ id: storeId })),
    ])
      .then(([trend, longest, mostUsed, fb, data, region, delivery]) => {
        if (cancelled) return;
        setState({
          loading: false,
          adTrend: trend.data.list,
          longest: longest.data.list,
          mostUsed: mostUsed.data.list,
          fbPages: fb.data.list,
          dataAnalysis: data.data,
          regionAnalysis: region.data.list,
          delivery: delivery.data,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  return state;
}
