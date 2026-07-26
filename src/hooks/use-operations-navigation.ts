"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type OperationsTab = "discovery" | "competition" | "creatives" | "imageSearch";
export type DiscoverySegment = "ads" | "board" | "tiktok";
export type AdsSegment = "rank" | "search";

export interface OperationsNavigationState {
  tab: OperationsTab;
  discoverySeg: DiscoverySegment;
  discoveryAdsSeg: AdsSegment;
  competitionQuery: string;
  competitionProductId: string;
  creativesQuery: string;
}

export interface OperationsNavigationActions {
  setTab: (tab: OperationsTab) => void;
  setDiscoverySeg: (seg: DiscoverySegment) => void;
  setDiscoveryAdsSeg: (seg: AdsSegment) => void;
  setCompetitionQuery: (q: string) => void;
  setCompetitionProductId: (q: string) => void;
  setCreativesQuery: (q: string) => void;
  navigate: (patch: Partial<OperationsNavigationState>) => void;
}

const TAB_KEY = "view";
const DISCOVERY_SEG_KEY = "segment";
const ADS_SEG_KEY = "adsSegment";
const COMPETITION_Q_KEY = "q";
const COMPETITION_PID_KEY = "pid";
const CREATIVES_Q_KEY = "creativeQ";

function readParams(): OperationsNavigationState {
  if (typeof window === "undefined") {
    return {
      tab: "discovery",
      discoverySeg: "board",
      discoveryAdsSeg: "rank",
      competitionQuery: "",
      competitionProductId: "",
      creativesQuery: "",
    };
  }
  const params = new URLSearchParams(window.location.search);
  const tab = (params.get(TAB_KEY) as OperationsTab | null) ?? "discovery";
  const validTab = ["discovery", "competition", "creatives", "imageSearch"].includes(tab)
    ? tab
    : "discovery";
  const discoverySeg =
    (params.get(DISCOVERY_SEG_KEY) as DiscoverySegment | null) ?? "board";
  const validDiscoverySeg = ["ads", "board", "tiktok"].includes(discoverySeg)
    ? discoverySeg
    : "ads";
  const discoveryAdsSeg =
    (params.get(ADS_SEG_KEY) as AdsSegment | null) ?? "rank";
  const validAdsSeg = ["rank", "search"].includes(discoveryAdsSeg)
    ? discoveryAdsSeg
    : "rank";

  return {
    tab: validTab,
    discoverySeg: validDiscoverySeg,
    discoveryAdsSeg: validAdsSeg,
    competitionQuery: params.get(COMPETITION_Q_KEY) ?? "",
    competitionProductId: params.get(COMPETITION_PID_KEY) ?? "",
    creativesQuery: params.get(CREATIVES_Q_KEY) ?? "",
  };
}

function writeParams(state: OperationsNavigationState): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);

  // 仅在值非默认时才写入，保持 URL 精简（默认态不出现冗余 query key）。
  if (state.tab !== "discovery") params.set(TAB_KEY, state.tab);
  else params.delete(TAB_KEY);

  if (state.tab === "discovery") {
    if (state.discoverySeg !== "board") params.set(DISCOVERY_SEG_KEY, state.discoverySeg);
    else params.delete(DISCOVERY_SEG_KEY);

    if (state.discoverySeg === "ads") {
      if (state.discoveryAdsSeg !== "rank") params.set(ADS_SEG_KEY, state.discoveryAdsSeg);
      else params.delete(ADS_SEG_KEY);
    } else {
      params.delete(ADS_SEG_KEY);
    }
    params.delete(COMPETITION_Q_KEY);
    params.delete(COMPETITION_PID_KEY);
    params.delete(CREATIVES_Q_KEY);
  } else if (state.tab === "competition") {
    if (state.competitionQuery) params.set(COMPETITION_Q_KEY, state.competitionQuery);
    else params.delete(COMPETITION_Q_KEY);
    if (state.competitionProductId) params.set(COMPETITION_PID_KEY, state.competitionProductId);
    else params.delete(COMPETITION_PID_KEY);
    params.delete(DISCOVERY_SEG_KEY);
    params.delete(ADS_SEG_KEY);
    params.delete(CREATIVES_Q_KEY);
  } else if (state.tab === "creatives") {
    if (state.creativesQuery) params.set(CREATIVES_Q_KEY, state.creativesQuery);
    else params.delete(CREATIVES_Q_KEY);
    params.delete(DISCOVERY_SEG_KEY);
    params.delete(ADS_SEG_KEY);
    params.delete(COMPETITION_Q_KEY);
  } else {
    params.delete(DISCOVERY_SEG_KEY);
    params.delete(ADS_SEG_KEY);
    params.delete(COMPETITION_Q_KEY);
    params.delete(COMPETITION_PID_KEY);
    params.delete(CREATIVES_Q_KEY);
  }

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  // 仅在 URL 真正变化时才 replaceState，避免提交后无谓的历史写入（也规避对 Router 的冗余更新）。
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

/**
 * 运营中心 · 导航状态 Hook。
 * 管理 Tab、子分段、搜索词，并同步到 URL query string，
 * 使刷新/分享/浏览器前进后退都能恢复当前视图状态。
 */
export function useOperationsNavigation(): OperationsNavigationState &
  OperationsNavigationActions {
  // 初始 state 必须是「确定性默认值」：不能在初始化时读 window.location，
  // 否则服务端（window 不存在→默认值）与客户端（读 URL→可能不同）首帧渲染不一致，触发 hydration mismatch。
  const [state, setState] = useState<OperationsNavigationState>({
    tab: "discovery",
    discoverySeg: "board",
    discoveryAdsSeg: "rank",
    competitionQuery: "",
    competitionProductId: "",
    creativesQuery: "",
  });

  // 挂载后再从 URL 校正真实视图状态（此时 window 已可用）。首帧两端一致，挂载后校正，避免 hydration 报错。
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    const fromUrl = readParams();
    setState((prev) =>
      prev.tab === fromUrl.tab &&
      prev.discoverySeg === fromUrl.discoverySeg &&
      prev.discoveryAdsSeg === fromUrl.discoveryAdsSeg &&
      prev.competitionQuery === fromUrl.competitionQuery &&
      prev.competitionProductId === fromUrl.competitionProductId &&
      prev.creativesQuery === fromUrl.creativesQuery
        ? prev
        : fromUrl
    );
  }, []);

  // 同步到 URL：必须在 effect（提交后）执行，绝不能放进 setState 更新函数。
  // 更新函数在渲染协调阶段被 React 执行，若在里面同步调用 window.history.replaceState，
  // 会触发 Next.js Router 在渲染期被更新，报 "Cannot update a component (Router) while rendering"。
  // 首次挂载跳过：此时 URL 即当前值，无需再写。
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    writeParams(state);
  }, [state]);

  const update = useCallback(
    (patch: Partial<OperationsNavigationState>) => {
      setState((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const setTab = useCallback(
    (tab: OperationsTab) => update({ tab }),
    [update]
  );
  const setDiscoverySeg = useCallback(
    (discoverySeg: DiscoverySegment) => update({ discoverySeg }),
    [update]
  );
  const setDiscoveryAdsSeg = useCallback(
    (discoveryAdsSeg: AdsSegment) => update({ discoveryAdsSeg }),
    [update]
  );
  const setCompetitionQuery = useCallback(
    (competitionQuery: string) => update({ competitionQuery }),
    [update]
  );
  const setCompetitionProductId = useCallback(
    (competitionProductId: string) => update({ competitionProductId }),
    [update]
  );
  const setCreativesQuery = useCallback(
    (creativesQuery: string) => update({ creativesQuery }),
    [update]
  );
  const navigate = useCallback(
    (patch: Partial<OperationsNavigationState>) => update(patch),
    [update]
  );

  return useMemo(
    () => ({
      ...state,
      setTab,
      setDiscoverySeg,
      setDiscoveryAdsSeg,
      setCompetitionQuery,
      setCompetitionProductId,
      setCreativesQuery,
      navigate,
    }),
    [
      state,
      setTab,
      setDiscoverySeg,
      setDiscoveryAdsSeg,
      setCompetitionQuery,
      setCompetitionProductId,
      setCreativesQuery,
      navigate,
    ]
  );
}
