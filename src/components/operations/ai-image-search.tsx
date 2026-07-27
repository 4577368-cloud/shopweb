// 以图搜视图（真实走后端 /api/plugin/marketing/ai-search-image 编排端点）。
// 支持两种图片来源：①上传/拖拽图片 ②粘贴图片 URL（按用户 q-0「两种都用」）。
// 默认每页 4 条，可调 4/8/12/20（q-1：调节器 + 动态预估消耗 + 谨慎提示）。
// 范围仅产品搜索（q-2：仅产品搜索，最快；真实 product/search 无外链，不跳店铺/商品）。
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { ExternalLink, ImageOff, Plus, Search } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { fetchImageSearch, imageSearchEstimate } from "@/lib/marketing/api";
import type { ImageSearchResult, MarketingResponse, PageMeta } from "@/lib/marketing/types";
import { isGuardCancel } from "@/lib/marketing/guard";
import { CoverThumb } from "./cover-thumb";
import { PlatformBadge } from "./platform-badge";
import { CreditConfirmDialog } from "./credit-confirm-dialog";
import { fmtCompact, fmtUsd } from "@/lib/marketing/format";

interface AiImageSearchProps {
  run: <T extends MarketingResponse<unknown>>(endpoint: string, cacheKey: string, fn: () => Promise<T>) => Promise<T>;
  /** 用户钱包剩余积分（用于确认弹窗展示）。 */
  walletBalance?: number | null;
  /** 关注此店：把结果店铺名加入左栏关注（竞店）清单（真实结果无店铺名时隐藏）。 */
  onFollowStore?: (store: string) => void;
  /** 看竞店：跳到竞店 Tab 并以该店铺名搜（真实结果无店铺名时隐藏）。 */
  onViewStore?: (store: string) => void;
}

const PAGE_SIZES = [4, 8, 12, 20];

export function AiImageSearch({ run, walletBalance, onFollowStore, onViewStore }: AiImageSearchProps) {
  const t = useT();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [results, setResults] = useState<{ list: ImageSearchResult[]; page: PageMeta } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((file: File | undefined) => {
    if (!file) return;
    setImageFile(file);
    setImageUrl("");
    setResults(null);
    setError(false);
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  // 粘贴 URL 时的预览反馈（无文件时）。
  useEffect(() => {
    if (imageFile) return; // 文件预览由 pickFile 管理
    const u = imageUrl.trim();
    if (/^https?:\/\//.test(u)) {
      setPreviewUrl(u);
    } else if (previewUrl && /^https?:\/\//.test(previewUrl)) {
      setPreviewUrl(null);
    }
  }, [imageUrl, imageFile, previewUrl]);

  const estimate = imageSearchEstimate(pageSize);
  const canSubmit = !!(imageFile || imageUrl.trim());

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(false);
    try {
      const res = await run(
        "ai-search-image",
        `imgsearch:${imageUrl.trim() || imageFile?.name || "none"}:${pageSize}`,
        () =>
          fetchImageSearch({
            imageFile,
            imageUrl: imageUrl.trim() || null,
            page: 1,
            pageSize,
          })
      );
      setResults(res.data);
    } catch (e) {
      if (!isGuardCancel(e)) setError(true);
    } finally {
      setSubmitting(false);
    }
  }, [run, imageFile, imageUrl, pageSize, canSubmit]);

  const requestSubmit = useCallback(() => {
    if (!canSubmit) return;
    setConfirmOpen(true);
  }, [canSubmit]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div>
      <p className="mb-3 text-sm text-ink-muted">{t("ops.imageSearch.desc")}</p>

      {/* 上传区 */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pickFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "mb-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-hairline bg-surface-muted/40 px-6 py-10 text-center transition-colors hover:border-brand/50"
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="preview" className="h-24 w-24 rounded object-cover" />
        ) : (
          <ImageOff className="h-7 w-7 text-ink-muted" />
        )}
        <p className="text-[13px] font-medium text-ink">{t("ops.imageSearch.drop")}</p>
        {imageFile && <p className="text-[11px] text-brand">{imageFile.name}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
          }}
        />
      </div>

      {/* 图片 URL 输入（q-0 二选一） */}
      <div className="mb-3">
        <label className="mb-1 block text-[12px] font-medium text-ink-muted">
          {t("ops.imageSearch.imageUrl")}
        </label>
        <input
          type="text"
          value={imageUrl}
          placeholder="https://…"
          onChange={(e) => {
            setImageUrl(e.target.value);
            if (e.target.value.trim()) setImageFile(null);
          }}
          className="w-full rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-brand"
        />
      </div>

      {/* 每页数量调节器（q-1） */}
      <div className="mb-3">
        <label className="mb-1 block text-[12px] font-medium text-ink-muted">
          {t("ops.imageSearch.pageSize")}
        </label>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-[var(--radius-card)] border border-hairline bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-ink-subtle">
            {t("ops.imageSearch.estimate", { n: estimate })}
          </span>
        </div>
        {pageSize > 4 && (
          <p className="mt-1 text-[11px] text-amber-600">{t("ops.imageSearch.caution")}</p>
        )}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={requestSubmit} disabled={!canSubmit || submitting}>
          <Search className="h-3.5 w-3.5" />
          {submitting ? t("ops.imageSearch.searching") : t("ops.imageSearch.submit")}
        </Button>
        <span className="text-[11px] text-ink-subtle">{t("ops.imageSearch.estimate", { n: estimate })}</span>
      </div>

      <CreditConfirmDialog
        open={confirmOpen}
        estimate={estimate}
        remaining={walletBalance}
        onConfirm={() => {
          setConfirmOpen(false);
          void submit();
        }}
        onCancel={() => setConfirmOpen(false)}
      />

      {error && (
        <div className="mb-3 flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-destructive-soft bg-destructive-soft px-6 py-10 text-center">
          <p className="text-sm font-medium text-destructive">{t("ops.error.title")}</p>
          <Button size="sm" variant="secondary" onClick={submit}>
            {t("ops.error.retry")}
          </Button>
        </div>
      )}

      {results && (
        results.list.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-subtle">{t("ops.imageSearch.empty")}</p>
        ) : (
          <>
            <p className="mb-2 text-[11px] text-ink-muted">{t("ops.imageSearch.results")}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {results.list.map((r) => {
                const hasRealImage = typeof r.image === "string" && /^https?:\/\//.test(r.image);
                const showSim = r.similarity > 0;
                const hasStore = !!r.store && r.store !== r.platform;
                type Metric = { label: string; v: number };
                const metrics: Metric[] = [
                  r.playCount != null ? { label: t("ops.creatives.card.plays"), v: r.playCount } : null,
                  r.diggCount != null ? { label: t("ops.creatives.card.likes"), v: r.diggCount } : null,
                  r.commentCount != null ? { label: t("ops.creatives.card.comments"), v: r.commentCount } : null,
                  r.shareCount != null ? { label: t("ops.creatives.card.shares"), v: r.shareCount } : null,
                  r.videoCount != null ? { label: t("ops.imageSearch.videos"), v: r.videoCount } : null,
                  r.putDays != null ? { label: t("ops.creatives.card.days"), v: r.putDays } : null,
                ].filter((m): m is Metric => m !== null);

                return (
                  <div
                    key={r.id}
                    className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card transition-shadow hover:shadow-card hover:ring-1 hover:ring-brand"
                  >
                    {/* 封面（真实返回 CDN 图；mock 用占位） */}
                    <div className="relative h-40 w-full overflow-hidden">
                      {hasRealImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.image} alt={r.title} className="h-full w-full object-cover" />
                      ) : (
                        <CoverThumb label={r.title} />
                      )}
                      <span className="absolute left-2 top-2">
                        <PlatformBadge platform={r.platform} />
                      </span>
                      {showSim && (
                        <span className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {Math.round(r.similarity * 100)}%
                        </span>
                      )}
                    </div>

                    {/* 标题 + 价格 */}
                    <div className="p-2.5">
                      <p className="truncate text-[12px] font-medium text-ink">{r.title}</p>
                      <p className="mt-1 text-[11px] tabular-nums text-ink-muted">
                        {fmtUsd(r.usdPrice)}
                        {r.currency && r.currency !== "USD" ? ` · ${r.currency}` : ""}
                      </p>
                    </div>

                    {/* 富指标墙（真实 product/search 字段） */}
                    {metrics.length > 0 && (
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 px-2.5 pb-1 text-[10px] text-ink-muted">
                        {metrics.map((m) => (
                          <span key={m.label} className="flex items-center justify-between gap-1">
                            <span className="truncate">{m.label}</span>
                            <span className="tabular-nums font-medium text-ink">{fmtCompact(m.v)}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 投放平台标签（ad_platform_list） */}
                    {r.adPlatformList && r.adPlatformList.length > 0 && (
                      <div className="flex flex-wrap gap-1 px-2.5 pb-2">
                        {r.adPlatformList.map((p) => (
                          <span
                            key={p}
                            className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-ink-subtle"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 店铺 + 快捷动作（仅 mock 有真实店铺名；真实 store=platform 时隐藏） */}
                    {hasStore && (
                      <div className="mt-auto flex items-center justify-between gap-1 border-t border-hairline p-2.5 pt-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-subtle" title={r.store}>
                          {r.store}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {onFollowStore && (
                            <button
                              type="button"
                              onClick={() => onFollowStore(r.store)}
                              title={t("ops.imageSearch.follow")}
                              className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] text-ink-muted transition-colors hover:bg-brand-soft hover:text-brand"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">{t("ops.imageSearch.follow")}</span>
                            </button>
                          )}
                          {onViewStore && (
                            <button
                              type="button"
                              onClick={() => onViewStore(r.store)}
                              title={t("ops.imageSearch.viewStore")}
                              className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] text-ink-muted transition-colors hover:bg-brand-soft hover:text-brand"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">{t("ops.imageSearch.viewStore")}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )
      )}
    </div>
  );
}
