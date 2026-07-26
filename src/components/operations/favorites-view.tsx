// 我的收藏视图：按类型分组展示所有收藏内容，支持筛选、搜索、取消收藏。
"use client";

import { useMemo, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Search } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import type { FavoriteItem, FavoriteType } from "@/hooks/use-favorites";
import type { WatchlistItem } from "@/hooks/use-operations-watchlist";
import { CoverThumb } from "./cover-thumb";

type FavFilter = "all" | FavoriteType;

interface FavoritesViewProps {
  items: FavoriteItem[];
  storeItems?: WatchlistItem[];
  onRemove: (id: string, type: FavoriteType) => void;
  onRemoveStore?: (id: string) => void;
  onClearType: (type: FavoriteType) => void;
  onViewStore?: (id: string) => void;
  onViewProduct?: (id: string) => void;
  onViewCreative?: (id: string) => void;
  onViewTtsShop?: (id: string) => void;
  onViewRankProduct?: (id: string) => void;
}

const TYPE_META: { key: FavoriteType; labelKey: string; icon: string }[] = [
  { key: "store", labelKey: "ops.favorites.typeStore", icon: "🏪" },
  { key: "product", labelKey: "ops.favorites.typeProduct", icon: "🛍️" },
  { key: "creative", labelKey: "ops.favorites.typeCreative", icon: "🎨" },
  { key: "ttsShop", labelKey: "ops.favorites.typeTtsShop", icon: "🎵" },
  { key: "rankProduct", labelKey: "ops.favorites.typeRankProduct", icon: "🏆" },
];

export function FavoritesView({
  items,
  storeItems = [],
  onRemove,
  onRemoveStore,
  onClearType,
  onViewStore,
  onViewProduct,
  onViewCreative,
  onViewTtsShop,
  onViewRankProduct,
}: FavoritesViewProps) {
  const t = useT();
  const [filter, setFilter] = useState<FavFilter>("all");
  const [search, setSearch] = useState("");

  // 把 watchlist 竞店转为 FavoriteItem 形态统一处理
  const storeFavs: FavoriteItem[] = useMemo(
    () =>
      storeItems.map((s) => ({
        id: s.id,
        type: "store" as FavoriteType,
        title: s.name,
        subtitle: s.id,
        createdAt: 0, // watchlist 无时间，排后面
      })),
    [storeItems]
  );

  const allItems = useMemo(() => {
    // 去重：如果 favorites 里已有同 id store，优先用 favorites 的（可能带了 image/meta）
    const storeIds = new Set(items.filter((x) => x.type === "store").map((x) => x.id));
    const merged = [...items, ...storeFavs.filter((s) => !storeIds.has(s.id))];
    return merged;
  }, [items, storeFavs]);

  const filtered = useMemo(() => {
    let list = allItems;
    if (filter !== "all") {
      list = list.filter((x) => x.type === filter);
    }
    const kw = search.trim().toLowerCase();
    if (kw) {
      list = list.filter(
        (x) =>
          x.title.toLowerCase().includes(kw) ||
          (x.subtitle ?? "").toLowerCase().includes(kw)
      );
    }
    // 按收藏时间倒序（watchlist 的 0 会排到最后）
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [allItems, filter, search]);

  const groups = useMemo(() => {
    const g = new Map<FavoriteType, number>();
    for (const x of allItems) {
      g.set(x.type, (g.get(x.type) ?? 0) + 1);
    }
    return g;
  }, [allItems]);

  const totalCount = allItems.length;

  const tabs = [
    { id: "all", label: `${t("ops.favorites.tabAll")} (${totalCount})` },
    ...TYPE_META.map((m) => ({
      id: m.key,
      label: `${t(m.labelKey)} (${groups.get(m.key) ?? 0})`,
    })),
  ];

  return (
    <div>
      {/* 搜索 + 筛选 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("ops.favorites.searchPlaceholder")}
            className="h-9 w-full rounded-[var(--radius-control)] border border-hairline bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="mb-3">
        <SegmentedTabs
          variant="chip"
          tabs={tabs}
          value={filter}
          onValueChange={(id) => setFilter(id as FavFilter)}
        />
      </div>

      {/* 类型快捷清空 */}
      {filter !== "all" && (groups.get(filter as FavoriteType) ?? 0) > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-[var(--radius-control)] border border-hairline bg-surface-muted/40 px-3 py-2 text-[11px]">
          <span className="text-ink-muted">
            {t("ops.favorites.typeCount", {
              type: t(TYPE_META.find((m) => m.key === filter)!.labelKey),
              n: groups.get(filter as FavoriteType) ?? 0,
            })}
          </span>
          <button
            type="button"
            onClick={() => onClearType(filter as FavoriteType)}
            className="text-destructive hover:underline"
          >
            {t("ops.favorites.clearType")}
          </button>
        </div>
      )}

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-hairline bg-surface-muted px-6 py-16 text-center">
          <p className="text-sm font-medium text-ink">{t("ops.favorites.empty")}</p>
          <p className="max-w-md text-[12px] leading-relaxed text-ink-subtle">
            {t("ops.favorites.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <FavCard
              key={`${item.type}:${item.id}`}
              item={item}
              onRemove={() => {
                if (item.type === "store") {
                  // 可能来自 favorites 或 watchlist，都尝试移除
                  onRemove(item.id, "store");
                  onRemoveStore?.(item.id);
                } else {
                  onRemove(item.id, item.type);
                }
              }}
              onView={() => {
                switch (item.type) {
                  case "store":
                    onViewStore?.(item.id);
                    break;
                  case "product":
                    onViewProduct?.(item.id);
                    break;
                  case "creative":
                    onViewCreative?.(item.id);
                    break;
                  case "ttsShop":
                    onViewTtsShop?.(item.id);
                    break;
                  case "rankProduct":
                    onViewRankProduct?.(item.id);
                    break;
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FavCard({
  item,
  onRemove,
  onView,
}: {
  item: FavoriteItem;
  onRemove: () => void;
  onView: () => void;
}) {
  const t = useT();
  const meta = TYPE_META.find((m) => m.key === item.type)!;
  const dateStr = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString()
    : null;

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-hairline bg-surface p-2.5 shadow-card transition hover:shadow-card">
      {/* 缩略图 */}
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-surface-muted ring-1 ring-hairline">
        {item.image ? (
          <CoverThumb src={item.image} label={item.title} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg">
            {meta.icon}
          </div>
        )}
      </div>

      {/* 内容 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-surface-muted px-1 py-0.5 text-[10px] text-ink-muted">
            {t(meta.labelKey)}
          </span>
          {dateStr && (
            <span className="text-[10px] text-ink-subtle">{dateStr}</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[12px] font-medium text-ink" title={item.title}>
          {item.title}
        </p>
        {item.subtitle && (
          <p className="truncate text-[11px] text-ink-subtle" title={item.subtitle}>
            {item.subtitle}
          </p>
        )}
      </div>

      {/* 操作 */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button
          type="button"
          onClick={onView}
          className="rounded px-2 py-1 text-[11px] text-link transition-colors hover:bg-brand-soft hover:text-brand"
        >
          {t("ops.favorites.view")}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            "rounded px-2 py-1 text-[11px] text-ink-subtle transition-colors hover:bg-destructive-soft hover:text-destructive"
          )}
        >
          {t("ops.favorites.remove")}
        </button>
      </div>
    </div>
  );
}
