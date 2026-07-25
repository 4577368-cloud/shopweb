"use client";

import { useCallback, useEffect, useState } from "react";
import type { WatchlistGroup, WatchlistItem } from "@/components/operations/watchlist";

export interface OperationsWatchlistState {
  tts: WatchlistItem[];
  competitors: WatchlistItem[];
  ads: WatchlistItem[];
}

export interface OperationsWatchlistActions {
  onAdd: (group: WatchlistGroup) => void;
  onSync: () => void;
  onSelect: (group: WatchlistGroup, item: WatchlistItem) => void;
  /** 切换竞店关注（用于竞店卡片 ☆）：存在则移除、不存在则追加。 */
  toggleCompetitor: (item: WatchlistItem) => void;
  /** 移除竞店关注（用于左栏竞店 × 按钮或详情抽屉卸载）。 */
  removeCompetitor: (id: string) => void;
}

const STORAGE_KEY = "tangbuy.operations.watchlist";

const DEFAULT_STATE: OperationsWatchlistState = {
  tts: [
    { id: "tts-1", name: "Top TikTok Shop" },
    { id: "tts-2", name: "Flash deal store" },
  ],
  competitors: [
    { id: "comp-1", name: "gymshark.com" },
    { id: "comp-2", name: "nike.com" },
  ],
  ads: [
    { id: "ad-1", name: "LED strip trend" },
    { id: "ad-2", name: "Phone case viral" },
  ],
};

function loadState(): OperationsWatchlistState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as OperationsWatchlistState;
    if (
      Array.isArray(parsed.tts) &&
      Array.isArray(parsed.competitors) &&
      Array.isArray(parsed.ads)
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_STATE;
}

function saveState(state: OperationsWatchlistState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/**
 * 运营中心 · 监控列表 Hook。
 * 管理 TikTok 店铺 / 竞店 / 广告商品 三组监控项，持久化到 localStorage。
 * v1 为本地原型：添加时通过 prompt 输入名称；同步时仅刷新时间戳并给出反馈。
 */
export function useOperationsWatchlist(
  onNavigate?: (patch: { tab: "competition" | "creatives" | "discovery"; query: string }) => void,
  onToast?: (message: string) => void
): OperationsWatchlistState & OperationsWatchlistActions {
  const [state, setState] = useState<OperationsWatchlistState>(loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const onAdd = useCallback(
    (group: WatchlistGroup) => {
      const labelMap: Record<WatchlistGroup, string> = {
        tts: "TikTok Shop",
        competitors: "competitor",
        ads: "ad keyword",
      };
      const name = typeof window !== "undefined" ? window.prompt(`Add ${labelMap[group]}:`) : null;
      if (!name?.trim()) return;
      setState((prev) => ({
        ...prev,
        [group]: [...prev[group], { id: `${group}-${Date.now()}`, name: name.trim() }],
      }));
      onToast?.("Added to watchlist");
    },
    [onToast]
  );

  const onSync = useCallback(() => {
    onToast?.("Watchlist synced");
  }, [onToast]);

  const onSelect = useCallback(
    (group: WatchlistGroup, item: WatchlistItem) => {
      if (group === "competitors") {
        onNavigate?.({ tab: "competition", query: item.name });
      } else if (group === "ads") {
        onNavigate?.({ tab: "creatives", query: item.name });
      } else {
        onNavigate?.({ tab: "discovery", query: "" });
      }
    },
    [onNavigate]
  );

  // 竞店关注：从竞店卡片 ☆ 直接加入左栏「竞店」组；与 onAdd 的 prompt 入口并存。
  const toggleCompetitor = useCallback((item: WatchlistItem) => {
    setState((prev) => {
      const exists = prev.competitors.some((x) => x.id === item.id);
      return {
        ...prev,
        competitors: exists
          ? prev.competitors.filter((x) => x.id !== item.id)
          : [...prev.competitors, item],
      };
    });
  }, []);

  const removeCompetitor = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      competitors: prev.competitors.filter((x) => x.id !== id),
    }));
  }, []);

  return {
    ...state,
    onAdd,
    onSync,
    onSelect,
    toggleCompetitor,
    removeCompetitor,
  };
}
