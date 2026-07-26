// 单品富 dossier 视图（/operations-center/product/[id] 路由页主体）。
// 商品详情（AdDetail，一次 dossier 扇出）+ 市场同类创意墙（relatedAds: CreativeBrief[]）。
"use client";

import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/lib/ui/icons";
import { ctaLabel } from "@/lib/marketing/enums";
import type { AdDetail, ProductDossier } from "@/lib/marketing/types";
import { CoverThumb } from "./cover-thumb";
import { PlatformBadge } from "./platform-badge";
import { MetricTile } from "./metric-tile";
import { fmtCompact, fmtUsd } from "@/lib/marketing/format";

export function ProductDossierView({
  dossier,
  onAnalyze,
}: {
  dossier: ProductDossier;
  onAnalyze?: (detail: AdDetail) => void;
}) {
  const t = useT();
  const detail = dossier.detail;
  const related = dossier.relatedAds ?? [];

  return (
    <div className="space-y-4">
      {/* 媒体 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="relative h-48 w-full overflow-hidden rounded-[var(--radius-card)]">
          <CoverThumb label={detail.product.title} />
        </div>
        <div className="relative h-48 w-full overflow-hidden rounded-[var(--radius-card)] ring-1 ring-hairline">
          <CoverThumb label={`${detail.product.title} · app`} />
          <span className="absolute left-2 top-2 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-ink-muted">
            {t("ops.detail.appImage")}
          </span>
        </div>
      </div>

      {/* 标题 + 平台 */}
      <div>
        <h1 className="text-xl font-semibold text-ink">{detail.product.title}</h1>
        <div className="mt-1.5 flex items-center gap-2">
          <PlatformBadge platform={detail.platform} />
          <span className="text-[12px] tabular-nums text-ink-muted">
            ${detail.product.usdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* 指标网格 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <MetricTile label={t("ops.detail.price")} value={`$${detail.product.usdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} tone="brand" />
        <MetricTile label={t("ops.detail.platform")} value={t(`ops.platform.${detail.platform}`)} />
        <MetricTile label={t("ops.creatives.card.likes")} value={fmtCompact(detail.likeCount)} tone="success" />
        <MetricTile label={t("ops.detail.cta")} value={ctaLabel(detail.ctaType)} />
        <MetricTile label={t("ops.detail.advertiser")} value={String(detail.advertisers.length)} />
        <MetricTile label={t("ops.detail.adStarted")} value={detail.adStartedHistory[0] ?? "—"} />
        <MetricTile label={t("ops.detail.adCost")} value={fmtUsd(detail.adCost)} tone="info" />
        <MetricTile label={t("ops.detail.reach")} value={fmtCompact(detail.adAudienceReach)} />
        <MetricTile label={t("ops.detail.forecast")} value={detail.adForecast || "—"} />
      </div>

      {/* 广告主（外链到广告库） */}
      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
        <p className="mb-1 text-[11px] text-ink-muted">{t("ops.detail.advertiser")}</p>
        <div className="flex flex-wrap gap-1">
          {detail.advertisers.length === 0 ? (
            <span className="text-[10px] text-ink-subtle">—</span>
          ) : (
            detail.advertisers.map((a) => {
              const href = a.adsLibraryLink || a.sourceAdvertiserLink;
              const cls = "rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink-muted hover:text-link hover:underline";
              return href ? (
                <a key={a.id} href={href} target="_blank" rel="noreferrer" className={cls}>
                  {a.name}
                </a>
              ) : (
                <span key={a.id} className={cls}>{a.name}</span>
              );
            })
          )}
        </div>
      </div>

      {onAnalyze && (
        <Button variant="primary" className="w-full" onClick={() => onAnalyze(detail)}>
          <Sparkles className="h-3.5 w-3.5" />
          {t("ops.productPage.analyze")}
        </Button>
      )}

      {/* 市场同类创意墙 */}
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[11px] font-medium text-ink-muted">{t("ops.productPage.related")}</span>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-ink-subtle">{related.length}</span>
        </div>
        {related.length === 0 ? (
          <p className="text-[11px] text-ink-subtle">—</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface">
                <div className="h-24 w-full overflow-hidden">
                  <CoverThumb src={c.cover} label={c.title} />
                </div>
                <div className="px-1.5 py-1">
                  <p className="truncate text-[10px] text-ink" title={c.title}>{c.title}</p>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-ink-subtle">
                    <PlatformBadge platform={c.platform} />
                    <span className="tabular-nums">{t("ops.creatives.card.likes")} {fmtCompact(c.likes)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-ink-muted">{c.advertiser}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
