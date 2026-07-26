// 商品 / 创意详情抽屉（设计 §5.1 / 原型 v2）：真实字段（appImage / advertisers / CTA / likes / platform / videoId）
// + 文案不可用降级条 + 视频缩略灰显 + MetricTile 指标网格 + 本条消耗 + 让 Copilot 分析。
"use client";

import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/lib/ui/icons";
import { ctaLabel } from "@/lib/marketing/enums";
import type { AdDetail } from "@/lib/marketing/types";
import { Drawer } from "./drawer";
import { CoverThumb } from "./cover-thumb";
import { PlatformBadge } from "./platform-badge";
import { CostBadge } from "./cost-badge";
import { MetricTile } from "./metric-tile";
import { fmtCompact, fmtUsd } from "@/lib/marketing/format";

interface AdDetailDrawerProps {
  detail: AdDetail | null;
  consume: { estimate: number; actual: number; cacheHit: boolean; freeWindow?: boolean } | null;
  onClose: () => void;
  onAnalyze: (detail: AdDetail) => void;
}

export function AdDetailDrawer({ detail, consume, onClose, onAnalyze }: AdDetailDrawerProps) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  return (
    <Drawer open={!!detail} onClose={onClose} title={t("ops.detail.title")} widthClass="max-w-2xl">
      {detail && (
        <div className="space-y-3">
          {/* 媒体：封面 + app 素材图 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="relative h-40 w-full overflow-hidden rounded-[var(--radius-card)]">
              <CoverThumb label={detail.product.title} />
            </div>
            <div className="relative h-40 w-full overflow-hidden rounded-[var(--radius-card)] ring-1 ring-hairline">
              <CoverThumb label={`${detail.product.title} · app`} />
              <span className="absolute left-2 top-2 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-ink-muted">
                {t("ops.detail.appImage")}
              </span>
            </div>
          </div>

          {/* 标题 + 平台 */}
          <div>
            <p className="text-[15px] font-semibold text-ink">{detail.product.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <PlatformBadge platform={detail.platform} />
              <span className="text-[12px] tabular-nums text-ink-muted">
                {detail.product.currency} {fmtUsd(detail.product.price)}
              </span>
              <span className="text-[12px] tabular-nums text-ink-muted">
                · ${detail.product.usdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              {detail.videoId ? (
                <a
                  href={`https://www.tiktok.com/video/${detail.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-link hover:underline"
                >
                  {t("ops.detail.viewVideo")} ↗
                </a>
              ) : null}
            </div>
            <p className="mt-1 text-[10px] tabular-nums text-ink-subtle">
              {t("ops.detail.productId")}: {detail.product.id}
            </p>
          </div>

          {/* 指标网格 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

          {/* 店铺信息 */}
          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
            <p className="mb-1 text-[11px] text-ink-muted">{t("ops.detail.store")}</p>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-ink">{detail.store.name}</span>
              {detail.store.domain && (
                <a
                  href={`https://${detail.store.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-link hover:underline"
                >
                  {detail.store.domain}
                </a>
              )}
            </div>
          </div>

          {/* 广告主（外链到广告库，可看真实广告） */}
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

          {consume && (
            <div className="flex items-center justify-between rounded-[var(--radius-control)] bg-muted px-3 py-2 text-[11px]">
              <span className="text-ink-subtle">{t("ops.detail.thisConsume")}</span>
              <CostBadge
                free={consume.freeWindow}
                cached={consume.cacheHit}
                points={consume.actual}
              />
            </div>
          )}

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => router.push(localePath(locale, `/operations-center/product/${detail.id}`))}
          >
            {t("ops.productPage.viewFull")}
          </Button>

          <Button variant="primary" className="w-full" onClick={() => onAnalyze(detail)}>
            <Sparkles className="h-3.5 w-3.5" />
            {t("ops.detail.analyzeBtn")}
          </Button>
        </div>
      )}
    </Drawer>
  );
}
