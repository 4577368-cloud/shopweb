"use client";

import { useCallback, useEffect, useState } from "react";

export type FavoriteType = "store" | "product" | "creative" | "ttsShop" | "rankProduct";

export interface FavoriteItem {
  id: string;
  type: FavoriteType;
  title: string;
  subtitle?: string;
  image?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
}

const STORAGE_KEY = "tangbuy.operations.favorites";

function loadLocal(): FavoriteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FavoriteItem[];
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (x): x is FavoriteItem =>
          x != null &&
          typeof x.id === "string" &&
          typeof x.type === "string" &&
          typeof x.title === "string" &&
          typeof x.createdAt === "number"
      );
    }
  } catch {
    // ignore
  }
  return [];
}

function saveLocal(items: FavoriteItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export interface FavoritesState {
  items: FavoriteItem[];
  loaded: boolean;
}

/**
 * 我的收藏 · 统一前端收藏管理（localStorage 持久化）。
 * 支持多类型：store（竞店）、product（广告商品）、creative（创意）、ttsShop（TikTok 店铺）、rankProduct（榜单商品）。
 */
export function useFavorites() {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setItems(loadLocal());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveLocal(items);
  }, [items, loaded]);

  const isFavorited = useCallback(
    (id: string, type?: FavoriteType) => {
      return items.some((x) => x.id === id && (type ? x.type === type : true));
    },
    [items]
  );

  const addFavorite = useCallback((item: Omit<FavoriteItem, "createdAt">) => {
    setItems((prev) => {
      if (prev.some((x) => x.id === item.id && x.type === item.type)) return prev;
      return [{ ...item, createdAt: Date.now() }, ...prev];
    });
  }, []);

  const removeFavorite = useCallback((id: string, type?: FavoriteType) => {
    setItems((prev) =>
      prev.filter((x) => !(x.id === id && (type ? x.type === type : true)))
    );
  }, []);

  const toggleFavorite = useCallback(
    (item: Omit<FavoriteItem, "createdAt">) => {
      const exists = items.some((x) => x.id === item.id && x.type === item.type);
      if (exists) {
        removeFavorite(item.id, item.type);
      } else {
        addFavorite(item);
      }
    },
    [items, addFavorite, removeFavorite]
  );

  const clearByType = useCallback((type: FavoriteType) => {
    setItems((prev) => prev.filter((x) => x.type !== type));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const groups = useCallback(() => {
    const g: Record<FavoriteType, FavoriteItem[]> = {
      store: [],
      product: [],
      creative: [],
      ttsShop: [],
      rankProduct: [],
    };
    for (const item of items) {
      g[item.type].push(item);
    }
    return g;
  }, [items]);

  return {
    items,
    loaded,
    isFavorited,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    clearByType,
    clearAll,
    groups,
  };
}
