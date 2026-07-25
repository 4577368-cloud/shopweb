// 以图搜视图（v1.5 submit/status/result-summary，设计 §2.6 / 原型 v2）：上传/拖拽图片 → 调 pipispy 以图搜
// → 相似广告结果网格（相似度）+ 点击开创意详情。
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { ExternalLink, ImageOff, Plus, Search } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { fetchImageSearch, IMAGE_SEARCH_CREDITS } from "@/lib/marketing/api";
import type { ImageSearchResult, MarketingResponse, PageMeta } from "@/lib/marketing/types";
import { isGuardCancel } from "@/lib/marketing/guard";
import { CoverThumb } from "./cover-thumb";
import { PlatformBadge } from "./platform-badge";
import { fmtUsd } from "@/lib/marketing/format";

interface AiImageSearchProps {
  run: <T extends MarketingResponse<unknown>>(endpoint: string, cacheKey: string, fn: () => Promise<T>) => Promise<T>;
  onOpenDetail: (adId: string) => void;
  /** 关注此店：把结果店铺名加入左栏关注（竞店）清单。 */
  onFollowStore?: (store: string) => void;
  /** 看竞店：跳到竞店 Tab 并以该店铺名搜。 */
  onViewStore?: (store: string) => void;
}

export function AiImageSearch({ run, onOpenDetail, onFollowStore, onViewStore }: AiImageSearchProps) {
  const t = useT();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [results, setResults] = useState<{ list: ImageSearchResult[]; page: PageMeta } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((file: File | undefined) => {
    if (!file) return;
    setImageFile(file);
    setResults(null);
    setError(false);
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  const submit = useCallback(async () => {
    if (!imageFile) return;
    setSubmitting(true);
    setError(false);
    try {
      const res = await run(
        "ai-search-image",
        `imgsearch:${imageFile.name}:${imageFile.size}`,
        () => fetchImageSearch(imageFile)
      );
      setResults(res.data);
    } catch (e) {
      if (!isGuardCancel(e)) setError(true);
    } finally {
      setSubmitting(false);
    }
  }, [run, imageFile]);

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

      <div className="mb-3 flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={submit} disabled={!imageFile || submitting}>
          <Search className="h-3.5 w-3.5" />
          {submitting ? t("ops.imageSearch.searching") : t("ops.imageSearch.submit")}
        </Button>
        <span className="text-[11px] text-ink-subtle">{t("ops.imageSearch.credits", { n: IMAGE_SEARCH_CREDITS })}</span>
      </div>

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
                const sim = Math.round(r.similarity * 100);
                return (
                  <div
                    key={r.id}
                    className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card transition-shadow hover:shadow-card hover:ring-1 hover:ring-brand"
                  >
                    {/* 看详情（封面上图 + 标题 + 价） */}
                    <button
                      type="button"
                      onClick={() => onOpenDetail(r.id)}
                      className="flex flex-col text-left"
                    >
                      <div className="relative h-40 w-full overflow-hidden">
                        <CoverThumb label={r.title} />
                        <span className="absolute left-2 top-2">
                          <PlatformBadge platform={r.platform} />
                        </span>
                        <span className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {sim}%
                        </span>
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-[12px] font-medium text-ink">{r.title}</p>
                        <p className="mt-1 text-[11px] tabular-nums text-ink-muted">{fmtUsd(r.usdPrice)}</p>
                      </div>
                    </button>

                    {/* 相似度条（更直观，替代纯文字百分比） */}
                    <div className="px-2.5">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${sim}%` }}
                        />
                      </div>
                    </div>

                    {/* 店铺 + 快捷动作：一次 3 点调用产出关注 / 看竞店 后续动作 */}
                    <div className="flex items-center justify-between gap-1 p-2.5 pt-2">
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
