"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface WatchlistItem {
  id: string;
  name: string;
}

const STORAGE_KEY = "tangbuy.operations.watchlist";

function loadLocal(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { competitors?: WatchlistItem[] };
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

function saveLocal(competitors: WatchlistItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ competitors }));
  } catch {
    // ignore
  }
}

async function fetchRemote(): Promise<WatchlistItem[]> {
  const res = await fetch("/api/plugin/marketing/competitors", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{ id: string; name: string }>;
  return data.map((d) => ({ id: d.id, name: d.name }));
}

async function toggleRemote(item: WatchlistItem): Promise<boolean> {
  try {
    const res = await fetch("/api/plugin/marketing/competitors/toggle", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ storeId: item.id, storeName: item.name }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { added?: boolean };
    return data.added ?? false;
  } catch {
    return false;
  }
}

export interface WatchlistState {
  competitors: WatchlistItem[];
  /** 当前正在同步后端的 storeId 集合（UI 可展示旋转图标）。 */
  togglingIds: Set<string>;
  /** 最后一次后端同步错误（ null = 无错误）。 */
  lastError: string | null;
  loaded: boolean;
}

/**
 * 竞店 ☆ 关注（后端持久化 + localStorage 离线兜底）。
 * 启动时优先拉后端列表；后端失败时回退 localStorage。
 * toggle 时同步写后端，后端失败仍更新本地状态保证 UI 响应。
 */
export function useOperationsWatchlist() {
  const [competitors, setCompetitors] = useState<WatchlistItem[]>([]);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [lastError, setLastError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const inflight = useRef<Set<string>>(new Set());

  // 初始加载：先拉后端，失败回退 localStorage
  useEffect(() => {
    let alive = true;
    fetchRemote()
      .then((list) => {
        if (!alive) return;
        setCompetitors(list);
        saveLocal(list);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setCompetitors(loadLocal());
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // localStorage 兜底同步
  useEffect(() => {
    if (loaded) saveLocal(competitors);
  }, [competitors, loaded]);

  const toggleCompetitor = useCallback((item: WatchlistItem) => {
    setLastError(null);
    setCompetitors((prev) => {
      const exists = prev.some((x) => x.id === item.id);
      const next = exists ? prev.filter((x) => x.id !== item.id) : [...prev, item];
      // 异步同步后端（不阻塞 UI）
      if (!inflight.current.has(item.id)) {
        inflight.current.add(item.id);
        setTogglingIds((s) => new Set(s).add(item.id));
        toggleRemote(item)
          .then((added) => {
            // 如果后端结果与本地不一致（并发/失败），以后端为准刷新一次
            if (added === exists) {
              // 后端状态与本地相反，说明本地预判错误，重新拉取
              fetchRemote().then((list) => {
                setCompetitors(list);
                saveLocal(list);
              }).catch(() => {});
            }
          })
          .catch((err) => {
            setLastError(err instanceof Error ? err.message : "sync failed");
            // 同步失败：本地已乐观更新，保留状态；下次刷新会以后端为准修正
          })
          .finally(() => {
            inflight.current.delete(item.id);
            setTogglingIds((s) => {
              const n = new Set(s);
              n.delete(item.id);
              return n;
            });
          });
      }
      return next;
    });
  }, []);

  return { competitors, toggleCompetitor, loaded, togglingIds, lastError };
}
