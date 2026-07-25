// 素材视图（设计 §2.4 / 原型 v2）：搜索 + 平台筛选 + 创意网格（点赞 / CTA / 趋势）+ 点击开详情抽屉。
"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Search } from "@/lib/ui/icons";
import { fetchSearchAds } from "@/lib/marketing/api";
import { isGuardCancel } from "@/lib/marketing/guard";
import {
  readMarketingViewState,
  writeMarketingViewState,
} from "@/lib/marketing/session-cache";
import type { AdCard, AdPlatform, MarketingResponse, PageMeta } from "@/lib/marketing/types";
import { CoverThumb } from "./cover-thumb";
import { PlatformBadge } from "./platform-badge";
import { AdIntelCard } from "./ad-intel-card";
import { fmtCompact, fmtInt, fmtUsd } from "@/lib/marketing/format";

/** 平台分段筛选：真实 adPlatform 为 FACEBOOK/INSTAGRAM/AUDIENCE_NETWORK/MESSENGER/THREADS（ppspy 属 Meta 系）。 */
function matchesSeg(card: AdCard, seg: PlatSeg): boolean {
  if (seg === "all") return true;
  const plats = card.adPlatform.map((p) => p.toUpperCase());
  if (seg === "tiktok") return plats.includes("TIKTOK");
  if (seg === "facebook") return plats.some((p) => p.includes("FACEBOOK") || p.includes("INSTAGRAM"));
  if (seg === "meta") return plats.some((p) => p.includes("AUDIENCE") || p.includes("MESSENGER") || p.includes("THREADS"));
  return false;
}

interface CreativesViewProps {
  run: <T extends MarketingResponse<unknown>>(endpoint: string, cacheKey: string, fn: () => Promise<T>) => Promise<T>;
  onOpenDetail: (adId: string) => void;
  initialQuery?: string;
  onQueryChange?: (q: string) => void;
}

export type CreativesViewHandle = {
  fetchCurrent: () => void;
};

type PlatSeg = "all" | AdPlatform;

export const CreativesView = forwardRef<CreativesViewHandle, CreativesViewProps>(
  function CreativesView({ run, onOpenDetail, initialQuery = "", onQueryChange }, ref) {
  const t = useT();
  const [query, setQuery] = useState(initialQuery);
  const [platSeg, setPlatSeg] = useState<PlatSeg>("all");
  const [data, setData] = useState<{ list: AdCard[]; page: PageMeta } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const snap = readMarketingViewState<{
      query: string;
      data: { list: AdCard[]; page: PageMeta };
    }>("creatives");
    if (snap?.data) {
      setQuery(snap.query);
      setData(snap.data);
      setSearched(true);
    }
  }, []);

  const doSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setLoading(true);
      setError(false);
      setSearched(true);
      try {
        const res = await run(
          "ad-products/search",
          `creative:${trimmed}`,
          () => fetchSearchAds(trimmed, 1, 20)
        );
        setData(res.data);
        writeMarketingViewState("creatives", { query: trimmed, data: res.data });
      } catch (e) {
        if (!isGuardCancel(e)) setError(true);
      } finally {
        setLoading(false);
      }
    },
    [run]
  );

  useImperativeHandle(
    ref,
    () => ({
      fetchCurrent: () => {
        void doSearch(query);
      },
    }),
    [doSearch, query]
  );

  const visible = data?.list.filter((c) => matchesSeg(c, platSeg)) ?? [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            onQueryChange?.(v);
          }}
          onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
          placeholder={t("ops.creatives.searchPlaceholder")}
          className="h-9 min-w-[260px] flex-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <Button variant="primary" size="sm" onClick={() => doSearch(query)} disabled={loading}>
          <Search className="h-3.5 w-3.5" />
          {t("ops.discovery.segSearch")}
        </Button>
      </div>

      <SegmentedTabs
        variant="chip"
        tabs={[
          { id: "all", label: t("ops.competition.segAll") },
          { id: "tiktok", label: t("ops.creatives.segTiktok") },
          { id: "facebook", label: t("ops.creatives.segFacebook") },
          { id: "meta", label: t("ops.creatives.segMeta") },
        ]}
        value={platSeg}
        onValueChange={(id) => setPlatSeg(id as PlatSeg)}
        className="mb-3"
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-[var(--radius-card)] bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-destructive-soft bg-destructive-soft px-6 py-12 text-center">
          <p className="text-sm font-medium text-destructive">{t("ops.error.title")}</p>
          <p className="max-w-md text-[12px] leading-relaxed text-ink-subtle">{t("ops.error.desc")}</p>
          <Button size="sm" variant="secondary" onClick={() => doSearch(query)}>
            {t("ops.error.retry")}
          </Button>
        </div>
      ) : !searched ? (
        <p className="py-16 text-center text-sm text-ink-subtle">{t("ops.fetch.prompt")}</p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-subtle">{t("ops.creatives.empty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((card) => (
            <div key={card.id} className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
              <div className="relative h-40 w-full overflow-hidden">
                <CoverThumb src={card.image} label={card.title} />
                <span className="absolute left-2 top-2">
                  <PlatformBadge platform={card.adPlatform[0] ?? "meta"} />
                </span>
              </div>
              <div className="flex flex-1 flex-col p-2.5">
                <p className="truncate text-[12px] font-medium text-ink" title={card.title}>{card.title}</p>

                <div className="mt-1 flex items-center justify-between text-[11px] text-ink-muted">
                  <span className="tabular-nums">{fmtUsd(card.priceUsd ?? card.price)}</span>
                  <span className="truncate text-[10px] text-ink-subtle">{card.adPlatform.join(" · ")}</span>
                </div>

                <AdIntelCard card={card} />

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-subtle">
                  <span className="tabular-nums">{t("ops.creatives.card.ads")} {fmtInt(card.adCount)}</span>
                  <span className="tabular-nums">{t("ops.creatives.card.active")} {fmtInt(card.activeAdCount)}</span>
                  <span className="tabular-nums">{t("ops.creatives.card.reach")} {fmtCompact(card.adAudienceReach)}</span>
                </div>

                <div className="mt-1.5 truncate text-[10px] text-ink-subtle" title={card.store.name}>
                  {t("ops.creatives.card.store")} {card.store.name} · {card.store.country}
                </div>

                <div className="mt-2 flex gap-1.5">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => onOpenDetail(card.id)}>
                    {t("ops.creatives.card.viewDetail")}
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => onOpenDetail(card.id)}>
                    {t("ops.creatives.learnBtn")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
