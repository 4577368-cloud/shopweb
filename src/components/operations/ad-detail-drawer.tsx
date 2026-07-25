// 商品 / 创意详情抽屉（设计 §5.1 / 原型 v2）：真实字段（appImage / advertisers / CTA / likes / platform / videoId）
// + 文案不可用降级条 + 视频缩略灰显 + MetricTile 指标网格 + 本条消耗 + 让 Copilot 分析。
"use client";

import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/lib/ui/icons";
import { ctaLabel } from "@/lib/marketing/enums";
import type { AdDetail } from "@/lib/marketing/types";
import { Drawer } from "./drawer";
import { CoverThumb } from "./cover-thumb";
import { PlatformBadge } from "./platform-badge";
import { MetricTile } from "./metric-tile";
import { fmtCompact } from "@/lib/marketing/format";

interface AdDetailDrawerProps {
  detail: AdDetail | null;
  consume: { estimate: number; actual: number; cacheHit: boolean } | null;
  onClose: () => void;
  onAnalyze: (detail: AdDetail) => void;
}

export function AdDetailDrawer({ detail, consume, onClose, onAnalyze }: AdDetailDrawerProps) {
  const t = useT();
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
            <div className="mt-1.5 flex items-center gap-2">
              <PlatformBadge platform={detail.platform} />
              <span className="text-[12px] tabular-nums text-ink-muted">${detail.product.usdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* 指标网格 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricTile label={t("ops.detail.price")} value={`$${detail.product.usdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} tone="brand" />
            <MetricTile label={t("ops.detail.platform")} value={t(`ops.platform.${detail.platform}`)} />
            <MetricTile label={t("ops.creatives.card.likes")} value={fmtCompact(detail.likeCount)} tone="success" />
            <MetricTile label={t("ops.detail.cta")} value={ctaLabel(detail.ctaType)} />
            <MetricTile label={t("ops.detail.advertiser")} value={String(detail.advertisers.length)} />
            <MetricTile label={t("ops.detail.adStarted")} value={detail.adStartedHistory[0] ?? "—"} />
          </div>

          {/* 广告主 */}
          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
            <p className="mb-1 text-[11px] text-ink-muted">{t("ops.detail.advertiser")}</p>
            <div className="flex flex-wrap gap-1">
              {detail.advertisers.map((a) => (
                <span key={a.id} className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink-muted">{a.name}</span>
              ))}
            </div>
          </div>

          {consume && (
            <div className="flex items-center justify-between rounded-[var(--radius-control)] bg-muted px-3 py-2 text-[11px]">
              <span className="text-ink-subtle">{t("ops.detail.thisConsume")}</span>
              <span className="text-ink">
                {consume.cacheHit
                  ? t("ops.detail.cached")
                  : `${consume.actual} ${t("ops.usage.points")}`}
              </span>
            </div>
          )}

          <Button variant="primary" className="w-full" onClick={() => onAnalyze(detail)}>
            <Sparkles className="h-3.5 w-3.5" />
            {t("ops.detail.analyzeBtn")}
          </Button>
        </div>
      )}
    </Drawer>
  );
}
