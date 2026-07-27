"use client";

import { useMemo } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import type { TtsShopDetail, TtsShopRow } from "@/lib/marketing/types";
import { ttsSignals } from "@/lib/marketing/derived";
import { regionLabel } from "@/lib/marketing/enums";
import { fmtCompact, fmtDate, fmtInt, fmtPercent, fmtUsd } from "@/lib/marketing/format";
import { Drawer } from "./drawer";
import { CoverThumb } from "./cover-thumb";
import { MetricTile } from "./metric-tile";
import { Sparkline, MiniBar, Tag } from "./intel";
import { cn } from "@/lib/utils";

const PRICE_KEY: Record<"low" | "mid" | "high", string> = {
  low: "ops.intel.tts.priceLow",
  mid: "ops.intel.tts.priceMid",
  high: "ops.intel.tts.priceHigh",
};

interface TtsShopDetailDrawerProps {
  row: TtsShopRow | null;
  detail?: TtsShopDetail | null;
  onClose: () => void;
  onViewCompetitor: (shopName: string) => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void;
}

export function TtsShopDetailDrawer({
  row,
  detail,
  onClose,
  onViewCompetitor,
  isFavorited,
  onToggleFavorite,
}: TtsShopDetailDrawerProps) {
  const t = useT();
  const now = useMemo(() => Math.floor(Date.now() / 1000), [row?.id]);
  const signals = useMemo(
    () => (row ? ttsSignals(row, now) : null),
    [row, now]
  );

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      title={row?.title ?? ""}
      widthClass="max-w-xl"
      footer={
        row ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onToggleFavorite}
              className={cn(
                "rounded px-2 py-1 text-sm",
                isFavorited
                  ? "text-amber-400"
                  : "text-ink-subtle hover:text-amber-300"
              )}
            >
              {isFavorited ? t("ops.discovery.tts.favoriteRemove") : t("ops.discovery.tts.favoriteAdd")}
            </button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                {t("ops.discovery.tts.detailClose")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  onViewCompetitor(row.title);
                  onClose();
                }}
              >
                {t("ops.discovery.actViewComp")}
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      {row && signals ? (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-hairline">
              <CoverThumb src={row.image} label={row.title} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1">
                <Tag tone="muted">{t(PRICE_KEY[signals.priceTier])}</Tag>
                {row.regions.map((r) => (
                  <Tag key={r} tone="muted">
                    {regionLabel(r)}
                  </Tag>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-ink-subtle">
                {t("ops.discovery.tts.detailId")}: {row.id}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricTile
              label={t("ops.discovery.tts.colGmv")}
              value={fmtUsd(row.gmvUsd)}
              tone="brand"
            />
            <MetricTile
              label={t("ops.discovery.tts.colScore")}
              value={row.score.toFixed(1)}
            />
            <MetricTile
              label={t("ops.discovery.tts.colSales")}
              value={fmtCompact(row.salesVolume)}
            />
            <MetricTile
              label={t("ops.discovery.tts.colGoods")}
              value={fmtInt(row.goodsCount)}
            />
            <MetricTile
              label={t("ops.discovery.tts.colVideo")}
              value={fmtInt(row.videoCount)}
            />
            <MetricTile
              label={t("ops.discovery.tts.detailFollowers")}
              value={fmtCompact(row.personCount)}
            />
            <MetricTile
              label={t("ops.discovery.tts.detailAvgPrice")}
              value={fmtUsd(row.avgPriceUsd)}
            />
            <MetricTile
              label={t("ops.discovery.tts.detailPlays")}
              value={fmtCompact(row.playCount)}
            />
            <MetricTile
              label={t("ops.discovery.tts.goodsAdCount")}
              value={fmtInt(row.goodsAdCount)}
            />
            {detail?.adCost ? (
              <MetricTile
                label={t("ops.discovery.tts.detailSpend")}
                value={detail.adCost}
              />
            ) : null}
            {detail?.goodsAdRate != null ? (
              <MetricTile
                label={t("ops.discovery.tts.detailAdRate")}
                value={fmtPercent(detail.goodsAdRate, 0)}
              />
            ) : null}
            <MetricTile
              label={t("ops.intel.tts.shareRate")}
              value={fmtPercent(signals.shareRate, 2)}
            />
          </div>

          <p className="text-[10px] tabular-nums text-ink-subtle">
            {t("ops.discovery.tts.foundTime")}: {row.foundTime ? fmtDate(row.foundTime) : "—"}
            {" · "}
            {t("ops.discovery.tts.lastFoundTime")}: {row.lastFoundTime ? fmtDate(row.lastFoundTime) : "—"}
          </p>

          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-ink-muted">
                {t("ops.discovery.insights.momentum")}
              </span>
              <span
                className={cn(
                  "text-[11px] font-semibold tabular-nums",
                  signals.momentumPct >= 0 ? "text-success" : "text-destructive"
                )}
              >
                {signals.momentumPct >= 0 ? "+" : ""}
                {signals.momentumPct.toFixed(0)}%
              </span>
            </div>
            <Sparkline
              values={row.salesTrendData.map((p) => p.salesVolume)}
              color={signals.momentumPct >= 0 ? "var(--success)" : "var(--destructive)"}
              width={400}
              height={48}
            />
          </div>

          <div className="space-y-2">
            <div>
              <div className="mb-0.5 flex justify-between text-[10px] text-ink-muted">
                <span>{t("ops.intel.tts.penetration")}</span>
                <span>
                  {t("ops.intel.tts.penetrationHint", {
                    pct: Math.round(signals.adPenetration * 100),
                    n: row.goodsCount,
                  })}
                </span>
              </div>
              <MiniBar pct={signals.adPenetration} color="var(--brand)" />
            </div>
            <div>
              <div className="mb-0.5 flex justify-between text-[10px] text-ink-muted">
                <span>{t("ops.intel.tts.topSku")}</span>
                <span>
                  {t("ops.intel.tts.topSkuHint", {
                    pct: Math.round(signals.topSkuShare * 100),
                  })}
                </span>
              </div>
              <MiniBar pct={signals.topSkuShare} color="var(--link)" />
            </div>
          </div>

          {row.categories.length > 0 ? (
            <div>
              <p className="mb-1 text-[11px] font-medium text-ink-muted">
                {t("ops.discovery.tts.colCategory")}
              </p>
              <div className="flex flex-wrap gap-1">
                {row.categories.map((c) => (
                  <Tag key={c.id} tone="muted">
                    {c.nameEn || c.nameZh}
                  </Tag>
                ))}
              </div>
            </div>
          ) : null}

          {row.productType.length > 0 ? (
            <div>
              <p className="mb-1 text-[11px] font-medium text-ink-muted">{t("ops.discovery.tts.productType")}</p>
              <div className="flex flex-wrap gap-1">
                {row.productType.map((p) => (
                  <Tag key={p} tone="muted">{p}</Tag>
                ))}
              </div>
            </div>
          ) : null}
          {row.delivery.length > 0 ? (
            <div>
              <p className="mb-1 text-[11px] font-medium text-ink-muted">{t("ops.discovery.tts.delivery")}</p>
              <div className="flex flex-wrap gap-1">
                {row.delivery.map((d) => (
                  <Tag key={d} tone="muted">{d}</Tag>
                ))}
              </div>
            </div>
          ) : null}

          {detail ? (
            <div className="space-y-2 rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 p-3">
              <p className="text-[11px] font-medium text-ink-muted">
                {t("ops.discovery.tts.detailDomain")}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {detail.rootPath ? (
                  <span className="rounded bg-surface px-1.5 py-0.5 tabular-nums text-ink">
                    {detail.rootPath}
                  </span>
                ) : null}
                {detail.landingPage ? (
                  <a
                    href={detail.landingPage}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link underline-offset-2 hover:underline"
                  >
                    {t("ops.discovery.tts.detailLanding")} ↗
                  </a>
                ) : null}
                {detail.isManaged ? (
                  <Tag tone="brand">{t("ops.discovery.tts.detailManaged")}</Tag>
                ) : null}
                {detail.isInMarketplace ? (
                  <Tag tone="brand">{t("ops.discovery.tts.detailMarketplace")}</Tag>
                ) : null}
                {detail.commissionRate != null ? (
                  <Tag tone="muted">
                    {t("ops.discovery.tts.detailCommission")}: {fmtPercent(detail.commissionRate, 0)}
                  </Tag>
                ) : null}
              </div>
              {detail.desc ? (
                <p className="text-[11px] leading-relaxed text-ink-subtle">
                  {detail.desc}
                </p>
              ) : null}
            </div>
          ) : null}

          {row.bestSellingGoods.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-medium text-ink-muted">
                {t("ops.intel.tts.bestSeller")}
              </p>
              <ul className="space-y-2">
                {row.bestSellingGoods.map((g) => (
                  <li
                    key={g.productId}
                    className="flex items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface p-2"
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded">
                      <CoverThumb src={g.image} label={t("ops.intel.tts.bestSeller")} />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">
                      {g.productId}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-ink">
                      {fmtCompact(g.salesVolume)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
