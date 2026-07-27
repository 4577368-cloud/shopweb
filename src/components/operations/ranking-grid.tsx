// 榜单共享组件：商品卡 / 指标 / 详情抽屉 / 网格分页，主页与独立路由共用。
"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { CoverThumb } from "@/components/operations/cover-thumb";
import { StackedBar, type StackSegment } from "@/components/operations/charts";
import { RankingSourcingPanel } from "@/components/operations/ranking-sourcing-panel";
import { cn } from "@/lib/utils";
import { fmtGrowthRate, fmtInt, fmtPercent, fmtUsd } from "@/lib/marketing/format";
import type { RankingRow } from "@/lib/marketing/types";

/** 榜单类目：上游中文标签 → i18n 翻译（ops.discovery.board.category.{中文名}）。 */
export function tCategory(
  name: string | null | undefined,
  t: (key: string) => string
): string {
  const raw = name?.trim() || "";
  if (!raw) return "";
  const translated = t(`ops.discovery.board.category.${raw}`);
  // i18n 找不到时返回 key 本身（含命名空间前缀），此时回退原始中文
  return translated.startsWith("ops.") ? raw : translated;
}

/** 类目路径 "L1 > L2 > L3" 逐段翻译。 */
export function tCategoryPath(
  path: string | null | undefined,
  t: (key: string) => string
): string {
  if (!path) return "";
  return path
    .split(/\s*>\s*/)
    .map((seg) => tCategory(seg, t))
    .filter(Boolean)
    .join(" > ");
}

const PAGE_SIZE = 24;

// 完整商品卡网格 + 客户端分页。page 内部托管，products 变化时自动回到第 1 页。
export function RankingProductGrid({
  products,
  loading,
  onSelect,
}: {
  products: RankingRow[];
  loading: boolean;
  onSelect: (row: RankingRow) => void;
}) {
  const t = useT();
  const [page, setPage] = useState(1);

  // products 引用变化（切换快照/类目）时回到首页，避免停留在越界页
  useEffect(() => {
    setPage(1);
  }, [products]);

  const pageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const paged = products.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-[var(--radius-card)] bg-surface-muted" />
        ))}
      </div>
    );
  }

  if (paged.length === 0) {
    return <p className="py-12 text-center text-sm text-ink-subtle">{t("ops.leaderboard.empty")}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {paged.map((row) => (
          <RankingCard key={row.id} row={row} onClick={() => onSelect(row)} />
        ))}
      </div>
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-ink-subtle">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
            className="h-7 min-w-7 rounded border border-hairline bg-surface px-2 disabled:opacity-40 hover:enabled:bg-surface-muted"
          >
            ‹
          </button>
          <span className="tabular-nums">
            {safePage} / {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount}
            onClick={() => setPage(safePage + 1)}
            className="h-7 min-w-7 rounded border border-hairline bg-surface px-2 disabled:opacity-40 hover:enabled:bg-surface-muted"
          >
            ›
          </button>
        </div>
      )}
    </>
  );
}

export function RankingKpis({ products }: { products: RankingRow[] }) {
  const t = useT();
  const kpis = useMemo(() => {
    if (products.length === 0) return null;
    const gmvSum = products.reduce((a, p) => a + (p.gmvUsd ?? 0), 0);
    const grows = products.filter((p) => p.gmvGrowthRate != null).map((p) => p.gmvGrowthRate!);
    const avgGrowth = grows.length ? grows.reduce((a, b) => a + b, 0) / grows.length : null;
    const creatorSum = products.reduce((a, p) => a + (p.creatorCount ?? 0), 0);
    const comms = products.filter((p) => p.commissionRate != null).map((p) => p.commissionRate!);
    const avgComm = comms.length ? comms.reduce((a, b) => a + b, 0) / comms.length : null;
    return { gmvSum, count: products.length, avgGrowth, creatorSum, avgComm };
  }, [products]);
  if (!kpis) return null;
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded border border-hairline bg-surface p-2.5">
        <p className="text-[10px] text-ink-subtle">{t("ops.discovery.board.kpiGmvTotal")}</p>
        <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">
          {fmtUsd(kpis.gmvSum)}
        </p>
        <p className="truncate text-[10px] text-ink-muted">
          {t("ops.discovery.board.kpiGmvTotalSub", { n: kpis.count })}
        </p>
      </div>
      <div className="rounded border border-hairline bg-surface p-2.5">
        <p className="text-[10px] text-ink-subtle">{t("ops.discovery.board.kpiAvgGrowth")}</p>
        <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-success">
          {kpis.avgGrowth != null ? fmtGrowthRate(kpis.avgGrowth, t("ops.discovery.board.growthFactor")) : "—"}
        </p>
      </div>
      <div className="rounded border border-hairline bg-surface p-2.5">
        <p className="text-[10px] text-ink-subtle">{t("ops.discovery.board.kpiCreators")}</p>
        <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">{fmtInt(kpis.creatorSum)}</p>
      </div>
      <div className="rounded border border-hairline bg-surface p-2.5">
        <p className="text-[10px] text-ink-subtle">{t("ops.discovery.board.kpiAvgCommission")}</p>
        <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">
          {kpis.avgComm != null ? fmtPercent(kpis.avgComm) : "—"}
        </p>
      </div>
    </div>
  );
}

export function RankingCard({ row, onClick }: { row: RankingRow; onClick?: () => void }) {
  const t = useT();
  const channels: StackSegment[] = [
    { label: t("ops.discovery.board.liveGmv"), value: row.liveGmvUsd ?? 0, color: "#ef4444" },
    { label: t("ops.discovery.board.videoGmv"), value: row.videoGmvUsd ?? 0, color: "#3b82f6" },
    { label: t("ops.discovery.board.cardGmv"), value: row.cardGmvUsd ?? 0, color: "#10b981" },
  ];
  const channelSum = channels.reduce((a, c) => a + c.value, 0) || 1;
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
            {tCategory(row.categoryL1, t)}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="block w-full truncate text-left text-[12px] font-medium text-ink hover:text-link hover:underline focus:outline-none focus-visible:underline"
          title={row.productTitle}
        >
          {row.productTitle}
        </button>
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <RankingMetric label={t("ops.discovery.board.price")} value={row.priceUsd != null ? fmtUsd(row.priceUsd) : "—"} />
          <RankingMetric label={t("ops.discovery.board.avgPrice")} value={row.avgPriceUsd != null ? fmtUsd(row.avgPriceUsd) : "—"} />
          <RankingMetric label={t("ops.discovery.board.gmv")} value={row.gmvUsd != null ? fmtUsd(row.gmvUsd) : "—"} />
          <RankingMetric
            label={t("ops.discovery.board.gmvGrowth")}
            value={row.gmvGrowthRate != null ? fmtGrowthRate(row.gmvGrowthRate, t("ops.discovery.board.growthFactor")) : "—"}
            tone={row.gmvGrowthRate != null ? "success" : undefined}
          />
          <RankingMetric label={t("ops.discovery.board.sales")} value={row.salesVolume != null ? fmtInt(row.salesVolume) : "—"} />
          <RankingMetric label={t("ops.discovery.board.creators")} value={row.creatorCount != null ? fmtInt(row.creatorCount) : "—"} />
          <RankingMetric label={t("ops.discovery.board.commission")} value={row.commissionRate != null ? fmtPercent(row.commissionRate) : "—"} />
          <RankingMetric label={t("ops.discovery.board.rating")} value={row.rating != null ? row.rating.toFixed(1) : "—"} />
        </div>
        {/* GMV 渠道迷你条（直播 / 视频 / 商品卡） */}
        <div className="mt-2">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            {channels.map((c) => (
              <span
                key={c.label}
                style={{ width: `${(c.value / channelSum) * 100}%`, background: c.color }}
                className="h-full"
                title={c.label}
              />
            ))}
          </div>
          <p className="mt-1 text-[10px] text-ink-subtle">{t("ops.discovery.board.gmvComposition")}</p>
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

export function RankingMetric({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-ink-subtle">{label}</span>
      <span className={cn("tabular-nums font-medium", tone === "success" ? "text-success" : "text-ink")}>{value}</span>
    </div>
  );
}

export function RankingDetailDrawer({
  row,
  onClose,
  shopName,
}: {
  row: RankingRow | null;
  onClose: () => void;
  shopName?: string | null;
}) {
  const t = useT();
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  if (!row) return null;

  const channels: StackSegment[] = [
    { label: t("ops.discovery.board.liveGmv"), value: row.liveGmvUsd ?? 0, color: "#ef4444" },
    { label: t("ops.discovery.board.videoGmv"), value: row.videoGmvUsd ?? 0, color: "#3b82f6" },
    { label: t("ops.discovery.board.cardGmv"), value: row.cardGmvUsd ?? 0, color: "#10b981" },
  ];

  const fields: { label: string; value: string }[] = [
    { label: t("ops.discovery.board.price"), value: row.priceUsd != null ? fmtUsd(row.priceUsd) : "—" },
    { label: t("ops.discovery.board.avgPrice"), value: row.avgPriceUsd != null ? fmtUsd(row.avgPriceUsd) : "—" },
    { label: t("ops.discovery.board.rating"), value: row.rating != null ? row.rating.toFixed(1) : "—" },
    { label: t("ops.discovery.board.sales"), value: row.salesVolume != null ? fmtInt(row.salesVolume) : "—" },
    { label: t("ops.discovery.board.gmv"), value: row.gmvUsd != null ? fmtUsd(row.gmvUsd) : "—" },
    { label: t("ops.discovery.board.gmvGrowth"), value: row.gmvGrowthRate != null ? fmtGrowthRate(row.gmvGrowthRate, t("ops.discovery.board.growthFactor")) : "—" },
    { label: t("ops.discovery.board.commission"), value: row.commissionRate != null ? fmtPercent(row.commissionRate) : "—" },
    { label: t("ops.discovery.board.creators"), value: row.creatorCount != null ? fmtInt(row.creatorCount) : "—" },
    { label: t("ops.discovery.board.creatorOrderRate"), value: row.creatorOrderRate != null ? fmtPercent(row.creatorOrderRate) : "—" },
    { label: t("ops.discovery.board.listedAt"), value: row.listedAt ?? "—" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <aside className="relative flex h-full w-full max-w-[420px] flex-col overflow-y-auto bg-surface shadow-2xl" role="dialog" aria-modal="true">
        <div className="flex items-start gap-2 border-b border-hairline p-3">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded bg-surface-muted">
            <CoverThumb src={row.imageUrl} label={row.productTitle} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {row.rankNo != null && (
                <span className="rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">#{row.rankNo}</span>
              )}
              {row.categoryL1 && (
                <span className="truncate rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-ink-subtle">{tCategory(row.categoryL1, t)}</span>
              )}
            </div>
            <p className="mt-1 text-[13px] font-medium leading-snug text-ink">{row.productTitle}</p>
            {row.tiktokUrl && (
              <a
                href={row.tiktokUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[11px] text-link hover:underline"
              >
                {t("ops.discovery.board.tiktok")}
              </a>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-ink-subtle hover:bg-surface-muted" aria-label={t("ops.discovery.board.close")}>
            ×
          </button>
        </div>

        <div className="space-y-4 p-3">
          {/* key 按行重置：换商品时清掉上一个商品的图搜结果与上架状态 */}
          <RankingSourcingPanel
            key={row.id}
            shopName={shopName}
            title={row.productTitle}
            imageUrl={row.imageUrl}
          />

          <div>
            <p className="mb-1.5 text-[12px] font-medium text-ink">{t("ops.discovery.board.gmvComposition")}</p>
            <StackedBar segments={channels} height={12} />
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
              {channels.map((c) => {
                const sum = channels.reduce((a, x) => a + x.value, 0) || 1;
                return (
                  <span key={c.label} className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                    {c.label}: {fmtUsd(c.value)} ({fmtPercent(c.value / sum)})
                  </span>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {fields.map((f) => (
              <div key={f.label} className="flex flex-col rounded border border-hairline bg-surface p-2">
                <span className="text-[10px] text-ink-subtle">{f.label}</span>
                <span className="tabular-nums text-[13px] font-medium text-ink">{f.value}</span>
              </div>
            ))}
          </div>

          {/* 达人转化：达人数中出单率占比（无需额外调用，纯免费面聚合） */}
          <div className="rounded border border-hairline bg-surface p-2">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <span
                style={{ width: `${(row.creatorOrderRate ?? 0) * 100}%` }}
                className="h-full bg-[var(--brand)]"
              />
            </div>
            <p className="mt-1.5 flex items-center justify-between text-[11px] text-ink-subtle">
              <span>
                {row.creatorCount != null ? `${fmtInt(row.creatorCount)} ${t("ops.discovery.board.creators")}` : "—"}
              </span>
              <span>
                {t("ops.discovery.board.creatorOrderRate")}: {row.creatorOrderRate != null ? fmtPercent(row.creatorOrderRate) : "—"}
              </span>
            </p>
          </div>

          {row.categoryPath && (
            <div>
              <p className="mb-0.5 text-[10px] text-ink-subtle">{t("ops.discovery.board.categoryPath")}</p>
              <p className="text-[12px] text-ink">{tCategoryPath(row.categoryPath, t)}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
