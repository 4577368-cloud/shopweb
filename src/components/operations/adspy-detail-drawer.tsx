// Adspy 创意详情抽屉（adspy/detail；按列表 video_id 取）。
// 富字段落地：可播视频 + AI 创意分析（语言/出镜/主钩子/脚本/标签）+ 受众定向 + 落地页内容列表
// + 广告成本（ad_fee / CPM / CPA）+ TikTok 关联 + App 信息。复用 run 的 3 天免费窗口 + CreditConfirmDialog。
"use client";

import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Sparkles } from "@/lib/ui/icons";
import { Drawer } from "./drawer";
import { CoverThumb } from "./cover-thumb";
import { PlatformBadge } from "./platform-badge";
import { CostBadge } from "./cost-badge";
import { MetricTile } from "./metric-tile";
import { fmtCompact, fmtUsd } from "@/lib/marketing/format";
import type { AdspyDetail, CreativeBrief } from "@/lib/marketing/types";

interface ConsumeInfo {
  actual: number;
  cacheHit: boolean;
  freeWindow?: boolean;
}

interface AdspyDetailDrawerProps {
  brief: CreativeBrief | null;
  detail: AdspyDetail | null;
  consume: ConsumeInfo | null;
  loading?: boolean;
  onClose: () => void;
  onAnalyze: (detail: AdspyDetail) => void;
}

function genderLabel(t: (k: string) => string, g: string): string {
  if (g === "female") return t("ops.adspyDetail.genderFemale");
  if (g === "male") return t("ops.adspyDetail.genderMale");
  return t("ops.adspyDetail.genderAll");
}

export function AdspyDetailDrawer({ brief, detail, consume, loading, onClose, onAnalyze }: AdspyDetailDrawerProps) {
  const t = useT();
  return (
    <Drawer open={!!brief} onClose={onClose} title={t("ops.adspyDetail.title")} widthClass="max-w-2xl">
      {brief && (
        <div className="space-y-3">
          {loading && !detail ? (
            <div className="flex h-64 items-center justify-center text-[12px] text-ink-muted">
              {t("ops.adspyDetail.loading")}
            </div>
          ) : detail ? (
            <>
              {/* 媒体：可播视频（type=1）或封面 */}
              <div className="relative h-56 w-full overflow-hidden rounded-[var(--radius-card)] bg-black">
                {detail.videoType === 1 && detail.videoUrl ? (
                  <video
                    src={detail.videoUrl}
                    poster={detail.cover}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <CoverThumb src={detail.cover} label={detail.title} />
                )}
                <span className="absolute left-2 top-2">
                  <PlatformBadge platform={detail.platform} />
                </span>
                <span className="absolute left-2 bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
                  {detail.videoType === 1 && detail.videoUrl
                    ? t("ops.creatives.adType.video")
                    : t("ops.creatives.adType.image")}
                  {detail.duration ? ` · ${detail.duration}s` : ""}
                </span>
                {!detail.isActive && (
                  <span className="absolute right-2 top-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                    {t("ops.creatives.stopped")}
                  </span>
                )}
              </div>

              {/* 标题 + 投放方 */}
              <div>
                <p className="text-[15px] font-semibold text-ink">{detail.title}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-ink-muted">{t("ops.creatives.card.advertiser")}: {detail.advertiser}</span>
                  {detail.advertiserPage ? (
                    <a href={detail.advertiserPage} target="_blank" rel="noreferrer" className="text-[11px] text-link hover:underline">
                      {t("ops.creatives.card.viewPage")} ↗
                    </a>
                  ) : null}
                </div>
              </div>

              {/* 互动指标 */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricTile label={t("ops.creatives.card.likes")} value={fmtCompact(detail.likes)} tone="success" />
                <MetricTile label={t("ops.creatives.card.comments")} value={fmtCompact(detail.comments)} />
                <MetricTile label={t("ops.creatives.card.shares")} value={fmtCompact(detail.shares)} />
                <MetricTile label={t("ops.creatives.card.days")} value={String(detail.activeDays)} />
              </div>

              {/* AI 创意分析 */}
              {detail.aiAnalysis ? (
                <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
                  <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("ops.adspyDetail.aiAnalysis")}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <div className="flex gap-1">
                      <span className="text-ink-subtle">{t("ops.adspyDetail.language")}:</span>
                      <span className="text-ink">{detail.aiAnalysis.language || "—"}</span>
                    </div>
                    <div className="flex gap-1">
                      <span className="text-ink-subtle">{t("ops.adspyDetail.humanPresenter")}:</span>
                      <span className="text-ink">{detail.aiAnalysis.humanPresenter || "—"}</span>
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <span className="text-[11px] text-ink-subtle">{t("ops.adspyDetail.mainHook")}: </span>
                    <span className="text-[12px] font-medium text-brand-strong">{detail.aiAnalysis.mainHook}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-[11px] text-ink-subtle">{t("ops.adspyDetail.script")}:</span>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-ink">{detail.aiAnalysis.script}</p>
                  </div>
                  {detail.aiAnalysis.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {detail.aiAnalysis.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink-muted">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* 受众定向 */}
              {detail.audience ? (
                <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
                  <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("ops.adspyDetail.audience")}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <div className="flex gap-1">
                      <span className="text-ink-subtle">{t("ops.adspyDetail.region")}:</span>
                      <span className="text-ink">{detail.audience.region.join(", ") || "—"}</span>
                    </div>
                    <div className="flex gap-1">
                      <span className="text-ink-subtle">{t("ops.adspyDetail.gender")}:</span>
                      <span className="text-ink">{genderLabel(t, detail.audience.gender)}</span>
                    </div>
                    <div className="flex gap-1">
                      <span className="text-ink-subtle">{t("ops.adspyDetail.age")}:</span>
                      <span className="text-ink">{detail.audience.age || "—"}</span>
                    </div>
                    <div className="flex gap-1">
                      <span className="text-ink-subtle">{t("ops.adspyDetail.category")}:</span>
                      <span className="text-ink">{detail.audience.category || "—"}</span>
                    </div>
                    <div className="col-span-2 flex gap-1">
                      <span className="text-ink-subtle">{t("ops.adspyDetail.covered")}:</span>
                      <span className="text-ink">{detail.audience.covered || "—"}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* 落地页 / 内容列表 */}
              {detail.contentList.length > 0 && (
                <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
                  <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("ops.adspyDetail.content")}</p>
                  <div className="space-y-2">
                    {detail.contentList.map((c, i) => (
                      <div key={i} className="rounded border border-hairline bg-surface px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12px] font-medium text-ink">{c.title || "—"}</span>
                          <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-strong">{c.cta}</span>
                        </div>
                        {c.desc ? <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-muted">{c.desc}</p> : null}
                        {c.landingPage ? (
                          <a href={c.landingPage} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-[10px] text-link hover:underline">
                            {t("ops.adspyDetail.landing")}: {c.landingPage} ↗
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 广告成本 */}
              <div className="grid grid-cols-3 gap-2">
                <MetricTile label={t("ops.adspyDetail.adFee")} value={detail.adFee != null ? fmtUsd(detail.adFee) : "—"} tone="info" />
                <MetricTile
                  label={t("ops.adspyDetail.cpm")}
                  value={detail.minCpm != null && detail.maxCpm != null ? `${detail.minCpm}~${detail.maxCpm}` : "—"}
                />
                <MetricTile label={t("ops.adspyDetail.cpa")} value={detail.cpa != null ? fmtUsd(detail.cpa) : "—"} />
              </div>

              {/* TikTok 关联 */}
              {(detail.tiktokAuthor || detail.tiktokShop) && (
                <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
                  <p className="mb-1 text-[11px] font-medium text-ink-muted">{t("ops.adspyDetail.tiktok")}</p>
                  <div className="flex flex-wrap gap-3 text-[11px]">
                    {detail.tiktokAuthor ? (
                      <a href={`https://www.tiktok.com/${detail.tiktokAuthor}`} target="_blank" rel="noreferrer" className="text-link hover:underline">
                        {t("ops.adspyDetail.author")}: {detail.tiktokAuthor} ↗
                      </a>
                    ) : null}
                    {detail.tiktokShop ? (
                      <a href={detail.tiktokShop} target="_blank" rel="noreferrer" className="text-link hover:underline">
                        {t("ops.adspyDetail.shop")} ↗
                      </a>
                    ) : null}
                  </div>
                </div>
              )}

              {/* App 信息 */}
              {detail.app && Object.keys(detail.app).length > 0 && (
                <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
                  <p className="mb-1 text-[11px] font-medium text-ink-muted">{t("ops.adspyDetail.app")}</p>
                  <div className="space-y-0.5 text-[11px]">
                    {Object.entries(detail.app).map(([k, v]) => (
                      <div key={k} className="flex gap-1">
                        <span className="text-ink-subtle">{k}:</span>
                        {v.startsWith("http") ? (
                          <a href={v} target="_blank" rel="noreferrer" className="truncate text-link hover:underline">{v}</a>
                        ) : (
                          <span className="truncate text-ink">{v}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {consume && (
                <div className="flex items-center justify-between rounded-[var(--radius-control)] bg-muted px-3 py-2 text-[11px]">
                  <span className="text-ink-subtle">{t("ops.detail.thisConsume")}</span>
                  <CostBadge free={consume.freeWindow} cached={consume.cacheHit} points={consume.actual} />
                </div>
              )}

              <Button variant="primary" className="w-full" onClick={() => onAnalyze(detail)}>
                <Sparkles className="h-3.5 w-3.5" />
                {t("ops.detail.analyzeBtn")}
              </Button>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center text-[12px] text-ink-subtle">
              {t("ops.error.desc")}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
