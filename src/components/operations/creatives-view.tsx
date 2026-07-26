// 素材视图 · 创意打法库（路线图 P0 第三步 / §4.3）。
// 新定位：不搜也有满屏高价值创意。默认着陆自动拉 adspy/list（公开广告库，关键词可空），
// 无需输入即铺满；关键词搜索走同一端点；「含已停投」开关切到 ad-library/ads（Meta 公开广告库）。
// 卡片展示：封面 / 标题 / 钩子文案 / 点赞·评论·分享 / 投放天数 / CTA / 投放方 —— 商家可直接"抄作业"。
"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Search } from "@/lib/ui/icons";
import { fetchAdspyList } from "@/lib/marketing/api";
import { isGuardCancel } from "@/lib/marketing/guard";
import { CostBadge } from "./cost-badge";
import { CoverThumb } from "./cover-thumb";
import { PlatformBadge } from "./platform-badge";
import { fmtCompact, fmtInt } from "@/lib/marketing/format";
import type {
  CreativeBrief,
  MarketingResponse,
  PageMeta,
} from "@/lib/marketing/types";

type PlatSeg = "all" | "tiktok" | "facebook" | "meta";

interface CreativesViewProps {
  run: <T extends MarketingResponse<unknown>>(endpoint: string, cacheKey: string, fn: () => Promise<T>) => Promise<T>;
  /** 看投放方 / 对标店：跳竞店 Tab 用该名字作种子搜索。 */
  onViewAdvertiser: (name: string) => void;
  initialQuery?: string;
  onQueryChange?: (q: string) => void;
}

export type CreativesViewHandle = {
  fetchCurrent: () => void;
};

export const CreativesView = forwardRef<CreativesViewHandle, CreativesViewProps>(
  function CreativesView({ run, onViewAdvertiser, initialQuery = "", onQueryChange }, ref) {
  const t = useT();
  const [query, setQuery] = useState(initialQuery);
  const [platSeg, setPlatSeg] = useState<PlatSeg>("all");
  const [includeStopped, setIncludeStopped] = useState(false);
  const [data, setData] = useState<{ list: CreativeBrief[]; page: PageMeta } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [cost, setCost] = useState<{ points: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const doFetch = useCallback(
    async (q: string, stopped: boolean) => {
      const kw = q.trim();
      setLoading(true);
      setError(false);
      const cacheKey = `creative:${stopped ? "stopped" : "active"}:${kw.toLowerCase()}`;
      const endpoint = stopped ? "ad-library/ads" : "adspy/list";
      try {
        const res = await run(endpoint, cacheKey, () =>
          fetchAdspyList({ q: kw, includeStopped: stopped, pageSize: 24 })
        );
        setData(res.data);
        setCost({ points: res.consumedCredits ?? 0 });
        setLoaded(true);
      } catch (e) {
        if (!isGuardCancel(e)) setError(true);
      } finally {
        setLoading(false);
      }
    },
    [run]
  );

  // 默认着陆：挂载即自动拉公开广告库（无需输入），满屏创意。
  useEffect(() => {
    void doFetch("", false);
    // 仅首次挂载执行一次（避免 query 同步触发重复请求）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fetchCurrent: () => {
        void doFetch(query, includeStopped);
      },
    }),
    [doFetch, query, includeStopped]
  );

  const visible = data?.list.filter((c) => platSeg === "all" || c.platform === platSeg) ?? [];

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
          onKeyDown={(e) => e.key === "Enter" && doFetch(query, includeStopped)}
          placeholder={t("ops.creatives.searchPlaceholder")}
          className="h-9 min-w-[240px] flex-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <Button variant="primary" size="sm" onClick={() => doFetch(query, includeStopped)} disabled={loading}>
          <Search className="h-3.5 w-3.5" />
          {t("ops.discovery.segSearch")}
        </Button>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 py-1.5 text-[12px] text-ink-muted">
          <input
            type="checkbox"
            checked={includeStopped}
            onChange={(e) => {
              const v = e.target.checked;
              setIncludeStopped(v);
              void doFetch(query, v);
            }}
            className="h-3.5 w-3.5 accent-brand"
          />
          {t("ops.creatives.includeStopped")}
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
        />
        {cost && (
          <CostBadge points={cost.points} />
        )}
      </div>

      {!loaded && loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-[var(--radius-card)] bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-destructive-soft bg-destructive-soft px-6 py-12 text-center">
          <p className="text-sm font-medium text-destructive">{t("ops.error.title")}</p>
          <p className="max-w-md text-[12px] leading-relaxed text-ink-subtle">{t("ops.error.desc")}</p>
          <Button size="sm" variant="secondary" onClick={() => doFetch(query, includeStopped)}>
            {t("ops.error.retry")}
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-subtle">{t("ops.creatives.empty")}</p>
      ) : (
        <>
          <p className="mb-3 text-[12px] text-ink-subtle">{t("ops.creatives.intro")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((card) => (
              <div key={card.id} className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
                <div className="relative h-44 w-full overflow-hidden">
                  <CoverThumb src={card.cover} label={card.title} />
                  <span className="absolute left-2 top-2">
                    <PlatformBadge platform={card.platform} />
                  </span>
                  {!card.isActive && (
                    <span className="absolute right-2 top-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                      {t("ops.creatives.stopped")}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-2.5">
                  <p className="truncate text-[12px] font-semibold text-ink" title={card.title}>{card.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-muted" title={card.copy}>
                    <span className="font-medium text-brand-strong">{t("ops.creatives.card.hookLabel")}: </span>
                    {card.copy}
                  </p>

                  <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-ink-subtle">
                    <span className="tabular-nums">♥ {fmtCompact(card.likes)}</span>
                    <span className="tabular-nums">💬 {fmtCompact(card.comments)}</span>
                    <span className="tabular-nums">↗ {fmtCompact(card.shares)}</span>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-muted">
                    <span className="tabular-nums">{t("ops.creatives.card.days")} {fmtInt(card.activeDays)}</span>
                    <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-strong">
                      {t("ops.creatives.card.cta")} · {card.ctaType}
                    </span>
                  </div>

                  <div className="mt-1.5 truncate text-[10px] text-ink-subtle" title={card.advertiser}>
                    {t("ops.creatives.card.advertiser")} {card.advertiser}
                  </div>

                  <div className="mt-2">
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => onViewAdvertiser(card.advertiser)}>
                      {t("ops.creatives.card.viewAdvertiser")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
