"use client";

import { useMemo } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import type { TtsShopRow } from "@/lib/marketing/types";
import { ttsSignals } from "@/lib/marketing/derived";
import { regionLabel } from "@/lib/marketing/enums";
import { fmtCompact, fmtInt, fmtPercent, fmtUsd } from "@/lib/marketing/format";
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
  onClose: () => void;
  onViewCompetitor: (shopName: string) => void;
}

export function TtsShopDetailDrawer({
  row,
  onClose,
  onViewCompetitor,
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
          <div className="flex justify-end gap-2">
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
              label={t("ops.intel.tts.shareRate")}
              value={fmtPercent(signals.shareRate, 2)}
            />
          </div>

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
