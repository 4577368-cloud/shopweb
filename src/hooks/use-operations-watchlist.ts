"use client";

import { useCallback, useEffect, useState } from "react";

export interface WatchlistItem {
  id: string;
  name: string;
}

const STORAGE_KEY = "tangbuy.operations.watchlist";

function loadCompetitors(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      competitors?: WatchlistItem[];
    };
    if (Array.isArray(parsed.competitors)) {
      return parsed.competitors.filter(
        (x): x is WatchlistItem =>
          x != null && typeof x.id === "string" && typeof x.name === "string"
      );
    }
  } catch {
    // ignore
  }
  return [];
}

function saveCompetitors(competitors: WatchlistItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ competitors }));
  } catch {
    // ignore
  }
}

/** 竞店 ☆ 关注（localStorage）；无左栏列表 UI 时仍用于竞店 Tab 收藏状态。 */
export function useOperationsWatchlist() {
  const [competitors, setCompetitors] = useState<WatchlistItem[]>(() => loadCompetitors());

  useEffect(() => {
    saveCompetitors(competitors);
  }, [competitors]);

  const toggleCompetitor = useCallback((item: WatchlistItem) => {
    setCompetitors((prev) => {
      const exists = prev.some((x) => x.id === item.id);
      return exists ? prev.filter((x) => x.id !== item.id) : [...prev, item];
    });
  }, []);

  return { competitors, toggleCompetitor };
}
