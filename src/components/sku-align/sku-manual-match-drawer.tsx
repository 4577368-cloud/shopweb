"use client";

import { ThumbImage } from "@/components/ui/thumb-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  ImageOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { api, readableError } from "@/lib/api";
import { runImageSearchPipeline } from "@/lib/batch-link/image-search-pipeline";
import { mapSkuAlignError } from "@/lib/sku-align/errors";
import {
  buildAutoSuggestions,
  COVERAGE_MATCH_THRESHOLD,
  type DrawerPhase,
  filterSupplementCandidates,
  rankCandidatesByCoverage,
  resolveCandidateOfferId,
  supplementGapVariantsFromOverview,
  type RankedCoverageCandidate,
} from "@/lib/sku-align/drawer-helpers";
import { manualBindWithFallback } from "@/lib/sku-align-v1/compat";
import { recordBinding } from "@/lib/sku-align/learned-aliases";
import { fetchSpecMatchLlm, grayZoneRows } from "@/lib/sku-align/spec-match-llm";
import { pollSkuAlignRun } from "@/lib/sku-align-v1";
import type { SkuAlignProductDetail } from "@/lib/sku-align-v1/types";
import {
  fetchSourceSkuMatrixResult,
  findSourceSkuRow,
  rankSourceSkuRows,
  type SourceSkuRow,
} from "@/lib/source-sku-matrix";
import {
  countUnbound,
  deriveVariantDisplayState,
} from "@/lib/sku-align/display";
import {
  formatShopListingPrice,
  formatSourceCostInShopCurrency,
} from "@/lib/purchase-cost-display";
import type { ImageSearchProduct, PricingTemplate, SkuProductOverview, SkuVariant } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Helper components                                                   */
/* ------------------------------------------------------------------ */

function VariantThumb({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted",
        className ?? "h-10 w-10"
      )}
    >
      {src ? (
        <ThumbImage
          src={src}
          alt={alt}
          fill
          sizes="40px"
          pixelWidth={80}
          className="object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-subtle">
          <ImageOff className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}

function formatOptionPrice(
  price?: number | null,
  shopCurrency?: string | null,
  pricingTemplate?: PricingTemplate | null
): string {
  if (price == null || Number.isNaN(price)) return "—";
  return (
    formatSourceCostInShopCurrency(price, shopCurrency, pricingTemplate) ??
    `${price.toFixed(2)} CNY`
  );
}

function truncateMerchant(title?: string | null, max = 22): string {
  const t = (title ?? "").trim();
  if (!t) return "未知货源";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/* ------------------------------------------------------------------ */
/*  Drawer props                                                        */
/* ------------------------------------------------------------------ */

export interface SkuManualMatchDrawerProps {
  open: boolean;
  onClose: () => void;
  product: SkuProductOverview;
  shopName: string;
  detailUrl: string | null;
  tangbuyProductId: string | null;
  focusVariantId?: string | null;
  initialPhase?: DrawerPhase;
  v1Detail?: SkuAlignProductDetail | null;
  pricingTemplate?: PricingTemplate | null;
  onSaved: () => Promise<void>;
  showToast: (message: string) => void;
}

/** Per-gap supplement mapping: which searched merchant + which SKU. */
interface GapAssignment {
  candidateKey: string;
  skuId: string;
}

const candidateKeyOf = (c: ImageSearchProduct): string =>
  c.internalGoodsId || c.productId;

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function SkuManualMatchDrawer({
  open,
  onClose,
  product,
  shopName,
  detailUrl,
  tangbuyProductId,
  focusVariantId,
  initialPhase = "primary",
  v1Detail,
  pricingTemplate = null,
  onSaved,
  showToast,
}: SkuManualMatchDrawerProps) {
  /* ---------- state ---------- */
  const [phase, setPhase] = useState<DrawerPhase>("primary");
  const [matrix, setMatrix] = useState<SourceSkuRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  /** 灰区 LLM 复核置信度（pairKey→0-1）。 */
  const [llmScores, setLlmScores] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RankedCoverageCandidate[]>([]);
  const [candidateMatrices, setCandidateMatrices] = useState<Map<string, SourceSkuRow[]>>(
    new Map()
  );
  const [gapAssignments, setGapAssignments] = useState<Record<string, GapAssignment>>({});
  const [registering, setRegistering] = useState(false);

  const focusRef = useRef<HTMLDivElement>(null);
  const hasSupplementOffer = Boolean(v1Detail?.supplementOffer?.offerId?.trim());
  const canPick = Boolean(detailUrl?.trim() && tangbuyProductId?.trim());

  /* ---------- derived ---------- */
  const supplementGaps = useMemo(
    () => supplementGapVariantsFromOverview(product.variants, matrix, v1Detail),
    [product.variants, matrix, v1Detail]
  );

  const autoSuggestions = useMemo(
    () => buildAutoSuggestions(product.variants, matrix, selections, llmScores),
    [product.variants, matrix, selections, llmScores]
  );

  const alignedCount = useMemo(
    () =>
      product.variants.filter(
        (v) =>
          deriveVariantDisplayState(v) === "active_auto" ||
          deriveVariantDisplayState(v) === "manual_active"
      ).length,
    [product.variants]
  );

  const unboundCount = useMemo(() => countUnbound(product), [product]);

  const candidateByKey = useMemo(() => {
    const map = new Map<string, RankedCoverageCandidate>();
    for (const c of candidates) map.set(candidateKeyOf(c.candidate), c);
    return map;
  }, [candidates]);

  const currentMerchantTitle =
    v1Detail?.primaryOffer?.title?.trim() || product.title?.trim() || "当前货源";
  const currentMerchantImage =
    v1Detail?.primaryOffer?.imageUrl?.trim() ||
    product.variants.find((v) => v.bound?.offerImageUrl)?.bound?.offerImageUrl ||
    null;

  /* ---------- helpers ---------- */
  const reset = useCallback(() => {
    setPhase("primary");
    setMatrix([]);
    setLoading(false);
    setLoadError(null);
    setSelections({});
    setSaving(false);
    setSaveError(null);
    setSearchLoading(false);
    setSearchError(null);
    setCandidates([]);
    setCandidateMatrices(new Map());
    setGapAssignments({});
    setRegistering(false);
    setLlmScores({});
  }, []);

  /** 灰区 LLM 复核：仅对结构分模糊的候选调用一次模型，结果融入建议/排序。旁路增强。 */
  const refineGrayZone = useCallback(
    async (rows: SourceSkuRow[]) => {
      if (!rows.length) return;
      const pairs: Array<{ variantLabel: string; specLabel: string }> = [];
      for (const variant of product.variants) {
        if (variant.bound?.tangbuySkuId?.trim()) continue;
        const ranked = rankSourceSkuRows(rows, variant.optionLabel, {
          variantPrice: variant.price,
          variantImageUrl: variant.imageUrl,
        });
        for (const r of grayZoneRows(ranked)) {
          pairs.push({ variantLabel: variant.optionLabel, specLabel: r.specLabel });
        }
        if (pairs.length >= 12) break;
      }
      if (!pairs.length) return;
      const scores = await fetchSpecMatchLlm(pairs.slice(0, 12));
      if (Object.keys(scores).length) {
        setLlmScores((prev) => ({ ...prev, ...scores }));
      }
    },
    [product.variants]
  );

  const loadMatrix = useCallback(async () => {
    if (!detailUrl?.trim()) {
      setLoadError("缺少货源详情链接，无法加载规格表");
      setMatrix([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { rows, error } = await fetchSourceSkuMatrixResult(detailUrl);
      setMatrix(rows);
      if (error) setLoadError(error);
      else if (!rows.length) setLoadError("该货源未返回可用规格");
      else void refineGrayZone(rows);
    } catch (err) {
      setMatrix([]);
      setLoadError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [detailUrl, refineGrayZone]);

  /** Auto-assign each gap variant to the best-covering searched merchant + SKU. */
  const autoAssignGaps = useCallback(
    (
      ranked: RankedCoverageCandidate[],
      matrices: Map<string, SourceSkuRow[]>,
      gaps: SkuVariant[]
    ): Record<string, GapAssignment> => {
      const out: Record<string, GapAssignment> = {};
      for (const variant of gaps) {
        let best: { key: string; skuId: string; score: number } | null = null;
        for (const item of ranked) {
          const key = candidateKeyOf(item.candidate);
          const m = matrices.get(key) ?? [];
          if (!m.length) continue;
          const top = rankSourceSkuRows(m, variant.optionLabel, {
            variantPrice: variant.price,
            variantImageUrl: variant.imageUrl,
          })[0];
          if (!top || top.matchScore < COVERAGE_MATCH_THRESHOLD) continue;
          if (!best || top.matchScore > best.score) {
            best = { key, skuId: top.skuId, score: top.matchScore };
          }
        }
        if (best) out[variant.thirdPlatformSkuId] = { candidateKey: best.key, skuId: best.skuId };
      }
      return out;
    },
    []
  );

  const runSupplementSearch = useCallback(async () => {
    setSearchLoading(true);
    setSearchError(null);
    setCandidates([]);
    setCandidateMatrices(new Map());
    setGapAssignments({});
    try {
      const pipeline = await runImageSearchPipeline(
        shopName,
        {
          thirdPlatformItemId: product.thirdPlatformItemId,
          title: product.title,
          primaryImageUrl: product.imageUrl,
        },
        6
      );
      if (pipeline.error) {
        setSearchError(pipeline.error);
        return;
      }
      const boundOfferIds = Array.from(
        new Set(
          product.variants
            .map((v) => v.bound?.tangbuyProductId?.trim())
            .filter((id): id is string => Boolean(id))
        )
      );
      const filtered = filterSupplementCandidates(pipeline.rankedItems, {
        tangbuyProductId,
        detailUrl,
        primaryOfferId: v1Detail?.primaryOffer?.offerId,
        primaryOfferDetailUrl: v1Detail?.primaryOffer?.detailUrl,
        supplementOfferId: v1Detail?.supplementOffer?.offerId,
        supplementOfferDetailUrl: v1Detail?.supplementOffer?.detailUrl,
        boundTangbuyProductIds: boundOfferIds,
      });
      if (!filtered.length) {
        setSearchError("未找到除当前货源外的同款候选，请稍后重试");
        return;
      }

      const matrices = new Map<string, SourceSkuRow[]>();
      await Promise.all(
        filtered.slice(0, 6).map(async (c) => {
          const url = c.detailUrl?.trim();
          const key = candidateKeyOf(c);
          if (!url) {
            matrices.set(key, []);
            return;
          }
          try {
            const { rows } = await fetchSourceSkuMatrixResult(url);
            matrices.set(key, rows);
          } catch {
            matrices.set(key, []);
          }
        })
      );

      const ranked = rankCandidatesByCoverage(
        filtered,
        supplementGaps,
        matrices,
        pipeline.matchScores
      );
      setCandidates(ranked);
      setCandidateMatrices(matrices);
      setGapAssignments(autoAssignGaps(ranked, matrices, supplementGaps));
    } catch (err) {
      setSearchError(readableError(err));
    } finally {
      setSearchLoading(false);
    }
  }, [shopName, product, supplementGaps, tangbuyProductId, detailUrl, v1Detail, autoAssignGaps]);

  /* ---------- effects ---------- */
  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    setPhase(initialPhase);
    const init: Record<string, string> = {};
    for (const v of product.variants) {
      const id = v.bound?.tangbuySkuId?.trim();
      if (id) init[v.thirdPlatformSkuId] = id;
    }
    setSelections(init);
    void loadMatrix();
  }, [open, product.variants, loadMatrix, reset, initialPhase]);

  useEffect(() => {
    if (!open || phase !== "supplement" || candidates.length > 0 || searchLoading) return;
    void runSupplementSearch();
  }, [open, phase, candidates.length, searchLoading, runSupplementSearch]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !registering) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, saving, registering]);

  useEffect(() => {
    if (!open || !focusVariantId) return;
    const el =
      focusRef.current ??
      document.getElementById(`sku-compare-row-${focusVariantId}`);
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open, focusVariantId, loading, phase]);

  /* ---------- actions ---------- */
  const pendingChanges = useMemo(() => {
    const changes: Array<{ variant: SkuVariant; skuId: string; specLabel: string }> = [];
    for (const variant of product.variants) {
      const nextSkuId = selections[variant.thirdPlatformSkuId]?.trim();
      if (!nextSkuId) continue;
      const current = variant.bound?.tangbuySkuId?.trim() ?? "";
      if (nextSkuId === current) continue;
      const row = findSourceSkuRow(matrix, nextSkuId);
      if (!row) continue;
      changes.push({ variant, skuId: nextSkuId, specLabel: row.specLabel });
    }
    return changes;
  }, [product.variants, selections, matrix]);

  const handleSelect = (variantId: string, skuId: string) => {
    setSelections((prev) => ({ ...prev, [variantId]: skuId }));
  };

  const applyAllSuggestions = () => {
    const count = Object.keys(autoSuggestions).length;
    if (count === 0) {
      showToast("暂无高置信建议可应用");
      return;
    }
    setSelections((prev) => ({ ...prev, ...autoSuggestions }));
    showToast(`已应用 ${count} 条建议`);
  };

  const setGapMerchant = (variant: SkuVariant, candidateKey: string) => {
    const m = candidateMatrices.get(candidateKey) ?? [];
    const top = rankSourceSkuRows(m, variant.optionLabel, {
      variantPrice: variant.price,
      variantImageUrl: variant.imageUrl,
    })[0];
    setGapAssignments((prev) => ({
      ...prev,
      [variant.thirdPlatformSkuId]: { candidateKey, skuId: top?.skuId ?? "" },
    }));
  };

  const setGapSku = (variantId: string, skuId: string) => {
    setGapAssignments((prev) => ({
      ...prev,
      [variantId]: { candidateKey: prev[variantId]?.candidateKey ?? "", skuId },
    }));
  };

  const savePrimary = async () => {
    if (saving || !canPick || !tangbuyProductId) return;
    if (pendingChanges.length === 0) {
      if (supplementGaps.length > 0) {
        setPhase("supplement");
        return;
      }
      showToast("没有需要保存的变更");
      onClose();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      for (const { variant, skuId, specLabel } of pendingChanges) {
        await manualBindWithFallback(
          variant.thirdPlatformSkuId,
          {
            shopName,
            thirdPlatformItemId: product.thirdPlatformItemId,
            offerId: tangbuyProductId,
            offerSkuId: skuId,
            reason: specLabel,
            detailUrl: detailUrl ?? undefined,
            sourceRole: "PRIMARY",
          },
          { detailUrl }
        );
        // 反馈沉淀：从人工确认的绑定学习别名（如 深燕麦≈燕麦色）
        recordBinding(variant.optionLabel, specLabel);
      }
      showToast(`已保存 ${pendingChanges.length} 个 SKU 映射`);
      await onSaved();
      if (supplementGaps.length > 0) {
        setPhase("supplement");
      } else {
        onClose();
      }
    } catch (err) {
      setSaveError(mapSkuAlignError(err));
    } finally {
      setSaving(false);
    }
  };

  const registerSupplement = async () => {
    if (registering) return;
    const entries = Object.entries(gapAssignments).filter(
      ([, a]) => a?.candidateKey?.trim() && a?.skuId?.trim()
    );
    if (!entries.length) {
      showToast("请至少为一个缺口规格选择货源");
      return;
    }
    setRegistering(true);
    setSaveError(null);
    try {
      // Register each distinct supplement merchant once (best-effort).
      const distinctKeys = new Set(entries.map(([, a]) => a.candidateKey));
      for (const key of distinctKeys) {
        const cand = candidateByKey.get(key);
        if (!cand) continue;
        const offerId = resolveCandidateOfferId(cand.candidate);
        try {
          const accepted = await api.skuAlignV1AddSupplementSource(
            product.thirdPlatformItemId,
            { shopName, offerId }
          );
          if (accepted.accepted && accepted.runId) {
            await pollSkuAlignRun(shopName, accepted.runId);
          }
        } catch {
          // Non-blocking — binding below still persists the mapping.
        }
      }

      for (const [variantId, a] of entries) {
        const cand = candidateByKey.get(a.candidateKey);
        if (!cand) continue;
        const offerId = resolveCandidateOfferId(cand.candidate);
        const detail = cand.candidate.detailUrl ?? undefined;
        const row = findSourceSkuRow(candidateMatrices.get(a.candidateKey) ?? [], a.skuId);
        await manualBindWithFallback(
          variantId,
          {
            shopName,
            thirdPlatformItemId: product.thirdPlatformItemId,
            offerId,
            offerSkuId: a.skuId,
            reason: row?.specLabel ?? undefined,
            detailUrl: detail,
            sourceRole: "SUPPLEMENT",
          },
          { detailUrl: detail }
        );
        // 反馈沉淀：补充货源绑定同样学习别名
        const variantLabel = product.variants.find(
          (v) => v.thirdPlatformSkuId === variantId
        )?.optionLabel;
        if (variantLabel && row?.specLabel) recordBinding(variantLabel, row.specLabel);
      }
      showToast(`已保存 ${entries.length} 个补充货源映射`);
      onClose();
      await onSaved();
    } catch (err) {
      setSaveError(mapSkuAlignError(err));
    } finally {
      setRegistering(false);
    }
  };

  const supplementEnabled =
    supplementGaps.length > 0 || hasSupplementOffer || phase === "supplement";
  const suggestCount = Object.keys(autoSuggestions).length;
  const assignedGapCount = useMemo(
    () =>
      supplementGaps.filter((v) => {
        const a = gapAssignments[v.thirdPlatformSkuId];
        return a?.candidateKey && a?.skuId;
      }).length,
    [supplementGaps, gapAssignments]
  );
  const merchantCount = candidates.length;

  /* ---------- render ---------- */
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      {/* ====== 顶部 Header ====== */}
      <header className="shrink-0 border-b border-hairline bg-surface px-5 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <VariantThumb
              src={product.imageUrl}
              alt={product.title ?? ""}
              className="h-14 w-14"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                SKU 映射 · 店铺变体 ↔ 货源
              </p>
              <h2 className="line-clamp-1 text-sm font-semibold leading-5 text-ink">
                {product.title ?? product.thirdPlatformItemId}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                <span className="text-emerald-700">已对齐 {alignedCount}/{product.variants.length}</span>
                <span>·</span>
                <span>未映射 {unboundCount}</span>
                {supplementGaps.length > 0 ? (
                  <>
                    <span>·</span>
                    <span className="text-amber-700">当前货源缺口 {supplementGaps.length}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 shrink-0 px-0"
            onClick={onClose}
            disabled={saving || registering}
            title="关闭"
            aria-label="关闭 SKU 映射"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1">
          {(
            [
              { id: "primary" as DrawerPhase, label: "当前货源对照", count: product.variants.length },
              {
                id: "supplement" as DrawerPhase,
                label: hasSupplementOffer ? "补充货源" : "新增货源",
                count: supplementGaps.length > 0 ? supplementGaps.length : undefined,
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (t.id === "supplement" && !supplementEnabled) return;
                setPhase(t.id);
              }}
              disabled={t.id === "supplement" && !supplementEnabled}
              className={cn(
                "relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                phase === t.id
                  ? "bg-brand text-white"
                  : "text-ink-muted hover:bg-surface-muted hover:text-ink"
              )}
            >
              {t.label}
              {t.count != null ? (
                <span
                  className={cn(
                    "ml-1 rounded-full px-1.5 py-0 text-[10px]",
                    phase === t.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      {/* ====== 主体 ====== */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {phase === "primary" ? (
          <PrimaryComparePanel
            product={product}
            matrix={matrix}
            loading={loading}
            loadError={loadError}
            canPick={canPick}
            selections={selections}
            merchantTitle={currentMerchantTitle}
            merchantImage={currentMerchantImage}
            suggestCount={suggestCount}
            supplementGaps={supplementGaps}
            focusVariantId={focusVariantId ?? null}
            focusRef={focusRef}
            shopCurrency={product.currency}
            pricingTemplate={pricingTemplate}
            onRetryMatrix={() => void loadMatrix()}
            onSelectSku={handleSelect}
            onApplySuggestions={applyAllSuggestions}
            onGoSupplement={() => setPhase("supplement")}
          />
        ) : (
          <SupplementPanel
            supplementGaps={supplementGaps}
            searchLoading={searchLoading}
            searchError={searchError}
            candidates={candidates}
            candidateMatrices={candidateMatrices}
            gapAssignments={gapAssignments}
            merchantCount={merchantCount}
            hasSupplementOffer={hasSupplementOffer}
            shopCurrency={product.currency}
            pricingTemplate={pricingTemplate}
            onSearch={() => void runSupplementSearch()}
            onSetMerchant={setGapMerchant}
            onSetSku={setGapSku}
          />
        )}
      </div>

      {/* ====== 底部操作区 ====== */}
      <footer className="shrink-0 border-t border-hairline bg-surface px-5 py-3">
        {saveError ? (
          <p className="mb-2 text-[11px] text-red-600">{saveError}</p>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] text-ink-subtle">
            {phase === "primary"
              ? pendingChanges.length > 0
                ? `${pendingChanges.length} 项待保存`
                : "未修改绑定"
              : supplementGaps.length > 0
                ? `已为 ${assignedGapCount}/${supplementGaps.length} 个缺口选好货源`
                : "当前无缺口变体"}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onClose} disabled={saving || registering}>
              取消
            </Button>
            {phase === "primary" ? (
              <>
                {supplementGaps.length > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPhase("supplement")}
                    disabled={saving}
                  >
                    去新增货源
                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void savePrimary()}
                  disabled={saving || !canPick || loading}
                >
                  {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  保存映射
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPhase("primary")}
                  disabled={registering}
                >
                  返回当前货源
                </Button>
                <Button
                  size="sm"
                  onClick={() => void registerSupplement()}
                  disabled={registering || assignedGapCount === 0}
                >
                  {registering ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  保存补充映射
                </Button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ==================================================================== */
/*  Primary comparison panel — one row per Shopify variant             */
/* ==================================================================== */

function PrimaryComparePanel({
  product,
  matrix,
  loading,
  loadError,
  canPick,
  selections,
  merchantTitle,
  merchantImage,
  suggestCount,
  supplementGaps,
  focusVariantId,
  focusRef,
  shopCurrency,
  pricingTemplate,
  onRetryMatrix,
  onSelectSku,
  onApplySuggestions,
  onGoSupplement,
}: {
  product: SkuProductOverview;
  matrix: SourceSkuRow[];
  loading: boolean;
  loadError: string | null;
  canPick: boolean;
  selections: Record<string, string>;
  merchantTitle: string;
  merchantImage: string | null;
  suggestCount: number;
  supplementGaps: SkuVariant[];
  focusVariantId: string | null;
  focusRef: React.Ref<HTMLDivElement>;
  shopCurrency?: string | null;
  pricingTemplate?: PricingTemplate | null;
  onRetryMatrix: () => void;
  onSelectSku: (variantId: string, skuId: string) => void;
  onApplySuggestions: () => void;
  onGoSupplement: () => void;
}) {
  const gapIds = useMemo(
    () => new Set(supplementGaps.map((v) => v.thirdPlatformSkuId)),
    [supplementGaps]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 当前货源信息条 */}
      <div className="shrink-0 border-b border-hairline px-5 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Store className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
            <VariantThumb src={merchantImage} alt={merchantTitle} className="h-7 w-7" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-ink-subtle">当前货源</p>
              <p className="line-clamp-1 text-xs font-medium text-ink">{merchantTitle}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 gap-1 text-[11px]"
            onClick={onApplySuggestions}
            disabled={suggestCount === 0}
            title="按规格自动填充高置信建议"
          >
            <Sparkles className="h-3.5 w-3.5" />
            智能匹配（{suggestCount}）
          </Button>
        </div>
      </div>

      {/* 列表头 */}
      <div className="shrink-0 border-b border-hairline bg-canvas/40 px-5 py-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1.25fr)] items-center gap-3 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
          <span>店铺变体</span>
          <span />
          <span>货源映射（{merchantTitle === "当前货源" ? "当前货源" : "同一货源"}）</span>
        </div>
      </div>

      {/* 对照列表 */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在加载货源规格表…
          </div>
        ) : !canPick ? (
          <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            该商品缺少货源链接，无法加载规格表。请先在「智能选品」确认匹配。
          </div>
        ) : loadError ? (
          <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] text-amber-800">{loadError}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={onRetryMatrix}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              重试
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {product.variants.map((variant) => (
              <PrimaryCompareRow
                key={variant.thirdPlatformSkuId}
                variant={variant}
                matrix={matrix}
                merchantTitle={merchantTitle}
                shopCurrency={shopCurrency}
                pricingTemplate={pricingTemplate}
                value={selections[variant.thirdPlatformSkuId] ?? ""}
                isGap={gapIds.has(variant.thirdPlatformSkuId)}
                highlighted={focusVariantId === variant.thirdPlatformSkuId}
                rowRef={
                  focusVariantId === variant.thirdPlatformSkuId ? focusRef : undefined
                }
                onSelect={(skuId) => onSelectSku(variant.thirdPlatformSkuId, skuId)}
                onGoSupplement={onGoSupplement}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One Shopify variant ↔ current-source mapping row. */
function PrimaryCompareRow({
  variant,
  matrix,
  merchantTitle,
  shopCurrency,
  pricingTemplate,
  value,
  isGap,
  highlighted,
  rowRef,
  onSelect,
  onGoSupplement,
}: {
  variant: SkuVariant;
  matrix: SourceSkuRow[];
  merchantTitle: string;
  shopCurrency?: string | null;
  pricingTemplate?: PricingTemplate | null;
  value: string;
  isGap: boolean;
  highlighted: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
  onSelect: (skuId: string) => void;
  onGoSupplement: () => void;
}) {
  const [editing, setEditing] = useState(false);

  const ranked = useMemo(
    () =>
      rankSourceSkuRows(matrix, variant.optionLabel, {
        variantPrice: variant.price,
        variantImageUrl: variant.imageUrl,
      }),
    [matrix, variant.optionLabel, variant.price, variant.imageUrl]
  );
  const bestScore = ranked[0]?.matchScore ?? 0;

  const effectiveSkuId = value || variant.bound?.tangbuySkuId?.trim() || "";
  const row = effectiveSkuId ? findSourceSkuRow(matrix, effectiveSkuId) : undefined;
  const matched = Boolean(row);
  const showSelect = !matched || editing;

  return (
    <div
      ref={rowRef}
      id={`sku-compare-row-${variant.thirdPlatformSkuId}`}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1.25fr)] items-center gap-3 rounded-[var(--radius-control)] border p-2.5 transition-colors",
        highlighted
          ? "border-brand bg-brand/5"
          : matched
            ? "border-emerald-200 bg-emerald-50/40"
            : isGap
              ? "border-amber-200 bg-amber-50/40"
              : "border-hairline bg-surface"
      )}
    >
      {/* 左：店铺变体 */}
      <div className="flex min-w-0 items-center gap-2.5">
        <VariantThumb src={variant.imageUrl} alt={variant.optionLabel} className="h-11 w-11" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink">{variant.optionLabel}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            售价 {formatShopListingPrice(variant.price, shopCurrency)}
          </p>
        </div>
      </div>

      {/* 中：对照箭头 */}
      <div className="flex justify-center text-ink-subtle">
        <ArrowLeftRight className="h-4 w-4" />
      </div>

      {/* 右：货源映射 */}
      <div className="min-w-0">
        {showSelect ? (
          <div className="space-y-1">
            <Select
              value={effectiveSkuId}
              onChange={(e) => {
                onSelect(e.target.value);
                setEditing(false);
              }}
              className="h-8 w-full text-[11px]"
              disabled={ranked.length === 0}
            >
              <option value="">
                {ranked.length === 0 ? "当前货源暂无规格" : "选择货源规格…"}
              </option>
              {ranked.map((r) => (
                <option key={r.skuId} value={r.skuId}>
                  {r.specLabel} · {formatOptionPrice(r.procurementPrice, shopCurrency, pricingTemplate)}
                  {r.matchScore > 0 ? ` · ${Math.round(r.matchScore * 100)}%` : ""}
                </option>
              ))}
            </Select>
            {(isGap || bestScore < COVERAGE_MATCH_THRESHOLD) && !effectiveSkuId ? (
              <button
                type="button"
                onClick={onGoSupplement}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 hover:text-amber-800 hover:underline"
              >
                <Plus className="h-3 w-3" />
                当前货源无合适规格，为它新增货源
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <VariantThumb
              src={row?.imageUrl?.trim() || variant.bound?.offerImageUrl?.trim() || null}
              alt={row?.specLabel ?? ""}
              className="h-9 w-9"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                <span className="truncate text-[11px] font-medium text-ink">
                  {row?.specLabel}
                </span>
              </div>
              <p className="truncate text-[10px] text-ink-subtle">
                {truncateMerchant(merchantTitle)} · 采购价{" "}
                {formatOptionPrice(row?.procurementPrice, shopCurrency, pricingTemplate)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded px-1.5 text-[10px] text-ink-muted hover:bg-surface-muted hover:text-ink"
              title="更换货源规格"
            >
              <Pencil className="h-3 w-3" />
              更换
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  Supplement panel — per-gap variant, multi-merchant                 */
/* ==================================================================== */

function SupplementPanel({
  supplementGaps,
  searchLoading,
  searchError,
  candidates,
  candidateMatrices,
  gapAssignments,
  merchantCount,
  hasSupplementOffer,
  shopCurrency,
  pricingTemplate,
  onSearch,
  onSetMerchant,
  onSetSku,
}: {
  supplementGaps: SkuVariant[];
  searchLoading: boolean;
  searchError: string | null;
  candidates: RankedCoverageCandidate[];
  candidateMatrices: Map<string, SourceSkuRow[]>;
  gapAssignments: Record<string, GapAssignment>;
  merchantCount: number;
  hasSupplementOffer: boolean;
  shopCurrency?: string | null;
  pricingTemplate?: PricingTemplate | null;
  onSearch: () => void;
  onSetMerchant: (variant: SkuVariant, candidateKey: string) => void;
  onSetSku: (variantId: string, skuId: string) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 搜索控制 */}
      <div className="shrink-0 border-b border-hairline px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink">
              {hasSupplementOffer ? "补充货源映射" : "新增货源"}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              为当前货源无法覆盖的规格搜索同款货源；不同规格可来自不同商家。
              {merchantCount > 0 ? ` 已找到 ${merchantCount} 个候选货源。` : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 gap-1 text-[11px]"
            onClick={onSearch}
            disabled={searchLoading}
          >
            {searchLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI 一键识别
          </Button>
        </div>
      </div>

      {/* 缺口列表 */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {searchLoading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在搜索同款货源并读取规格…
          </div>
        ) : searchError ? (
          <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] text-amber-800">{searchError}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={onSearch}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              重新搜索
            </Button>
          </div>
        ) : supplementGaps.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-muted">
            当前没有需要补充货源的缺口变体。
          </p>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-muted">
            点击右上「AI 一键识别」搜索同款货源。
          </p>
        ) : (
          <div className="space-y-2">
            {supplementGaps.map((variant) => (
              <SupplementGapRow
                key={variant.thirdPlatformSkuId}
                variant={variant}
                candidates={candidates}
                candidateMatrices={candidateMatrices}
                assignment={gapAssignments[variant.thirdPlatformSkuId]}
                shopCurrency={shopCurrency}
                pricingTemplate={pricingTemplate}
                onSetMerchant={(key) => onSetMerchant(variant, key)}
                onSetSku={(skuId) => onSetSku(variant.thirdPlatformSkuId, skuId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Gap variant ↔ chosen supplement merchant + SKU. */
function SupplementGapRow({
  variant,
  candidates,
  candidateMatrices,
  assignment,
  shopCurrency,
  pricingTemplate,
  onSetMerchant,
  onSetSku,
}: {
  variant: SkuVariant;
  candidates: RankedCoverageCandidate[];
  candidateMatrices: Map<string, SourceSkuRow[]>;
  assignment?: GapAssignment;
  shopCurrency?: string | null;
  pricingTemplate?: PricingTemplate | null;
  onSetMerchant: (candidateKey: string) => void;
  onSetSku: (skuId: string) => void;
}) {
  const candidateKey = assignment?.candidateKey ?? "";
  const skuId = assignment?.skuId ?? "";

  const activeMatrix = useMemo(
    () => candidateMatrices.get(candidateKey) ?? [],
    [candidateMatrices, candidateKey]
  );
  const skuOptions = useMemo(
    () =>
      rankSourceSkuRows(activeMatrix, variant.optionLabel, {
        variantPrice: variant.price,
        variantImageUrl: variant.imageUrl,
      }),
    [activeMatrix, variant.optionLabel, variant.price, variant.imageUrl]
  );
  const chosenRow = skuId ? findSourceSkuRow(activeMatrix, skuId) : undefined;
  const chosenCandidate = candidates.find(
    (c) => candidateKeyOf(c.candidate) === candidateKey
  );
  const resolved = Boolean(chosenRow && candidateKey);

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1.5fr)] items-start gap-3 rounded-[var(--radius-control)] border p-2.5 transition-colors",
        resolved ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/30"
      )}
    >
      {/* 左：店铺变体 */}
      <div className="flex min-w-0 items-center gap-2.5">
        <VariantThumb src={variant.imageUrl} alt={variant.optionLabel} className="h-11 w-11" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink">{variant.optionLabel}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            售价 {formatShopListingPrice(variant.price, shopCurrency)}
          </p>
        </div>
      </div>

      {/* 中 */}
      <div className="flex justify-center pt-3 text-ink-subtle">
        <ArrowLeftRight className="h-4 w-4" />
      </div>

      {/* 右：商家 + 货源 SKU */}
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Store className="h-3 w-3 shrink-0 text-ink-subtle" />
          <Select
            value={candidateKey}
            onChange={(e) => onSetMerchant(e.target.value)}
            className="h-8 w-full text-[11px]"
          >
            <option value="">选择商家…</option>
            {candidates.map((c) => {
              const key = candidateKeyOf(c.candidate);
              return (
                <option key={key} value={key}>
                  {truncateMerchant(c.candidate.title, 28)}
                  {c.total > 0 ? ` · 可覆盖 ${c.coverage}/${c.total}` : ""}
                </option>
              );
            })}
          </Select>
        </div>
        <Select
          value={skuId}
          onChange={(e) => onSetSku(e.target.value)}
          className="h-8 w-full text-[11px]"
          disabled={!candidateKey || skuOptions.length === 0}
        >
          <option value="">
            {!candidateKey
              ? "先选择商家"
              : skuOptions.length === 0
                ? "该货源无规格"
                : "选择货源规格…"}
          </option>
          {skuOptions.map((r) => (
            <option key={r.skuId} value={r.skuId}>
              {r.specLabel} · {formatOptionPrice(r.procurementPrice, shopCurrency, pricingTemplate)}
              {r.matchScore > 0 ? ` · ${Math.round(r.matchScore * 100)}%` : ""}
            </option>
          ))}
        </Select>
        {resolved ? (
          <div className="flex items-center gap-1.5 rounded bg-white/70 px-2 py-1">
            <VariantThumb
              src={chosenRow?.imageUrl?.trim() || chosenCandidate?.candidate.imageUrl || null}
              alt={chosenRow?.specLabel ?? ""}
              className="h-6 w-6"
            />
            <span className="min-w-0 flex-1 truncate text-[10px] text-ink">
              <span className="text-emerald-700">
                <Check className="mr-0.5 inline h-3 w-3" />
              </span>
              由 {truncateMerchant(chosenCandidate?.candidate.title)} 提供 · {chosenRow?.specLabel}
            </span>
            <span className="shrink-0 text-[10px] font-medium text-ink-subtle">
              {formatOptionPrice(chosenRow?.procurementPrice, shopCurrency, pricingTemplate)}
            </span>
          </div>
        ) : (
          <Badge variant="warning" className="px-1.5 py-0 text-[9px]">
            待选择货源
          </Badge>
        )}
      </div>
    </div>
  );
}
