// 竞店视图（设计 §4 / 原型 v2）：搜索 + 筛选（平台/AI/短剧/地区/店型）+ 富卡片网格
// + 平台分布堆叠条 + 指标网格 + 标签 + 趋势线 + 多选对比。
"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Search } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { fetchCompetition, fetchStoreSearch } from "@/lib/marketing/api";
import { isGuardCancel } from "@/lib/marketing/guard";
import {
  readMarketingViewState,
  writeMarketingViewState,
} from "@/lib/marketing/session-cache";
import { lifecycleStage, platformMatrix } from "@/lib/marketing/analytics";
import { PLATFORM_META, regionLabel, shopTypeLabel, categoryLabel } from "@/lib/marketing/enums";
import { useReferenceDictionaries } from "@/hooks/use-reference-dictionaries";
import type { AdCard, AdPlatform, StoreAdState, StoreRow, StoreSearchResult, MarketingResponse } from "@/lib/marketing/types";
import { CoverThumb } from "./cover-thumb";
import { PlatformBadge } from "./platform-badge";
import { CostBadge } from "./cost-badge";
import { Sparkline, StackedBar, type StackSegment } from "./charts";
import { fmtCompact, fmtInt, fmtUsd } from "@/lib/marketing/format";
import { storeThreat } from "@/lib/marketing/derived";
import { ScorePill } from "./intel";

interface CompetitionViewProps {
  run: <T extends MarketingResponse<unknown>>(endpoint: string, cacheKey: string, fn: () => Promise<T>) => Promise<T>;
  onOpenDetail: (store: StoreRow) => void;
  onRequestCompare: (stores: StoreRow[]) => void;
  initialQuery?: string;
  initialProductId?: string;
  onQueryChange?: (q: string) => void;
  /** 已关注的竞店 id 集合（localStorage，竞店卡片 ☆）。 */
  collectedIds: Set<string>;
  /** 点击 ☆ 时调；page.tsx 负责把 store 写入 watchlist.toggleCompetitor。 */
  onToggleCollect: (store: StoreRow) => void;
  /** 当前正在同步后端的竞店 id 集合（展示旋转图标）。 */
  togglingIds?: Set<string>;
}

export type CompetitionViewHandle = {
  fetchCurrent: () => void;
};

type PlatSeg = "all" | AdPlatform;

const STATUS_META = {
  1: { label: "active", cls: "bg-success-soft text-success" },
  0: { label: "offline", cls: "bg-muted text-ink-muted" },
  [-1 as StoreAdState]: { label: "stopped", cls: "bg-destructive-soft text-destructive" },
} as Record<StoreAdState, { label: string; cls: string }>;

const PLAT_COLOR: Record<AdPlatform, string> = {
  tiktok: PLATFORM_META.tiktok.dot,
  facebook: PLATFORM_META.facebook.dot,
  meta: PLATFORM_META.meta.dot,
};

function platformSegments(s: StoreRow): StackSegment[] {
  const segs: StackSegment[] = [];
  if (s.tiktok) segs.push({ label: "TikTok", value: s.tiktok.playCount, color: PLAT_COLOR.tiktok });
  if (s.facebook) segs.push({ label: "Facebook", value: s.facebook.playCount, color: PLAT_COLOR.facebook });
  if (s.metaLibrary) segs.push({ label: "Meta", value: s.metaLibrary.playCount, color: PLAT_COLOR.meta });
  return segs;
}

export const CompetitionView = forwardRef<CompetitionViewHandle, CompetitionViewProps>(
  function CompetitionView(
  {
  run,
  onOpenDetail,
  onRequestCompare,
  initialQuery = "",
  initialProductId = "",
  onQueryChange,
  collectedIds,
  onToggleCollect,
  togglingIds,
  },
  ref
) {
  const t = useT();
  const { dictionaries } = useReferenceDictionaries();
  const [query, setQuery] = useState(initialQuery);
  // 当前竞店查询模式：productId 存在 = 「谁在投这款品」；否则按店铺名/ID 搜。
  const [activeProductId, setActiveProductId] = useState<string | null>(
    initialProductId || null
  );
  const [platSeg, setPlatSeg] = useState<PlatSeg>("all");
  const [aiOnly, setAiOnly] = useState(false);
  const [dramaOnly, setDramaOnly] = useState(false);
  const [region, setRegion] = useState("all");
  const [shopType, setShopType] = useState("all");
  const [data, setData] = useState<{ stores: StoreRow[]; products?: AdCard[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);
  const [resolved, setResolved] = useState<StoreSearchResult | null>(null);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const snap = readMarketingViewState<{
      query: string;
      data: { stores: StoreRow[]; products?: AdCard[] };
    }>("competition");
    if (snap?.data) {
      setQuery(snap.query);
      setData(snap.data);
      setSearched(true);
    }
  }, []);

  const doSearch = useCallback(
    async (input: string, productId?: string) => {
      const q = input.trim();
      // 产品视角：用 product_id 查「谁在投这款品」（与这款品相关的跟卖者，而非泛店对比）。
      const pid = productId ?? (q ? undefined : activeProductId ?? undefined);
      if (!q && !pid) return;
      setActiveProductId(pid ?? null);
      setLoading(true);
      setError(false);
      setSearched(true);
      setResolved(null);
      setSearchNotFound(false);
      try {
        // 产品视角：直接走 product_id，无需域名解析。
        if (pid && !q) {
          const res = await run(
            "store/detail/competition/pid",
            `comp:pid:${pid}`,
            () => fetchCompetition({ id: pid, productId: pid, pageSize: 10 })
          );
          setData(res.data);
          writeMarketingViewState("competition", { query: q, data: res.data });
          return;
        }
        // 判断输入是 pipi 内部 ID（13 字符 hex）还是用户可读的域名/店名。
        const looksLikeId = /^[0-9a-f]{10,}$/i.test(q.replace(/\s/g, ""));
        let storeId = q;
        let resolvedStore: StoreSearchResult | null = null;
        if (!looksLikeId) {
          // 精准检索：直接拿与输入精确对应的那一条（pageSize=1，不给备选，避免为候选列表多付费）。
          // 计费：store/list 按实返行数计费 —— 0 行 = 0 分（未找到不计费）；命中仅 1 分。
          const sres = await run(
            "store/list",
            `search:${q.toLowerCase()}`,
            () => fetchStoreSearch({ keyword: q, pageSize: 1 })
          );
          const picked = findResolvedStore(sres.data.list, q);
          if (!picked) {
            setSearchNotFound(true);
            setData({ stores: [] });
            setLoading(false);
            return; // 0 结果 / 无可信匹配 → 显示 notFound（0 行不计费）
          }
          setSearchNotFound(false);
          storeId = picked.id;
          resolvedStore = picked;
        }
        const res = await run(
          "store/detail/competition",
          pid ? `comp:pid:${pid}` : `comp:${storeId}`,
          () => fetchCompetition(pid ? { id: pid, productId: pid, pageSize: 10 } : { id: storeId, pageSize: 10 })
        );
        setData(res.data);
        setResolved(resolvedStore);
        writeMarketingViewState("competition", { query: q, data: res.data });
      } catch (e) {
        if (!isGuardCancel(e)) setError(true);
      } finally {
        setLoading(false);
      }
    },
    [run, activeProductId]
  );

  // 从发现/榜行「看竞店」带 product_id 进入时，自动发起产品视角查询（无需再点一次）。
  useEffect(() => {
    if (initialProductId) {
      void doSearch("", initialProductId);
    } else if (initialQuery) {
      void doSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fetchCurrent: () => {
        void doSearch(query, activeProductId ?? undefined);
      },
    }),
    [doSearch, query, activeProductId]
  );

  const visible = useMemo(() => {
    if (!data) return [];
    return data.stores.filter((s) => {
      if (platSeg !== "all" && !s.platType.includes(platSeg)) return false;
      if (aiOnly && !s.isAi) return false;
      if (dramaOnly && !s.isDrama) return false;
      if (region !== "all" && !s.regions.includes(region)) return false;
      if (shopType !== "all" && s.shopType !== shopType) return false;
      return true;
    });
  }, [data, platSeg, aiOnly, dramaOnly, region, shopType]);

  const summary = useMemo(() => {
    const stores = visible;
    const totalAds = stores.reduce((a, s) => a + s.adCount, 0);
    const totalPlays = stores.reduce((a, s) => a + s.playCount, 0);
    const cpms = stores.flatMap((s) => [s.cpmMin, s.cpmMax]);
    const avgCpm = cpms.length ? cpms.reduce((a, b) => a + b, 0) / cpms.length : 0;
    return { tracked: stores.length, totalAds, totalPlays, avgCpm };
  }, [visible]);

  // 组合级生命周期洞察：统计可见竞品在各投放阶段的数量 + 预算迁移信号数。
  const portfolio = useMemo(() => {
    if (!visible.length) return null;
    const nowSec = Math.max(1, ...visible.map((s) => s.latestFoundTime || 0));
    const counts = { scaling: 0, steady: 0, cooling: 0, stopped: 0 } as Record<string, number>;
    let shifts = 0;
    for (const s of visible) {
      counts[lifecycleStage(s, nowSec).stage] += 1;
      const pm = platformMatrix(s, nowSec);
      const active = pm.filter((p) => p.adState === 1).length;
      const dead = pm.filter((p) => p.adState !== 1).length;
      if (active && dead) shifts += 1;
    }
    return { counts, shifts };
  }, [visible]);

  const selectedStores = useMemo(
    () => (data?.stores ?? []).filter((s) => selected.has(s.id)),
    [data, selected]
  );

  const toggleSelect = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else if (n.size < 4) n.add(id);
      return n;
    });

  return (
    <div>
      {/* 搜索 + 筛选 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            onQueryChange?.(v);
          }}
          onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
          placeholder={t("ops.competition.searchPlaceholder")}
          className="h-9 min-w-[240px] flex-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <Button variant="primary" size="sm" onClick={() => doSearch(query)} disabled={loading}>
          <Search className="h-3.5 w-3.5" />
          {t("ops.competition.queryBtn")}
        </Button>
        <CostBadge free />
      </div>

      {/* 免费服务提示：该店的在投商品列表（competition/products）0 积分，鼓励先用免费入口 */}
      <p className="mb-3 flex items-center gap-2 text-[11px] text-ink-muted">
        {t("ops.competition.freeProductsHint")}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedTabs
          variant="chip"
          tabs={[
            { id: "all", label: t("ops.competition.segAll") },
            { id: "tiktok", label: t("ops.competition.segTiktok") },
            { id: "facebook", label: t("ops.competition.segFacebook") },
            { id: "meta", label: t("ops.competition.segMeta") },
          ]}
          value={platSeg}
          onValueChange={(id) => setPlatSeg(id as PlatSeg)}
        />
        <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <input type="checkbox" checked={aiOnly} onChange={(e) => setAiOnly(e.target.checked)} className="accent-[var(--brand)]" />
          {t("ops.competition.filters.aiOnly")}
        </label>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <input type="checkbox" checked={dramaOnly} onChange={(e) => setDramaOnly(e.target.checked)} className="accent-[var(--brand)]" />
          {t("ops.competition.filters.dramaOnly")}
        </label>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="h-7 rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-[11px] text-ink"
        >
          <option value="all">{t("ops.competition.filters.region")}: {t("ops.competition.filters.all")}</option>
          {dictionaries.region.map((r) => (
            <option key={r.code} value={r.code}>{r.label}</option>
          ))}
        </select>
        <select
          value={shopType}
          onChange={(e) => setShopType(e.target.value)}
          className="h-7 rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-[11px] text-ink"
        >
          <option value="all">{t("ops.competition.filters.shopType")}: {t("ops.competition.filters.all")}</option>
          {dictionaries.shopType.map((s) => (
            <option key={s.code} value={s.code}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* 产品视角上下文条：从发现/榜行「看竞店」带 product_id 进入，标明这是「谁在投这款品」 */}
      {activeProductId && (
        <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-control)] border border-brand-soft bg-brand-soft/30 px-3 py-2 text-[11px]">
          <span className="font-medium text-ink">{t("ops.competition.productContext")}</span>
          <span className="truncate font-mono text-ink-subtle">{activeProductId}</span>
        </div>
      )}

      {/* 域名解析上下文条：用户输入域名/店名 → 检索命中 → 显示「已匹配 + 查看本店」 */}
      {resolved && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-success-soft bg-success-soft/30 px-3 py-2 text-[11px]">
          <span className="font-medium text-ink">{t("ops.competition.resolved", { domain: resolved.domain || resolved.name })}</span>
          {resolved.adCount > 0 && (
            <span className="text-ink-muted">· {fmtInt(resolved.adCount)} {t("ops.competition.resolvedAds")}</span>
          )}
          <button
            type="button"
            onClick={() => onOpenDetail(searchResultToStoreRow(resolved))}
            className="ml-auto rounded-[var(--radius-control)] bg-success px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
          >
            {t("ops.competition.viewThisStore")}
          </button>
        </div>
      )}

      {/* 概览条 */}
      {searched && data && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryStat label={t("ops.competition.summary.tracked")} value={fmtInt(summary.tracked)} />
          <SummaryStat label={t("ops.competition.summary.totalAds")} value={fmtCompact(summary.totalAds)} />
          <SummaryStat label={t("ops.competition.summary.avgCpm")} value={`$${summary.avgCpm.toFixed(1)}`} />
          <SummaryStat label={t("ops.competition.summary.totalPlays")} value={fmtCompact(summary.totalPlays)} />
        </div>
      )}

      {portfolio && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] border border-hairline bg-surface-muted/50 px-3 py-1.5 text-[11px] text-ink-muted">
          <span className="font-medium text-ink-muted">{t("ops.competition.portfolio.title")}</span>
          <span className="text-success">▲ {portfolio.counts.scaling} {t("ops.competition.lifecycle.scaling")}</span>
          <span>● {portfolio.counts.steady} {t("ops.competition.lifecycle.steady")}</span>
          <span className="text-warning">■ {portfolio.counts.cooling} {t("ops.competition.lifecycle.cooling")}</span>
          <span className="text-destructive">■ {portfolio.counts.stopped} {t("ops.competition.lifecycle.stopped")}</span>
          {portfolio.shifts > 0 && (
            <span className="text-warning">· {t("ops.competition.portfolio.shifts", { n: portfolio.shifts })}</span>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-[var(--radius-card)] bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-destructive-soft bg-destructive-soft px-6 py-12 text-center">
          <p className="text-sm font-medium text-destructive">{t("ops.error.title")}</p>
          <p className="max-w-md text-[12px] leading-relaxed text-ink-subtle">{t("ops.error.desc")}</p>
          <Button size="sm" variant="secondary" onClick={() => doSearch(query)}>{t("ops.error.retry")}</Button>
        </div>
      ) : !searched || !data ? (
        <p className="py-16 text-center text-sm text-ink-subtle">{t("ops.fetch.prompt")}</p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-subtle">
          {searchNotFound ? t("ops.competition.notFound", { q: query }) : t("ops.competition.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {activeProductId && data?.products && data.products.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium text-ink">{t("ops.competition.relatedProducts")}</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {data.products.map((p) => (
                  <div key={p.id} className="w-40 shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
                    <div className="relative h-24 w-full overflow-hidden">
                      <CoverThumb src={p.image} label={p.title} />
                    </div>
                    <div className="p-2">
                      <p className="truncate text-[11px] font-medium text-ink" title={p.title}>{p.title}</p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">{fmtUsd(p.priceUsd ?? p.price)}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.adPlatform.map((plat) => (
                          <PlatformBadge key={plat} platform={plat} />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                collected={collectedIds.has(store.id)}
                toggling={!!togglingIds?.has(store.id)}
                selected={selected.has(store.id)}
                onCollect={() => onToggleCollect(store)}
                onToggleSelect={() => toggleSelect(store.id)}
                onOpen={() => onOpenDetail(store)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 调用价值条：1 次竞店查询被组合成多重派生信号，让消耗显得超值 */}
      {visible.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface-muted/40 px-3 py-2 text-[11px] text-ink-muted">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          <span>{t("ops.intel.value", { fields: 30, signals: 9 })}</span>
        </div>
      )}

      {/* 对比浮条：≥1 即出现让 checkbox 有即时反馈，≥2 时才出「对比」按钮 */}
      {selectedStores.length >= 1 && (
        <div className="sticky bottom-3 z-10 mt-4 flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-2.5 shadow-card">
          <span className="text-[12px] text-ink-muted">
            {selectedStores.length >= 2
              ? `${t("ops.competition.compare.hint")} · ${selectedStores.length}/4`
              : `${t("ops.competition.compare.hint1")} · ${selectedStores.length}/4`}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t("ops.competition.compare.clear")}
            </Button>
            {selectedStores.length >= 2 && (
              <Button size="sm" variant="primary" onClick={() => onRequestCompare(selectedStores)}>
                {t("ops.competition.compare.btn", { n: selectedStores.length })}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

/** 精准检索：仅返回与输入精确对应的那一条（不给备选）。无精确匹配则返 null（视为未找到，不计费）。 */
function findResolvedStore(list: StoreSearchResult[], input: string): StoreSearchResult | null {
  if (!list.length) return null;
  const norm = (s: string) =>
    s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  const q = norm(input);
  // 1) 精确域名匹配（含 .myshopify.com 等价变体）
  const exact = list.find((s) => {
    const d = norm(s.domain);
    return d === q || d === `${q}.myshopify.com` || `${d}.myshopify.com` === q;
  });
  if (exact) return exact;
  // 2) 域名或店名与输入明显相关才接受（避免返回毫不相干的店）
  const related = list.find((s) => {
    const d = norm(s.domain);
    const n = s.name.trim().toLowerCase();
    return d.includes(q) || q.includes(d) || n.includes(q) || q.includes(n);
  });
  return related ?? null;
}

/** 把检索候选转成 StoreRow（抽屉只依赖 id/name/rootPath/platType/adState/adCount，其余占位即可）。 */
function searchResultToStoreRow(r: StoreSearchResult): StoreRow {
  return {
    id: r.id,
    storeId: r.id,
    name: r.name,
    rootPath: r.domain,
    icon: r.icon,
    shopType: r.shopType || "shopify",
    platform: r.platType[0] ?? "meta",
    platType: r.platType,
    adCount: r.adCount,
    playCount: 0,
    diggCount: 0,
    putDays: 0,
    foundTime: r.firstAdTime,
    latestFoundTime: r.lastAdTime,
    cpmMin: 0,
    cpmMax: 0,
    cpaMin: 0,
    cpaMax: 0,
    pageCount: 0,
    adState: r.adState,
    monthlyVisits: r.monthlyVisits,
    bounceRate: 0,
    visitSeconds: 0,
    regions: r.region ? [r.region] : [],
    categories: [],
    latestCreatives: [],
    popularPersonCount: 0,
    isAi: false,
    isDrama: false,
    appType2: "web",
    website: {
      url: r.domain,
      title: r.name,
      icon: r.icon,
      monthlyVisits: r.monthlyVisits,
      bounceRate: 0,
      visitSeconds: 0,
      languages: [],
      countries: [],
      currencies: [],
      summary: "",
    },
    tiktok: null,
    facebook: null,
    metaLibrary: null,
    isCollection: false,
    growthSeries: [],
  };
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted px-3 py-2">
      <p className="text-[10px] text-ink-subtle">{label}</p>
      <p className="text-base font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function StoreCard({
  store,
  collected,
  toggling,
  selected,
  onCollect,
  onToggleSelect,
  onOpen,
}: {
  store: StoreRow;
  collected: boolean;
  toggling?: boolean;
  selected: boolean;
  onCollect: () => void;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const t = useT();
  const status = STATUS_META[store.adState];
  const threat = storeThreat(store);
  const threatTone =
    threat.level === "critical" ? "warning" : threat.level === "high" ? "brand" : "muted";
  const segs = platformSegments(store);
  return (
    <div className={cn("flex flex-col rounded-[var(--radius-card)] border bg-surface p-3 shadow-card", selected ? "border-brand ring-1 ring-brand" : "border-hairline")}>
      {/* 头部 */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", status.cls)}>
              {t(`ops.competition.card.${status.label}`)}
            </span>
            <ScorePill value={threat.score} tone={threatTone} />
            <span className="text-[10px] text-ink-subtle">{t("ops.intel.store.threat")} · {t(`ops.intel.store.level.${threat.level}`)}</span>
            {store.platType.map((p) => (
              <PlatformBadge key={p} platform={p} />
            ))}
          </div>
          <p className="mt-1 truncate text-[13px] font-semibold text-ink">{store.name}</p>
          <p className="truncate text-[11px] text-ink-subtle">{store.rootPath} · {shopTypeLabel(store.shopType)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={t("ops.competition.compare.select")}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          <button
            type="button"
            onClick={onCollect}
            disabled={toggling}
            aria-label={t("ops.competition.card.collect")}
            className={cn(
              "text-base leading-none",
              toggling && "opacity-50",
              collected ? "text-amber-400" : "text-ink-subtle hover:text-amber-300"
            )}
          >
            {toggling ? "⟳" : collected ? "★" : "☆"}
          </button>
        </div>
      </div>

      {/* AI / 短剧 标签 */}
      {(store.isAi || store.isDrama) && (
        <div className="mb-2 flex flex-wrap gap-1">
          {store.isAi && <span className="rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-medium text-info">AI</span>}
          {store.isDrama && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">Drama</span>}
        </div>
      )}

      {/* 平台分布 */}
      {segs.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] text-ink-subtle">{t("ops.competition.card.breakdown")}</span>
            <div className="flex items-center gap-2 text-[10px] text-ink-muted">
              {segs.map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
          <StackedBar segments={segs} height={7} />
        </div>
      )}

      {/* 指标网格 */}
      <div className="mb-2 grid grid-cols-3 gap-x-2 gap-y-2 text-[11px]">
        <Mini label={t("ops.competition.card.adCount")} value={fmtCompact(store.adCount)} />
        <Mini label={t("ops.competition.card.plays")} value={fmtCompact(store.playCount)} />
        <Mini label={t("ops.competition.card.digg")} value={fmtCompact(store.diggCount)} />
        <Mini label={t("ops.competition.card.cpm")} value={`$${store.cpmMin}-${store.cpmMax}`} />
        <Mini label={t("ops.competition.card.orders")} value={`${fmtCompact(store.cpaMin)}-${fmtCompact(store.cpaMax)}`} />
        <Mini label={t("ops.competition.card.days")} value={String(store.putDays)} />
        <Mini label={t("ops.competition.card.visits")} value={fmtCompact(store.monthlyVisits)} />
        <Mini label={t("ops.competition.card.popular")} value={fmtCompact(store.popularPersonCount)} />
        <div className="min-w-0">
          <p className="truncate text-[10px] text-ink-subtle">{t("ops.competition.card.days")} trend</p>
          <Sparkline data={store.growthSeries} width={64} height={20} stroke="var(--brand)" fill="var(--brand-soft)" />
        </div>
      </div>

      {/* 类目 / 地区 */}
      <div className="mb-2 flex flex-wrap gap-1">
        {store.categories.map((c) => (
          <span key={c} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-ink-muted">{categoryLabel(c)}</span>
        ))}
        {store.regions.map((r) => (
          <span key={r} className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-subtle">{regionLabel(r)}</span>
        ))}
      </div>

      {/* 最新素材 */}
      {store.latestCreatives.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-[10px] text-ink-subtle">{t("ops.competition.card.latest")}</p>
          <div className="flex gap-1.5">
            {store.latestCreatives.map((c, i) => (
              <div key={i} className="h-[90px] w-[64px] shrink-0 overflow-hidden rounded-[var(--radius-control)] ring-1 ring-hairline transition hover:ring-[var(--brand)]/40">
                <CoverThumb src={c.cover} label={store.name} sub={c.platform} />
              </div>
            ))}
          </div>
        </div>
      )}

      <Button variant="secondary" size="sm" className="mt-auto w-full" onClick={onOpen}>
        {t("ops.competition.card.viewDetail")}
      </Button>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] text-ink-subtle">{label}</p>
      <p className="truncate font-medium tabular-nums text-ink">{value}</p>
    </div>
  );
}
