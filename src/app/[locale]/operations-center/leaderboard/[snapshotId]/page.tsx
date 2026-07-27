"use client";

// 完整榜单视图（独立路由）。主页"榜单"Tab 只展示 Top 10 + 类目占比 + 入口链接，
// 避免单一网页代码过长；此页承担完整分页/类目筛选/详情抽屉的"看更多"职责。

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { Button } from "@/components/ui/button";
import { CoverThumb } from "@/components/operations/cover-thumb";
import { RankingDetailDrawer, RankingKpis, tCategory } from "@/components/operations/ranking-grid";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { HubSidebar } from "@/components/workbench/hub-sidebar";
import { HubRouteGate } from "@/components/workbench/hub-route-gate";
import { SectionGuide } from "@/components/operations/section-guide";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { useOnboarding } from "@/context/onboarding-context";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { fmtGrowthRate, fmtInt, fmtPercent, fmtUsd } from "@/lib/marketing/format";
import type { RankingRow, RankingSnapshot } from "@/lib/marketing/types";
import type { PageMeta } from "@/lib/marketing/types";

const PAGE_SIZE = 24;

export default function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ snapshotId: string }>;
  searchParams: Promise<{ board?: string; category?: string }>;
}) {
  // 注意 hooks 必须无条件在早返之前调用：use(params) 不能放在 HUB_ENABLED 早返后面，
  // 否则 dev 模式会因 hooks 调用顺序不一致抛错，导致「点击查看完整榜单 → 没反应」。
  const { snapshotId } = use(params);
  const sp = use(searchParams);
  return (
    <HubRouteGate>
      <LeaderboardContent
        snapshotId={Number(snapshotId)}
        initialBoard={(sp.board as BoardKey | undefined) ?? "gmv"}
        initialCategory={sp.category ?? "all"}
      />
    </HubRouteGate>
  );
}

// 支持的排序键（与主页 MultiBoards BOARD_DEFS 对齐）
type BoardKey = "gmv" | "growth" | "creator" | "conversion";

function getBoardValue(p: RankingRow, key: BoardKey): number | null {
  switch (key) {
    case "gmv": return p.gmvUsd;
    case "growth": return p.gmvGrowthRate;
    case "creator": return p.creatorCount;
    case "conversion": return p.creatorOrderRate;
  }
}

function formatBoardValue(v: number, key: BoardKey, growthUnit: string): string {
  if (key === "gmv") return fmtUsd(v);
  if (key === "growth") return fmtGrowthRate(v, growthUnit);
  if (key === "creator") return fmtInt(v);
  return fmtPercent(v);
}

function LeaderboardContent({
  snapshotId,
  initialBoard,
  initialCategory,
}: {
  snapshotId: number;
  initialBoard: BoardKey;
  initialCategory: string;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const wb = useWorkbenchPage("operations-center");
  const { shop } = useOnboarding();
  const shopApiName = resolveShopApiName(shop);

  const [snapshot, setSnapshot] = useState<RankingSnapshot | null>(null);
  const [snapshots, setSnapshots] = useState<RankingSnapshot[]>([]);
  const [products, setProducts] = useState<RankingRow[]>([]);
  const [board, setBoard] = useState<BoardKey>(initialBoard);
  const [category, setCategory] = useState(initialCategory);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<RankingRow | null>(null);

  // 加载所有快照 + 当前 snapshot 详情 + 商品
  const load = useCallback(
    async (cat: string) => {
      setLoading(true);
      setError(false);
      try {
        const [snaps, rows] = await Promise.all([
          api.fetchRankingSnapshots(shopApiName),
          api.listRankingProducts(shopApiName, { snapshotId, categoryL1: cat === "all" ? undefined : cat }),
        ]);
        setSnapshots(snaps);
        setSnapshot(snaps.find((s) => s.id === snapshotId) ?? null);
        setProducts(rows);
        setPage(1);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [shopApiName, snapshotId]
  );

  // 类目变化时重新拉取（后端按 categoryL1 过滤）
  useEffect(() => {
    void load(category);
  }, [load, category]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.categoryL1) set.add(p.categoryL1);
    });
    return Array.from(set).sort();
  }, [products]);

  // 按当前榜单键本地排序，null 排末
  const sorted = useMemo(() => {
    return [...products]
      .map((p) => ({ p, v: getBoardValue(p, board) }))
      .sort((a, b) => {
        if (a.v == null && b.v == null) return 0;
        if (a.v == null) return 1;
        if (b.v == null) return -1;
        return b.v - a.v;
      })
      .map((x) => x.p);
  }, [products, board]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const meta: PageMeta = {
    totalCount: sorted.length,
    pageCount,
    currentPage: safePage,
    pageSize: PAGE_SIZE,
    isNext: safePage < pageCount,
  };

  // 切换快照：保留 board 排序
  const handleSwitchSnapshot = (id: number) => {
    const search = new URLSearchParams();
    if (board !== "gmv") search.set("board", board);
    if (category !== "all") search.set("category", category);
    const qs = search.toString();
    router.push(localePath(locale, `/operations-center/leaderboard/${id}${qs ? `?${qs}` : ""}`));
  };

  // 切换榜单排序：刷新 URL（更新 board 参数），分类保留
  const handleSwitchBoard = (next: BoardKey) => {
    setBoard(next);
    setPage(1);
    const search = new URLSearchParams();
    if (next !== "gmv") search.set("board", next);
    if (category !== "all") search.set("category", category);
    const qs = search.toString();
    router.replace(localePath(locale, `/operations-center/leaderboard/${snapshotId}${qs ? `?${qs}` : ""}`));
  };

  const breadcrumbs = [
    { label: t("nav.hub"), href: localePath(locale, "/operations-center") },
    { label: t("ops.tabs.discovery"), href: localePath(locale, "/operations-center?view=discovery") },
    { label: t("ops.leaderboard.breadcrumb") },
  ];

  if (error) {
    return (
      <WorkbenchShell
        sidebar={<HubSidebar />}
        rail={<AssistantRail assistantContent={<SectionGuide tab="discovery" />} strategyCards={null} />}
        {...wb.shellProps}
      >
        <WorkbenchPanel title={t("ops.leaderboard.pageTitle")} breadcrumbs={breadcrumbs} {...wb.panelProps}>
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-destructive-soft bg-destructive-soft px-6 py-12 text-center">
            <p className="text-sm font-medium text-destructive">{t("ops.discovery.board.loadError")}</p>
            <Button size="sm" variant="secondary" onClick={() => void load(category)}>
              {t("ops.discovery.board.retry")}
            </Button>
            <Link href={localePath(locale, "/operations-center")} className="text-[12px] text-link hover:underline">
              {t("ops.leaderboard.back")} →
            </Link>
          </div>
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  return (
    <WorkbenchShell
      sidebar={<HubSidebar />}
      rail={<AssistantRail assistantContent={<SectionGuide tab="discovery" />} strategyCards={null} />}
      {...wb.shellProps}
    >
      <WorkbenchPanel title={t("ops.leaderboard.pageTitle")} breadcrumbs={breadcrumbs} {...wb.panelProps}>
        {/* 头部：返回 + 描述 */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="max-w-2xl text-sm text-ink-muted">{t("ops.leaderboard.subtitle")}</p>
          <Link
            href={localePath(locale, "/operations-center")}
            className="shrink-0 text-[12px] text-link hover:underline"
          >
            ← {t("ops.leaderboard.back")}
          </Link>
        </div>

        {/* 控制栏：快照 + 榜单排序 + 类目筛选 */}
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-ink-subtle">
            {t("ops.leaderboard.snapshotLabel")}
            <select
              value={String(snapshotId)}
              onChange={(e) => handleSwitchSnapshot(Number(e.target.value))}
              className="h-9 rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {snapshots.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.dateRange}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-ink-subtle">
            {t("ops.leaderboard.boardLabel")}
            <select
              value={board}
              onChange={(e) => handleSwitchBoard(e.target.value as BoardKey)}
              className="h-9 rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="gmv">{t("ops.discovery.board.boardGmv")}</option>
              <option value="growth">{t("ops.discovery.board.boardGrowth")}</option>
              <option value="creator">{t("ops.discovery.board.boardCreator")}</option>
              <option value="conversion">{t("ops.discovery.board.boardConversion")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-ink-subtle">
            {t("ops.leaderboard.categoryLabel")}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="all">{t("ops.discovery.board.allCategories")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {tCategory(c)}
                </option>
              ))}
            </select>
          </label>
          <p className="ml-auto self-center text-[11px] text-ink-subtle">
            {t("ops.leaderboard.total", { n: sorted.length })}
          </p>
        </div>

        {/* KPI 概览：与运营中心首屏「榜单」保持一致 */}
        {!loading && <RankingKpis products={products} />}

        {/* 主体：商品卡网格 + 分页 */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-[var(--radius-card)] bg-surface-muted" />
            ))}
          </div>
        ) : paged.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-subtle">{t("ops.leaderboard.empty")}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {paged.map((row) => (
                <RankingCard key={row.id} row={row} onClick={() => setSelected(row)} />
              ))}
            </div>
            {pageCount > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-ink-subtle">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                >
                  ‹
                </Button>
                <span>
                  {safePage} / {pageCount}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage(safePage + 1)}
                >
                  ›
                </Button>
              </div>
            )}
          </>
        )}

        <RankingDetailDrawer row={selected} onClose={() => setSelected(null)} shopName={shopApiName} />
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

function RankingCard({ row, onClick }: { row: RankingRow; onClick?: () => void }) {
  const t = useT();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card transition-colors hover:border-[var(--brand)]"
    >
      <div className="relative h-40 w-full overflow-hidden bg-surface-muted">
        <CoverThumb src={row.imageUrl} label={row.productTitle} />
        {row.rankNo != null && (
          <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            #{row.rankNo}
          </span>
        )}
        {row.categoryL1 && (
          <span className="absolute right-2 top-2 max-w-[60%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
            {tCategory(row.categoryL1)}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="truncate text-[12px] font-medium text-ink" title={row.productTitle}>
          {row.productTitle}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <RankingMetric label={t("ops.discovery.board.price")} value={row.priceUsd != null ? fmtUsd(row.priceUsd) : "—"} />
          <RankingMetric label={t("ops.discovery.board.gmv")} value={row.gmvUsd != null ? fmtUsd(row.gmvUsd) : "—"} />
          <RankingMetric
            label={t("ops.discovery.board.gmvGrowth")}
            value={row.gmvGrowthRate != null ? fmtGrowthRate(row.gmvGrowthRate, t("ops.discovery.board.growthFactor")) : "—"}
            tone={row.gmvGrowthRate != null ? "success" : undefined}
          />
          <RankingMetric label={t("ops.discovery.board.sales")} value={row.salesVolume != null ? fmtInt(row.salesVolume) : "—"} />
          <RankingMetric label={t("ops.discovery.board.creators")} value={row.creatorCount != null ? fmtInt(row.creatorCount) : "—"} />
          <RankingMetric label={t("ops.discovery.board.rating")} value={row.rating != null ? row.rating.toFixed(1) : "—"} />
        </div>
        {row.tiktokUrl && (
          <a
            href={row.tiktokUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-[11px] text-link hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {t("ops.discovery.board.tiktok")}
          </a>
        )}
      </div>
    </div>
  );
}

function RankingMetric({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-ink-subtle">{label}</span>
      <span className={cn("tabular-nums font-medium", tone === "success" ? "text-success" : "text-ink")}>{value}</span>
    </div>
  );
}

