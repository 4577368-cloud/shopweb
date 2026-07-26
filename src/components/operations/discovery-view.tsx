// 发现视图（设计 §3 / 原型 v2）：广告商品（排行 / 搜索）+ 枚举筛选 + 指标概览条
// + 行内趋势 sparkline / CPM 区间 + 结果表 + 分页 + 四态。
"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import Link from "next/link";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Search } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  fetchRankList,
  fetchSearchAds,
} from "@/lib/marketing/api";
import {
  shopTypeLabel,
} from "@/lib/marketing/enums";
import { useReferenceDictionaries } from "@/hooks/use-reference-dictionaries";
import type {
  AdCard,
  MarketingResponse,
  PageMeta,
  RankRow,
  RankSortKey,
  RankType,
  RankingRow,
  RankingSnapshot,
  TtsShopRow,
} from "@/lib/marketing/types";
import { isGuardCancel } from "@/lib/marketing/guard";
import {
  readMarketingViewState,
  writeMarketingViewState,
} from "@/lib/marketing/session-cache";
import { CoverThumb } from "./cover-thumb";
import { PlatformBadge } from "./platform-badge";
import { RankingProductGrid, RankingDetailDrawer } from "./ranking-grid";
import { rankMomentum, normalizeTo100 } from "@/lib/marketing/derived";
import { fmtCompact, fmtGrowthRate, fmtInt, fmtPercent, fmtUsd } from "@/lib/marketing/format";
import { ScorePill } from "./intel";
import { AdIntelCard } from "./ad-intel-card";

interface DiscoveryViewProps {
  run: <T extends MarketingResponse<unknown>>(endpoint: string, cacheKey: string, fn: () => Promise<T>) => Promise<T>;
  shop: string;
  onViewCompetitor: (productId: string) => void;
  onViewCompetitorStore: (store: string) => void;
  onViewTtsDetail: (row: TtsShopRow) => void;
  onViewDetail: (adId: string) => void;
  onLearnCreatives: (adId: string) => void;
  initialSegment?: Segment;
  onSegmentChange?: (segment: Segment) => void;
}

export type DiscoveryViewHandle = {
  /** 顶部「获取」：按当前分段/筛选拉取一页（或命中会话缓存）。 */
  fetchCurrent: () => void;
};

type Segment = "ads" | "board";

function rankFilterKey(
  period: RankType,
  sortKey: RankSortKey,
  region: string,
  category: string,
  shopType: string,
  platform: string,
  growthMin: string,
  growthMax: string
) {
  const gMin = growthMin ? Number(growthMin) : "";
  const gMax = growthMax ? Number(growthMax) : "";
  return `rank:${period}:${sortKey}:${region}:${category}:${shopType}:${platform}:${gMin}:${gMax}`;
}

function rankCacheKey(
  p: number,
  period: RankType,
  sortKey: RankSortKey,
  region: string,
  category: string,
  shopType: string,
  platform: string,
  growthMin: string,
  growthMax: string
) {
  return `${rankFilterKey(period, sortKey, region, category, shopType, platform, growthMin, growthMax)}:${p}`;
}

// 诚实的"调用价值"条：每次 list 调用只消耗 1 额度，但回传的多个真实字段
// 被组合派生出多重洞察。这里的字段数/信号数均为真实计数（非夸大）。
const CALL_VALUE: Record<"rank" | "search", { fields: number; signals: number }> = {
  rank: { fields: 9, signals: 4 },
  search: { fields: 15, signals: 6 },
};

export const DiscoveryView = forwardRef<DiscoveryViewHandle, DiscoveryViewProps>(function DiscoveryView(
  {
  run,
  shop,
  onViewCompetitor,
  onViewDetail,
  onLearnCreatives,
  initialSegment = "ads",
  onSegmentChange,
  },
  ref
) {
  const t = useT();
  const { dictionaries } = useReferenceDictionaries();
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [committedSearch, setCommittedSearch] = useState("");
  const hasSearch = committedSearch.trim().length > 0;

  // 筛选
  const [period, setPeriod] = useState<RankType>(2);
  const [sortKey, setSortKey] = useState<RankSortKey>("count_growth");
  const [region, setRegion] = useState("all");
  const [category, setCategory] = useState("all");
  const [shopType, setShopType] = useState("all");
  const [platform, setPlatform] = useState<"all" | "tiktok" | "facebook">("all");
  const [growthMin, setGrowthMin] = useState("");
  const [growthMax, setGrowthMax] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const [rank, setRank] = useState<{ list: RankRow[]; page: PageMeta } | null>(null);
  const [search, setSearch] = useState<{ list: AdCard[]; page: PageMeta } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [fav, setFav] = useState<Set<string>>(new Set());
  const [rankLoadedFilter, setRankLoadedFilter] = useState<string | null>(null);
  const [searchLoadedQuery, setSearchLoadedQuery] = useState<string | null>(null);

  const currentRankFilter = useMemo(
    () => rankFilterKey(period, sortKey, region, category, shopType, platform, growthMin, growthMax),
    [period, sortKey, region, category, shopType, platform, growthMin, growthMax]
  );

  useEffect(() => {
    const rankSnap = readMarketingViewState<{
      filterKey: string;
      page: number;
      data: { list: RankRow[]; page: PageMeta };
    }>("discovery:rank");
    if (rankSnap) {
      setRank(rankSnap.data);
      setRankLoadedFilter(rankSnap.filterKey);
      setPage(rankSnap.page);
    }
    const searchSnap = readMarketingViewState<{
      query: string;
      page: number;
      data: { list: AdCard[]; page: PageMeta };
    }>("discovery:search");
    if (searchSnap) {
      setCommittedSearch(searchSnap.query);
      setSearchQ(searchSnap.query);
      setSearch(searchSnap.data);
      setSearchLoadedQuery(searchSnap.query);
      setPage(searchSnap.page);
    }
  }, []);

  const loadRank = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(false);
      setPage(p);
      const gMin = growthMin ? Number(growthMin) : undefined;
      const gMax = growthMax ? Number(growthMax) : undefined;
      const filterKey = rankFilterKey(
        period,
        sortKey,
        region,
        category,
        shopType,
        platform,
        growthMin,
        growthMax
      );
      const cacheKey = rankCacheKey(
        p,
        period,
        sortKey,
        region,
        category,
        shopType,
        platform,
        growthMin,
        growthMax
      );
      try {
        const res = await run(
          "rank/ad-product/list",
          cacheKey,
          () =>
            fetchRankList({
              type: period,
              sortKey,
              platType: platform === "all" ? 0 : platform === "tiktok" ? 1 : 2,
              region: region === "all" ? undefined : region,
              category: category === "all" ? undefined : category,
              shopType: shopType === "all" ? undefined : shopType,
              countGrowthMin: gMin,
              countGrowthMax: gMax,
              page: p,
              pageSize: 20,
            })
        );
        setRank(res.data);
        setRankLoadedFilter(filterKey);
        writeMarketingViewState("discovery:rank", {
          filterKey,
          page: p,
          data: res.data,
        });
      } catch (e) {
        if (!isGuardCancel(e)) setError(true);
      } finally {
        setLoading(false);
      }
    },
    [run, period, sortKey, region, category, shopType, platform, growthMin, growthMax]
  );

  const loadSearch = useCallback(
    async (p: number) => {
      const q = committedSearch.trim();
      if (!q) return;
      setLoading(true);
      setError(false);
      setPage(p);
      try {
        const res = await run(
          "ad-products/search",
          `search:${q}:${p}`,
          () => fetchSearchAds(q, p, 20)
        );
        setSearch(res.data);
        setSearchLoadedQuery(q);
        writeMarketingViewState("discovery:search", {
          query: q,
          page: p,
          data: res.data,
        });
      } catch (e) {
        if (!isGuardCancel(e)) setError(true);
      } finally {
        setLoading(false);
      }
    },
    [run, committedSearch]
  );

  useImperativeHandle(
    ref,
    () => ({
      fetchCurrent: () => {
        if (segment === "board") return;
        if (hasSearch) void loadSearch(1);
        else void loadRank(1);
      },
    }),
    [segment, hasSearch, loadSearch, loadRank]
  );

  const rankFiltersStale =
    rank != null && rankLoadedFilter != null && rankLoadedFilter !== currentRankFilter;
  const searchQueryStale =
    search != null &&
    searchLoadedQuery != null &&
    searchLoadedQuery !== committedSearch.trim();

  const toggleFav = (id: string) =>
    setFav((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const resetFilters = () => {
    setRegion("all");
    setCategory("all");
    setShopType("all");
    setPlatform("all");
    setGrowthMin("");
    setGrowthMax("");
  };

  const submitSearch = () => {
    const q = searchQ.trim();
    setCommittedSearch(q);
    if (q) void loadSearch(1);
  };
  const backToHot = () => {
    setSearchQ("");
    setCommittedSearch("");
  };

  // 指标概览条（依当前数据集真实字段动态计算）
  const summary = useMemo<{ label: string; value: string; tone?: "success" }[] | null>(() => {
    if (segment === "ads" && !hasSearch && rank?.list) {
      const l = rank.list;
      const totalCountGrowth = l.reduce((a, r) => a + r.countGrowth, 0);
      const cpms = l.filter((r) => r.minCpm != null && r.maxCpm != null).map((r) => (r.minCpm! + r.maxCpm!) / 2);
      const totalVideo = l.reduce((a, r) => a + r.videoCount, 0);
      return [
        { label: t("ops.discovery.summary.rank.products"), value: fmtInt(l.length) },
        { label: t("ops.discovery.summary.rank.growth"), value: `+${fmtCompact(totalCountGrowth)}` },
        {
          label: t("ops.discovery.summary.rank.avgCpm"),
          value: cpms.length ? `$${(cpms.reduce((a, b) => a + b, 0) / cpms.length).toFixed(1)}` : "—",
        },
        { label: t("ops.discovery.summary.rank.videos"), value: fmtCompact(totalVideo) },
      ];
    }
    if (segment === "ads" && hasSearch && search?.list) {
      const l = search.list;
      const totalAds = l.reduce((a, c) => a + c.adCount, 0);
      const totalActive = l.reduce((a, c) => a + c.activeAdCount, 0);
      const totalReach = l.reduce((a, c) => a + c.adAudienceReach, 0);
      return [
        { label: t("ops.discovery.summary.search.products"), value: fmtInt(l.length) },
        { label: t("ops.discovery.summary.search.ads"), value: fmtCompact(totalAds) },
        { label: t("ops.discovery.summary.search.active"), value: fmtCompact(totalActive) },
        { label: t("ops.discovery.summary.search.reach"), value: fmtCompact(totalReach) },
      ];
    }
    return null;
  }, [segment, hasSearch, rank, search]);

  // 关键信号条：基于已加载数据用真实字段组合出人话可读的"高价值发现"。
  // - Rank：动量 Top 3 + 价格甜区（直接复用 rankMomentum）
  // - Search 无 region/category/趋势 → 不展示
  // 一行 chip 列表替代原 Heatmap + LineChart + Scatter 三个图（信息密度高、可读、不占地方）。
  const keySignals = useMemo<{ label: string; value: string }[] | null>(() => {
    if (segment === "ads" && !hasSearch && rank?.list && rank.list.length) {
      const scored = rank.list.map((r) => ({ r, mom: rankMomentum(r).momentumRaw }));
      const top3 = [...scored].sort((a, b) => b.mom - a.mom).slice(0, 3);
      // 价格甜区：按动量分 5 段，取平均动量最高段
      const bands = new Map<number, { sum: number; n: number }>();
      scored.forEach(({ r, mom }) => {
        const band = Math.floor(r.usdPrice / 20) * 20;
        const b = bands.get(band) ?? { sum: 0, n: 0 };
        b.sum += mom;
        b.n += 1;
        bands.set(band, b);
      });
      const bestBand = [...bands.entries()]
        .map(([k, v]) => ({ k, avg: v.sum / v.n, n: v.n }))
        .sort((a, b) => b.avg - a.avg)[0];
      const unit = t("ops.discovery.growthFactor");
      return [
        {
          label: t("ops.discovery.insights.labelMomentumTop"),
          value: top3.map((x) => fmtGrowthRate(x.mom * 100, unit)).join(" / "),
        },
        ...(bestBand
          ? [
              {
                label: t("ops.discovery.insights.labelPriceSweet"),
                value: t("ops.discovery.insights.priceSweet", {
                  lo: `$${bestBand.k}`,
                  hi: `$${bestBand.k + 20}`,
                  n: bestBand.n,
                  mom: fmtGrowthRate(bestBand.avg * 100, unit),
                }),
              },
            ]
          : []),
      ];
    }
    return null;
  }, [segment, hasSearch, rank, t]);

  return (
    <div>
      {/* 分段：广告商品 / 榜单 */}
      <SegmentedTabs
        variant="solid"
        tabs={[
          { id: "ads", label: t("ops.discovery.segAds") },
          { id: "board", label: t("ops.discovery.segBoard") },
        ]}
        value={segment}
        onValueChange={(id) => {
          const next = id as Segment;
          setSegment(next);
          onSegmentChange?.(next);
        }}
        className="mb-3"
      />

      {/* 筛选栏 */}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {segment === "ads" ? (
          <div className="flex w-full flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                placeholder={t("ops.discovery.searchPlaceholder")}
                className="h-9 min-w-[240px] flex-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <Button variant="primary" size="sm" onClick={submitSearch}>
                <Search className="h-3.5 w-3.5" />
                {t("ops.discovery.segSearch")}
              </Button>
              {hasSearch && (
                <Button variant="ghost" size="sm" onClick={backToHot}>
                  {t("ops.discovery.backToHot")}
                </Button>
              )}
            </div>
            {!hasSearch && (
              <div className="flex w-full flex-col gap-2">
                <div className="grid w-full grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 md:grid-cols-4">
                  <Select
                    label={t("ops.discovery.filters.period")}
                    value={String(period)}
                    onChange={(v) => setPeriod(Number(v) as RankType)}
                    options={["1", "2", "3"]}
                    labels={[t("ops.discovery.filters.day"), t("ops.discovery.filters.week"), t("ops.discovery.filters.month")]}
                  />
                  <Select
                    label={t("ops.discovery.filters.sort")}
                    value={sortKey}
                    onChange={(v) => setSortKey(v as RankSortKey)}
                    options={["count_growth", "growth_rate", "video_count"]}
                    labels={[t("ops.discovery.filters.growthCount"), t("ops.discovery.filters.growthRate"), t("ops.discovery.filters.videoCount")]}
                  />
                  <Select
                    label={t("ops.discovery.filters.region")}
                    value={region}
                    onChange={setRegion}
                    options={dictionaries.region.map((r) => ({ value: r.code, label: r.label }))}
                    allLabel={t("ops.discovery.filters.all")}
                  />
                  <Select
                    label={t("ops.discovery.filters.category")}
                    value={category}
                    onChange={setCategory}
                    options={dictionaries.productCategory.map((c) => ({ value: c.code, label: c.label }))}
                    allLabel={t("ops.discovery.filters.all")}
                  />
                  <Select
                    label={t("ops.discovery.filters.shopType")}
                    value={shopType}
                    onChange={setShopType}
                    options={dictionaries.shopType.map((s) => ({ value: s.code, label: s.label }))}
                    allLabel={t("ops.discovery.filters.all")}
                  />
                  <Select
                    label={t("ops.discovery.filters.platform")}
                    value={platform}
                    onChange={(v) => setPlatform(v as "all" | "tiktok" | "facebook")}
                    options={["all", "tiktok", "facebook"]}
                    labels={[t("ops.discovery.filters.all"), "TikTok", "Facebook"]}
                  />
                  <NumInput label={t("ops.discovery.filters.growthMin")} value={growthMin} onChange={setGrowthMin} />
                  <NumInput label={t("ops.discovery.filters.growthMax")} value={growthMax} onChange={setGrowthMax} />
                </div>
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    {t("ops.discovery.filters.reset")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* 指标概览条 + 关键信号条（紧凑 chip 列表，可读不占地方） */}
      {(summary || keySignals) && (
        <div className="mb-3 space-y-2">
          {summary && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {summary.map((s) => (
                <SummaryStat key={s.label} label={s.label} value={s.value} tone={s.tone} />
              ))}
            </div>
          )}
          {keySignals && keySignals.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-card)] border border-brand-soft bg-brand-soft/30 px-3 py-1.5 text-[11px]">
              <span className="font-semibold text-ink">{t("ops.discovery.insights.keySignals")}</span>
              <span className="text-ink-subtle">·</span>
              {keySignals.map((c, i) => (
                <span key={c.label} className="inline-flex items-center gap-1 text-ink">
                  <span className="text-ink-muted">{c.label}</span>
                  <span className="font-medium tabular-nums">{c.value}</span>
                  {i < keySignals.length - 1 && <span className="text-ink-subtle">·</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 状态 */}
      {segment === "board" ? (
        <RankingBoard shop={shop} />
      ) : loading ? (
        <SkeletonRows />
      ) : error ? (
        <ErrorState
          onRetry={() => (hasSearch ? loadSearch(page) : loadRank(page))}
        />
      ) : !hasSearch ? (
        <>
          {rankFiltersStale && <StaleFiltersBanner />}
          {!rank ? (
            <FetchPrompt />
          ) : (
            <RankTable
              data={rank}
              fav={fav}
              onToggleFav={toggleFav}
              onViewCompetitor={onViewCompetitor}
              onViewDetail={onViewDetail}
              onLearn={onLearnCreatives}
              onPage={loadRank}
            />
          )}
        </>
      ) : (
        <>
          {searchQueryStale && <StaleFiltersBanner />}
          {!search || committedSearch.trim() !== searchLoadedQuery ? (
            <FetchPrompt />
          ) : (
            <SearchTable
              data={search}
              fav={fav}
              onToggleFav={toggleFav}
              query={committedSearch}
              onViewCompetitor={onViewCompetitor}
              onViewDetail={onViewDetail}
              onLearn={onLearnCreatives}
              onPage={loadSearch}
            />
          )}
        </>
      )}

      {/* 调用价值条：让一次消耗显得"超值"——真实字段数被组合成多重派生信号 */}
      {segment !== "board" && !loading && !error && (
        <p className="mt-3 text-center text-[11px] text-ink-subtle">
          {t("ops.intel.value", {
            fields: CALL_VALUE[hasSearch ? "search" : "rank"].fields,
            signals: CALL_VALUE[hasSearch ? "search" : "rank"].signals,
          })}
        </p>
      )}
    </div>
  );
});

function FetchPrompt() {
  const t = useT();
  return (
    <p className="py-16 text-center text-sm text-ink-subtle">{t("ops.fetch.prompt")}</p>
  );
}

function StaleFiltersBanner() {
  const t = useT();
  return (
    <p className="mb-2 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
      {t("ops.fetch.staleFilters")}
    </p>
  );
}

// --- 通用子组件 ---
function Select({
  label,
  value,
  onChange,
  options,
  labels,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[] | string[];
  labels?: string[];
  allLabel?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-subtle">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-0 truncate rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand"
      >
        {(options as (string | { value: string; label: string })[]).map((opt, i) => {
          const v = typeof opt === "string" ? opt : opt.value;
          const text = typeof opt === "string" ? (allLabel && opt === "all" ? allLabel : labels?.[i] ?? opt) : opt.label;
          return (
            <option key={v} value={v}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-ink-subtle">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="h-9 w-24 rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </label>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted px-3 py-2">
      <p className="text-[10px] text-ink-subtle">{label}</p>
      <p className={cn("text-base font-semibold tabular-nums", tone === "success" ? "text-success" : "text-ink")}>{value}</p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-[var(--radius-card)] bg-muted" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-destructive-soft bg-destructive-soft px-6 py-12 text-center">
      <p className="text-sm font-medium text-destructive">{t("ops.error.title")}</p>
      <p className="max-w-md text-[12px] leading-relaxed text-ink-subtle">{t("ops.error.desc")}</p>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        {t("ops.error.retry")}
      </Button>
    </div>
  );
}

function Pager({
  page,
  onPage,
  meta,
}: {
  page: PageMeta;
  onPage: (p: number) => void;
  meta: PageMeta;
}) {
  const t = useT();
  return (
    <div className="mt-3 flex items-center justify-between text-[11px] text-ink-subtle">
      <span>{t("ops.discovery.total", { n: meta.totalCount })}</span>
      <div className="flex items-center gap-1">
        {Array.from({ length: meta.pageCount }, (_, i) => i + 1)
          .slice(0, 8)
          .map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              className={cn(
                "h-6 min-w-6 rounded px-1.5 text-[11px]",
                p === page.currentPage ? "bg-brand text-white" : "bg-surface-muted text-ink-muted hover:text-ink"
              )}
            >
              {p}
            </button>
          ))}
        {meta.pageCount > 8 && <span>… {meta.pageCount}</span>}
      </div>
    </div>
  );
}

function RankTable({
  data,
  fav,
  onToggleFav,
  onViewCompetitor,
  onViewDetail,
  onLearn,
  onPage,
}: {
  data: { list: RankRow[]; page: PageMeta } | null;
  fav: Set<string>;
  onToggleFav: (id: string) => void;
  onViewCompetitor: (id: string) => void;
  onViewDetail: (id: string) => void;
  onLearn: (id: string) => void;
  onPage: (p: number) => void;
}) {
  const t = useT();
  if (!data || data.list.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-subtle">{t("ops.discovery.empty")}</p>;
  }
  // 综合动量按本页列表归一化（growth_rate × (1+log10(count_growth+1))）
  const momVals = data.list.map((r) => rankMomentum(r).momentumRaw);
  const momMin = momVals.length ? Math.min(...momVals) : 0;
  const momMax = momVals.length ? Math.max(...momVals) : 1;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1140px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-hairline text-left text-[11px] text-ink-subtle">
              <th className="px-2 py-2 font-medium">{t("ops.discovery.colRank")}</th>
              <th className="px-2 py-2 font-medium">{t("ops.discovery.colCover")}</th>
              <th className="px-2 py-2 font-medium">{t("ops.discovery.colTitle")}</th>
              <th className="px-2 py-2 font-medium">{t("ops.discovery.colPrice")}</th>
              <th className="px-2 py-2 text-right font-medium">{t("ops.discovery.colGrowthCount")}</th>
              <th className="px-2 py-2 text-right font-medium">{t("ops.discovery.colGrowthRate")}</th>
              <th className="px-2 py-2 text-right font-medium">{t("ops.discovery.colVideoCount")}</th>
              <th className="px-2 py-2 font-medium">CPM</th>
              <th className="px-2 py-2 font-medium">{t("ops.discovery.colPlatform")}</th>
              <th className="px-2 py-2 font-medium">{t("ops.intel.rank.momentum")}</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {data.list.map((row, i) => {
              const mom = normalizeTo100(rankMomentum(row).momentumRaw, momMin, momMax);
              const momTone = mom >= 70 ? "success" : mom >= 40 ? "brand" : "muted";
              return (
              <tr key={row.id} className="border-b border-hairline/70 hover:bg-surface-muted/50">
                <td className="px-2 py-2 tabular-nums text-ink-muted">{i + 1}</td>
                <td className="px-2 py-2">
                  <div className="h-10 w-10 overflow-hidden rounded-[var(--radius-control)]">
                    <CoverThumb src={row.image} label={row.title} />
                  </div>
                </td>
                <td className="max-w-[220px] px-2 py-2">
                  <span className="block truncate font-medium text-ink">{row.title}</span>
                  <span className="text-[10px] text-ink-subtle">{row.currency}</span>
                </td>
                <td className="px-2 py-2 tabular-nums text-ink">{fmtUsd(row.usdPrice)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-ink">+{fmtInt(row.countGrowth)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-success">+{fmtGrowthRate(row.growthRate * 100, t("ops.discovery.growthFactor"))}</td>
                <td className="px-2 py-2 text-right tabular-nums text-ink-muted">{row.videoCount}</td>
                <td className="px-2 py-2 tabular-nums text-ink-muted">
                  {row.minCpm != null && row.maxCpm != null ? (
                    <span className="whitespace-nowrap">${row.minCpm}–${row.maxCpm}</span>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-ink-muted">{shopTypeLabel(row.platform)}</span>
                </td>
                <td className="px-2 py-2">
                  <ScorePill value={mom} tone={momTone} />
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => onViewCompetitor(row.id)} className="rounded px-1.5 py-0.5 text-[11px] text-link hover:underline">
                      {t("ops.discovery.actViewComp")}
                    </button>
                    <button type="button" onClick={() => onViewDetail(row.id)} className="rounded px-1.5 py-0.5 text-[11px] text-link hover:underline">
                      {t("ops.discovery.actViewDetail")}
                    </button>
                    <button type="button" onClick={() => onLearn(row.id)} className="rounded px-1.5 py-0.5 text-[11px] text-link hover:underline">
                      {t("ops.discovery.actLearn")}
                    </button>
                    <RowStar id={row.id} active={fav.has(row.id)} onToggle={() => onToggleFav(row.id)} />
                  </div>
                </td>
              </tr>
          );
        })}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} onPage={onPage} meta={data.page} />
    </div>
  );
}

function SearchTable({
  data,
  fav,
  onToggleFav,
  query,
  onViewCompetitor,
  onViewDetail,
  onLearn,
  onPage,
}: {
  data: { list: AdCard[]; page: PageMeta } | null;
  fav: Set<string>;
  onToggleFav: (id: string) => void;
  query: string;
  onViewCompetitor: (id: string) => void;
  onViewDetail: (id: string) => void;
  onLearn: (id: string) => void;
  onPage: (p: number) => void;
}) {
  const t = useT();
  if (!data || data.list.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-subtle">{t("ops.discovery.emptySearch", { q: query })}</p>;
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.list.map((card) => (
          <div key={card.id} className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
            <div className="relative h-36 w-full overflow-hidden">
              <CoverThumb src={card.image} label={card.title} />
              <span className="absolute left-2 top-2">
                <PlatformBadge platform={card.adPlatform[0] ?? "meta"} />
              </span>
              <button
                type="button"
                onClick={() => onLearn(card.id)}
                className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white hover:bg-black/60"
              >
                {t("ops.creatives.learnBtn")}
              </button>
            </div>
            <div className="p-2.5">
              <p className="truncate text-[12px] font-medium text-ink" title={card.title}>{card.title}</p>
              <div className="mt-1 flex items-center justify-between text-[11px] text-ink-muted">
                <span className="tabular-nums">{fmtUsd(card.priceUsd ?? card.price)}</span>
                <span className="truncate text-[10px] text-ink-subtle">{card.adPlatform.join(" · ")}</span>
              </div>
              <AdIntelCard card={card} />
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-subtle">
                <span className="tabular-nums">{t("ops.discovery.searchCard.ads")} {fmtInt(card.adCount)}</span>
                <span className="tabular-nums">{t("ops.discovery.searchCard.active")} {fmtInt(card.activeAdCount)}</span>
                <span className="tabular-nums">{t("ops.discovery.searchCard.reach")} {fmtCompact(card.adAudienceReach)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-[10px] text-ink-subtle" title={card.store.name}>
                  {t("ops.discovery.searchCard.store")} {card.store.name}
                </span>
                <RowStar id={card.id} active={fav.has(card.id)} onToggle={() => onToggleFav(card.id)} />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                {card.sourceProductLink ? (
                  <a
                    href={card.sourceProductLink}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded px-1.5 py-0.5 text-[11px] text-link hover:underline"
                  >
                    {t("ops.discovery.searchCard.source")}
                  </a>
                ) : (
                  <span />
                )}
                <button type="button" onClick={() => onViewDetail(card.id)} className="rounded px-1.5 py-0.5 text-[11px] text-link hover:underline">
                  {t("ops.discovery.actViewDetail")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Pager page={data.page} onPage={onPage} meta={data.page} />
    </div>
  );
}

// tCategory / tCategoryPath 现由 ./ranking-grid 统一导出（主页与独立路由共用）

// --- TikTok 商品榜单（真实落库，不经过 pipispy 计费护栏）---
// --- TikTok 商品榜单（真实落库，不经过 pipispy 计费护栏）---
// 主页仅展示 Top 10 + 类目占比 + 视图入口；完整网格分页/详情抽屉搬至独立路由
// /operations-center/leaderboard/[snapshotId]，避免单一网页代码过长。
function RankingBoard({ shop }: { shop: string }) {
  const t = useT();
  const [snapshots, setSnapshots] = useState<RankingSnapshot[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<number | null>(null);
  const [products, setProducts] = useState<RankingRow[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<RankingRow | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const snaps = await api.fetchRankingSnapshots(shop);
      setSnapshots(snaps);
      const latest = snaps.length ? snaps[0].id : null;
      setSelectedSnapshot(latest);
      if (latest != null) {
        const rows = await api.listRankingProducts(shop, { snapshotId: latest });
        setProducts(rows);
      } else {
        setProducts([]);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadSnapshot = useCallback(
    async (id: number) => {
      setSelectedSnapshot(id);
      setLoading(true);
      setError(false);
      try {
        const rows = await api.listRankingProducts(shop, { snapshotId: id });
        setProducts(rows);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [shop]
  );

  const filtered = useMemo(() => {
    const kw = searchQ.trim().toLowerCase();
    if (!kw) return products;
    return products.filter((p) => (p.productTitle || "").toLowerCase().includes(kw));
  }, [products, searchQ]);

  if (error && snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-destructive-soft bg-destructive-soft px-6 py-12 text-center">
        <p className="text-sm font-medium text-destructive">{t("ops.discovery.board.loadError")}</p>
        <Button size="sm" variant="secondary" onClick={() => void loadAll()}>
          {t("ops.discovery.board.retry")}
        </Button>
      </div>
    );
  }

  if (!loading && snapshots.length === 0 && !error) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-hairline bg-surface-muted px-6 py-16 text-center">
        <p className="text-sm font-medium text-ink">{t("ops.discovery.board.empty")}</p>
        <p className="max-w-md text-[12px] leading-relaxed text-ink-subtle">
          {t("ops.discovery.board.emptyHint")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Select
          label={t("ops.discovery.board.snapshotLabel")}
          value={selectedSnapshot != null ? String(selectedSnapshot) : ""}
          onChange={(v) => void loadSnapshot(Number(v))}
          options={snapshots.map((s) => ({
            value: String(s.id),
            label: s.dateRange,
          }))}
        />
        <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
          <span className="text-[11px] text-ink-subtle">{t("ops.discovery.board.searchLabel")}</span>
          <input
            type="search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={t("ops.discovery.board.searchPlaceholder")}
            className="h-9 w-full min-w-[200px] rounded-[var(--radius-control)] border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </label>
      </div>

      <MultiBoards rows={filtered} snapshotId={selectedSnapshot} onSelect={setSelected} />

      {selectedSnapshot != null && (
        <RankingProductGrid products={filtered} loading={loading} onSelect={setSelected} />
      )}
      <RankingDetailDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// --- 多榜单 2×2 网格：GMV / 增长 / 达人带货 / 转化 ---
type BoardKey = "gmv" | "growth" | "creator" | "conversion";

const BOARD_DEFS: {
  key: BoardKey;
  titleKey: string;
  hintKey: string;
  metricKey: string;
  getValue: (p: RankingRow) => number | null;
  format: (v: number) => string;
}[] = [
  {
    key: "gmv",
    titleKey: "ops.discovery.board.boardGmv",
    hintKey: "ops.discovery.board.boardGmvHint",
    metricKey: "ops.discovery.board.metricGmv",
    getValue: (p) => p.gmvUsd,
    format: (v) => fmtUsd(v),
  },
  {
    key: "growth",
    titleKey: "ops.discovery.board.boardGrowth",
    hintKey: "ops.discovery.board.boardGrowthHint",
    metricKey: "ops.discovery.board.metricGrowth",
    getValue: (p) => p.gmvGrowthRate,
    format: (v) => (v >= 0 ? `+${fmtPercent(v)}` : `−${fmtPercent(Math.abs(v))}`),
  },
  {
    key: "creator",
    titleKey: "ops.discovery.board.boardCreator",
    hintKey: "ops.discovery.board.boardCreatorHint",
    metricKey: "ops.discovery.board.metricCreator",
    getValue: (p) => p.creatorCount,
    format: (v) => fmtInt(v),
  },
  {
    key: "conversion",
    titleKey: "ops.discovery.board.boardConversion",
    hintKey: "ops.discovery.board.boardConversionHint",
    metricKey: "ops.discovery.board.metricConversion",
    getValue: (p) => p.creatorOrderRate,
    format: (v) => fmtPercent(v),
  },
];

function MultiBoards({
  rows,
  snapshotId,
  onSelect,
}: {
  rows: RankingRow[];
  snapshotId: number | null;
  onSelect: (row: RankingRow) => void;
}) {
  const t = useT();
  const locale = useLocale();

  function topBy(getValue: (p: RankingRow) => number | null, n: number): RankingRow[] {
    return [...rows]
      .map((p) => ({ p, v: getValue(p) }))
      .sort((a, b) => {
        if (a.v == null && b.v == null) return 0;
        if (a.v == null) return 1;
        if (b.v == null) return -1;
        return b.v - a.v;
      })
      .slice(0, n)
      .map((x) => x.p);
  }

  if (rows.length === 0) return null;
  const viewAll = t("ops.discovery.board.viewAll");
  // 增长项的 format 需在 hook 内构造（fmtGrowthRate 依赖 t 拿 i18n unit）：
  // - < 300% → "+X%"（常规）
  // - ≥ 300% → "+X.X倍 / x / ×"（节省宽度，99990% → 9.99倍）
  // 其他三项（gmv/creator/conversion）保持 def.format 不变。
  const rowFormat = (key: BoardKey): ((v: number) => string) =>
    key === "growth"
      ? (v) => fmtGrowthRate(v, t("ops.discovery.board.growthFactor"))
      : BOARD_DEFS.find((d) => d.key === key)!.format;
  return (
    <div className="mb-3 grid gap-3 md:grid-cols-2">
      {BOARD_DEFS.map((def) => {
        const top = topBy(def.getValue, 5);
        const moreHref =
          snapshotId != null
            ? localePath(
                locale,
                `/operations-center/leaderboard/${snapshotId}?board=${def.key}`
              )
            : null;
        return (
          <BoardCard
            key={def.key}
            title={t(def.titleKey)}
            hint={t(def.hintKey)}
            metric={t(def.metricKey)}
            rows={top}
            getValue={def.getValue}
            format={rowFormat(def.key)}
            moreHref={moreHref}
            viewAllLabel={viewAll}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

function BoardCard({
  title,
  hint,
  metric,
  rows,
  getValue,
  format,
  moreHref,
  viewAllLabel,
  onSelect,
}: {
  title: string;
  hint: string;
  metric: string;
  rows: RankingRow[];
  getValue: (p: RankingRow) => number | null;
  format: (v: number) => string;
  moreHref: string | null;
  viewAllLabel: string;
  onSelect: (row: RankingRow) => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-ink">{title}</p>
          <p className="mt-0.5 text-[10px] text-ink-subtle">
            {hint} · <span className="text-ink-muted">{metric}</span>
          </p>
        </div>
        {moreHref && (
          <Link
            href={moreHref}
            className="shrink-0 text-[11px] font-medium text-link hover:underline"
          >
            {viewAllLabel} →
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="flex-1 py-6 text-center text-[11px] text-ink-subtle">—</p>
      ) : (
        <ol className="flex flex-1 flex-col gap-1">
          {rows.map((r, i) => {
            const v = getValue(r);
            return (
              <li
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r);
                  }
                }}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                title={r.productTitle}
              >
                <span
                  className={cn(
                    "w-4 shrink-0 text-center text-[11px] font-semibold tabular-nums",
                    i < 3 ? "text-[var(--brand)]" : "text-ink-subtle"
                  )}
                >
                  {i + 1}
                </span>
                <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded bg-surface-muted">
                  <CoverThumb src={r.imageUrl} label={r.productTitle} />
                </div>
                <span className="min-w-0 flex-1 truncate text-ink">{r.productTitle}</span>
                <span className="shrink-0 text-right tabular-nums font-medium text-ink">
                  {v != null ? format(v) : "—"}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function RowStar({ id, active, onToggle }: { id: string; active: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t("ops.discovery.colFav")}
      className={cn("text-base leading-none", active ? "text-amber-400" : "text-ink-subtle hover:text-amber-300")}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
