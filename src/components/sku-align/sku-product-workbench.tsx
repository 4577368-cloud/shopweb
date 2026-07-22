"use client";

import { ThumbImage } from "@/components/ui/thumb-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ImageOff,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { api, readableError } from "@/lib/api";
import { runImageSearchPipeline } from "@/lib/batch-link/image-search-pipeline";
import {
  identityFromSearchCandidate,
  resolveConfirmDetailUrl,
  resolveConfirmOfferProductId,
} from "@/lib/catalog-product-resolve";
import { mapSkuAlignError } from "@/lib/sku-align/errors";
import { mapImageMatchConfirmError } from "@/lib/batch-link/match-errors";
import { writeProductSourceIdentity } from "@/lib/product-source-identity";
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
import { enqueueSkuAlignRun, pollSkuAlignRun } from "@/lib/sku-align-v1";
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

/** 对照行内下拉：白底 + 实线边框，避免与行背景色混在一起。 */
const COMPARE_SELECT_CLASS =
  "h-9 w-full border-slate-300 bg-white text-xs text-ink shadow-sm ring-1 ring-slate-200/90";

/** 对照行右侧映射区：独立白底容器，提升辨识度。 */
const COMPARE_MAP_PANEL_CLASS =
  "min-w-0 rounded-md border border-slate-200 bg-white p-2.5 shadow-sm";

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
/*  Workbench props                                                     */
/* ------------------------------------------------------------------ */

export interface SkuProductWorkbenchProps {
  product: SkuProductOverview;
  shopName: string;
  detailUrl: string | null;
  tangbuyProductId: string | null;
  phase: DrawerPhase;
  onPhaseChange: (phase: DrawerPhase) => void;
  focusVariantId?: string | null;
  v1Detail?: SkuAlignProductDetail | null;
  pricingTemplate?: PricingTemplate | null;
  onSaved: () => Promise<void>;
  /** 替换主货源后刷新 V1 详情（primaryOffer 标题/图）。 */
  onRefreshDetail?: () => Promise<void>;
  onBack: () => void;
  showToast: (message: string) => void;
}

/** 替换主货源后、父级 overview 尚未刷新时的本地货源快照。 */
interface PrimarySourceOverride {
  detailUrl: string;
  tangbuyProductId: string;
  title: string;
  imageUrl?: string | null;
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

export function SkuProductWorkbench({
  product,
  shopName,
  detailUrl,
  tangbuyProductId,
  phase,
  onPhaseChange,
  focusVariantId,
  v1Detail,
  pricingTemplate = null,
  onSaved,
  onRefreshDetail,
  onBack,
  showToast,
}: SkuProductWorkbenchProps) {
  /* ---------- state ---------- */
  const [sourceOverride, setSourceOverride] = useState<PrimarySourceOverride | null>(null);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [matrix, setMatrix] = useState<SourceSkuRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  /** 灰区 LLM 复核置信度（pairKey→0-1）。 */
  const [llmScores, setLlmScores] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [searchLoading, setSearchLoading] = useState(false);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixFetchingKey, setMatrixFetchingKey] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RankedCoverageCandidate[]>([]);
  const [candidateMatrices, setCandidateMatrices] = useState<Map<string, SourceSkuRow[]>>(
    new Map()
  );
  const [gapAssignments, setGapAssignments] = useState<Record<string, GapAssignment>>({});
  const [registering, setRegistering] = useState(false);

  const [replaceSearchLoading, setReplaceSearchLoading] = useState(false);
  const [replaceSearchError, setReplaceSearchError] = useState<string | null>(null);
  const [replaceCandidates, setReplaceCandidates] = useState<ImageSearchProduct[]>([]);
  const [replacingPrimary, setReplacingPrimary] = useState(false);

  const focusRef = useRef<HTMLDivElement>(null);
  const lastImageScoresRef = useRef<Record<string, number>>({});
  const candidateMatricesRef = useRef(candidateMatrices);
  candidateMatricesRef.current = candidateMatrices;

  const effectiveDetailUrl = sourceOverride?.detailUrl ?? detailUrl;
  const effectiveTangbuyId = sourceOverride?.tangbuyProductId ?? tangbuyProductId;
  const canPick = Boolean(effectiveDetailUrl?.trim() && effectiveTangbuyId?.trim());

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
    sourceOverride?.title?.trim() ||
    v1Detail?.primaryOffer?.title?.trim() ||
    product.title?.trim() ||
    "当前货源";
  const currentMerchantImage =
    sourceOverride?.imageUrl?.trim() ||
    v1Detail?.primaryOffer?.imageUrl?.trim() ||
    product.variants.find((v) => v.bound?.offerImageUrl)?.bound?.offerImageUrl ||
    null;

  const hasSupplementOffer = Boolean(v1Detail?.supplementOffer?.offerId?.trim());

  /* ---------- helpers ---------- */
  const reset = useCallback(() => {
    setMatrix([]);
    setLoading(false);
    setLoadError(null);
    setSelections({});
    setSaving(false);
    setSaveError(null);
    setSearchLoading(false);
    setMatrixLoading(false);
    setSearchError(null);
    setCandidates([]);
    setCandidateMatrices(new Map());
    setGapAssignments({});
    setRegistering(false);
    setLlmScores({});
    setReplaceSearchLoading(false);
    setReplaceSearchError(null);
    setReplaceCandidates([]);
    setReplacingPrimary(false);
    setSourceOverride(null);
    setSourceRevision(0);
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

  const loadMatrix = useCallback(
    async (urlOverride?: string | null): Promise<SourceSkuRow[]> => {
      const url = (urlOverride ?? effectiveDetailUrl)?.trim();
      if (!url) {
        setLoadError("缺少货源详情链接，无法加载规格表");
        setMatrix([]);
        return [];
      }
      setLoading(true);
      setLoadError(null);
      try {
        const { rows, error } = await fetchSourceSkuMatrixResult(url);
        setMatrix(rows);
        if (error) setLoadError(error);
        else if (!rows.length) setLoadError("该货源未返回可用规格");
        else void refineGrayZone(rows);
        return rows;
      } catch (err) {
        setMatrix([]);
        setLoadError(readableError(err));
        return [];
      } finally {
        setLoading(false);
      }
    },
    [effectiveDetailUrl, refineGrayZone]
  );


  const runSupplementSearch = useCallback(async () => {
    setSearchLoading(true);
    setMatrixLoading(false);
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
        5
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

      lastImageScoresRef.current = pipeline.matchScores ?? {};
      const previewRanked = rankCandidatesByCoverage(
        filtered,
        supplementGaps,
        new Map(),
        lastImageScoresRef.current
      );
      setCandidates(previewRanked);
    } catch (err) {
      setSearchError(readableError(err));
    } finally {
      setSearchLoading(false);
      setMatrixLoading(false);
    }
  }, [shopName, product, supplementGaps, tangbuyProductId, detailUrl, v1Detail]);

  const runReplacePrimarySearch = useCallback(async () => {
    setReplaceSearchLoading(true);
    setReplaceSearchError(null);
    setReplaceCandidates([]);
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
        setReplaceSearchError(pipeline.error);
        return;
      }
      if (!pipeline.rankedItems.length) {
        setReplaceSearchError("未找到可替换的同款候选");
        return;
      }
      setReplaceCandidates(pipeline.rankedItems.slice(0, 6));
    } catch (err) {
      setReplaceSearchError(readableError(err));
    } finally {
      setReplaceSearchLoading(false);
    }
  }, [shopName, product]);

  const applyReplacePrimary = async (candidate: ImageSearchProduct) => {
    if (replacingPrimary) return;
    setReplacingPrimary(true);
    setSaveError(null);
    try {
      const fromCandidate = identityFromSearchCandidate(candidate);
      const offerProductId = resolveConfirmOfferProductId(candidate, fromCandidate);
      const confirmDetailUrl = resolveConfirmDetailUrl(
        candidate,
        fromCandidate,
        offerProductId
      );
      if (!confirmDetailUrl?.trim()) {
        throw new Error("无法解析新货源详情链接");
      }
      await api.confirmImageMatch({
        shopName,
        thirdPlatformItemId: product.thirdPlatformItemId,
        offerProductId,
        offerSkuId: candidate.skuId,
        detailUrl: confirmDetailUrl,
        similarityScore: candidate.similarityScore,
        imageSource: "ORIGINAL",
        querySource: "NONE",
        appliedQuery: "sku_replace_primary",
        offerImageUrl: candidate.imageUrl,
        offerPrice: candidate.price,
        offerTitle: candidate.title?.trim() || null,
        auto: false,
      });
      writeProductSourceIdentity(shopName, product.thirdPlatformItemId, fromCandidate);
      setSourceOverride({
        detailUrl: confirmDetailUrl.trim(),
        tangbuyProductId: offerProductId,
        title: candidate.title?.trim() || "新主货源",
        imageUrl: candidate.imageUrl ?? null,
      });
      setSourceRevision((n) => n + 1);
      setReplaceCandidates([]);
      setReplaceSearchError(null);
      setCandidates([]);
      setCandidateMatrices(new Map());
      setGapAssignments({});
      onPhaseChange("primary");

      const status = await enqueueSkuAlignRun(shopName, {
        triggerType: "PRODUCT_BIND_CONFIRMED",
        scopeType: "PRODUCT",
        scopeIds: [product.thirdPlatformItemId],
        forceRefresh: true,
      });
      await onSaved();
      await onRefreshDetail?.();

      const matched = status?.matchedCount ?? 0;
      showToast(
        status
          ? `已替换主货源，${matched} 个变体已自动对齐，请在下方核对 SKU 映射`
          : "已替换主货源，请在下方核对 SKU 映射"
      );
    } catch (err) {
      setSaveError(mapImageMatchConfirmError(err) || mapSkuAlignError(err));
    } finally {
      setReplacingPrimary(false);
    }
  };

  /* ---------- effects ---------- */
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const v of product.variants) {
      const id = v.bound?.tangbuySkuId?.trim();
      if (id) init[v.thirdPlatformSkuId] = id;
    }
    setSelections(init);
    void loadMatrix();
    return () => {
      reset();
    };
  }, [product.thirdPlatformItemId, loadMatrix, reset]);

  /** 数据刷新时同步绑定选择，不重复拉主货源规格表。 */
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const v of product.variants) {
      const id = v.bound?.tangbuySkuId?.trim();
      if (id) init[v.thirdPlatformSkuId] = id;
    }
    setSelections(init);
  }, [product.variants]);

  /** 替换主货源后：加载新规格表 + 把自动对齐/高置信建议填入下拉。 */
  useEffect(() => {
    if (!sourceOverride?.detailUrl || sourceRevision === 0) return;
    let cancelled = false;
    void (async () => {
      const rows = await loadMatrix(sourceOverride.detailUrl);
      if (cancelled || !rows.length) return;
      const fromBound: Record<string, string> = {};
      for (const v of product.variants) {
        const id = v.bound?.tangbuySkuId?.trim();
        if (id) fromBound[v.thirdPlatformSkuId] = id;
      }
      const suggestions = buildAutoSuggestions(product.variants, rows, fromBound, llmScores);
      if (Object.keys(suggestions).length > 0) {
        setSelections((prev) => ({ ...fromBound, ...prev, ...suggestions }));
      } else {
        setSelections((prev) => ({ ...fromBound, ...prev }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    sourceOverride,
    sourceRevision,
    product.variants,
    loadMatrix,
    llmScores,
  ]);

  /** 父级 overview 追上本地 override 后清除临时快照。 */
  useEffect(() => {
    if (!sourceOverride?.detailUrl || !detailUrl?.trim()) return;
    if (detailUrl.trim() === sourceOverride.detailUrl.trim()) {
      setSourceOverride(null);
      setSourceRevision(0);
    }
  }, [detailUrl, sourceOverride]);

  useEffect(() => {
    if (!focusVariantId) return;
    const el =
      focusRef.current ??
      document.getElementById(`sku-compare-row-${focusVariantId}`);
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusVariantId, loading, phase]);

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

  const setGapMerchant = useCallback(
    async (variant: SkuVariant, candidateKey: string) => {
      if (!candidateKey) {
        setGapAssignments((prev) => ({
          ...prev,
          [variant.thirdPlatformSkuId]: { candidateKey: "", skuId: "" },
        }));
        return;
      }

      let matrix = candidateMatricesRef.current.get(candidateKey);
      if (!matrix) {
        const entry = candidateByKey.get(candidateKey);
        const url = entry?.candidate.detailUrl?.trim();
        setMatrixFetchingKey(candidateKey);
        try {
          if (url) {
            const { rows } = await fetchSourceSkuMatrixResult(url);
            matrix = rows;
          } else {
            matrix = [];
          }
          setCandidateMatrices((prev) => {
            const next = new Map(prev);
            next.set(candidateKey, matrix!);
            setCandidates((prevCandidates) =>
              rankCandidatesByCoverage(
                prevCandidates.map((c) => c.candidate),
                supplementGaps,
                next,
                lastImageScoresRef.current
              )
            );
            return next;
          });
        } finally {
          setMatrixFetchingKey(null);
        }
      }

      const top = rankSourceSkuRows(matrix ?? [], variant.optionLabel, {
        variantPrice: variant.price,
        variantImageUrl: variant.imageUrl,
      })[0];
      setGapAssignments((prev) => ({
        ...prev,
        [variant.thirdPlatformSkuId]: {
          candidateKey,
          skuId: top?.skuId ?? "",
        },
      }));
    },
    [candidateByKey, supplementGaps]
  );

  const setGapSku = (variantId: string, skuId: string) => {
    setGapAssignments((prev) => ({
      ...prev,
      [variantId]: { candidateKey: prev[variantId]?.candidateKey ?? "", skuId },
    }));
  };

  const savePrimary = async () => {
    if (saving || !canPick || !effectiveTangbuyId) return;
    if (pendingChanges.length === 0) {
      if (supplementGaps.length > 0) {
        onPhaseChange("supplement");
        return;
      }
      showToast("没有需要保存的变更");
      onBack();
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
            offerId: effectiveTangbuyId,
            offerSkuId: skuId,
            reason: specLabel,
            detailUrl: effectiveDetailUrl ?? undefined,
            sourceRole: "PRIMARY",
          },
          { detailUrl: effectiveDetailUrl ?? undefined }
        );
        // 反馈沉淀：从人工确认的绑定学习别名（如 深燕麦≈燕麦色）
        recordBinding(variant.optionLabel, specLabel);
      }
      showToast(`已保存 ${pendingChanges.length} 个 SKU 映射`);
      await onSaved();
      if (supplementGaps.length > 0) {
        onPhaseChange("supplement");
      } else {
        onBack();
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
      onBack();
      await onSaved();
    } catch (err) {
      setSaveError(mapSkuAlignError(err));
    } finally {
      setRegistering(false);
    }
  };

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

  const workbenchTabs = useMemo(
    () => [
      { id: "primary", label: `SKU 对照 (${product.variants.length})` },
      {
        id: "replace",
        label: "替换主货源",
      },
      {
        id: "supplement",
        label:
          supplementGaps.length > 0
            ? `补充货源 (${supplementGaps.length})`
            : "补充货源",
      },
    ],
    [product.variants.length, supplementGaps.length]
  );

  /* ---------- render ---------- */
  return (
    <div className="flex min-h-[min(72vh,800px)] flex-col overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
      <header className="shrink-0 border-b border-hairline px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 shrink-0 px-0"
              onClick={onBack}
              disabled={saving || registering}
              title="返回商品列表"
              aria-label="返回商品列表"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <VariantThumb
              src={product.imageUrl}
              alt={product.title ?? ""}
              className="h-16 w-16"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                店铺商品 · SKU 映射工作台
              </p>
              <h2 className="text-base font-semibold leading-6 text-ink">
                {product.title ?? product.thirdPlatformItemId}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span className="text-emerald-700">
                  已对齐 {alignedCount}/{product.variants.length}
                </span>
                <span>·</span>
                <span>未映射 {unboundCount}</span>
                {supplementGaps.length > 0 ? (
                  <>
                    <span>·</span>
                    <span className="text-amber-700">货源缺口 {supplementGaps.length}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="w-full min-w-[min(100%,520px)] sm:w-auto">
            <SegmentedTabs
              variant="chip"
              tabs={workbenchTabs}
              value={phase}
              onValueChange={(id) => {
                if ((id === "replace" || id === "supplement") && !canPick) return;
                onPhaseChange(id as DrawerPhase);
              }}
            />
          </div>
        </div>
      </header>

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
            onGoSupplement={() => onPhaseChange("supplement")}
          />
        ) : phase === "replace" ? (
          <ReplacePrimaryPanel
            currentTitle={currentMerchantTitle}
            currentImage={currentMerchantImage}
            loading={replaceSearchLoading}
            error={replaceSearchError}
            candidates={replaceCandidates}
            replacing={replacingPrimary}
            onSearch={() => void runReplacePrimarySearch()}
            onApply={(c) => void applyReplacePrimary(c)}
          />
        ) : (
          <SupplementPanel
            className="flex-1 min-h-0"
            supplementGaps={supplementGaps}
            searchLoading={searchLoading}
            matrixLoading={matrixLoading}
            searchError={searchError}
            candidates={candidates}
            candidateMatrices={candidateMatrices}
            gapAssignments={gapAssignments}
            merchantCount={merchantCount}
            hasSupplementOffer={hasSupplementOffer}
            shopCurrency={product.currency}
            pricingTemplate={pricingTemplate}
            onSearch={() => void runSupplementSearch()}
            onSetMerchant={(variant, key) => void setGapMerchant(variant, key)}
            onSetSku={setGapSku}
            matrixFetchingKey={matrixFetchingKey}
          />
        )}
      </div>

      <footer className="shrink-0 border-t border-hairline bg-surface px-6 py-3">
        {saveError ? (
          <p className="mb-2 text-[11px] text-red-600">{saveError}</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-ink-subtle">
            {phase === "primary"
              ? pendingChanges.length > 0
                ? `${pendingChanges.length} 项待保存`
                : "对照当前主货源，逐行映射店铺变体"
              : phase === "replace"
                ? "整款换绑：替换后回到 SKU 对照核对映射"
                : supplementGaps.length > 0
                  ? `已为 ${assignedGapCount}/${supplementGaps.length} 个缺口选好补充货源`
                  : "无缺口规格，无需补充货源"}
          </p>
          <div className="flex items-center gap-2">
            {phase === "primary" ? (
              <Button
                size="sm"
                onClick={() => void savePrimary()}
                disabled={saving || !canPick || loading}
              >
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                保存映射
              </Button>
            ) : phase === "replace" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onPhaseChange("primary")}
                disabled={replacingPrimary}
              >
                返回对照
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onPhaseChange("primary")}
                  disabled={registering}
                >
                  返回对照
                </Button>
                <Button
                  size="sm"
                  onClick={() => void registerSupplement()}
                  disabled={registering || assignedGapCount === 0 || supplementGaps.length === 0}
                >
                  {registering ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  保存补充
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
        <div className="grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1.25fr)] items-center gap-4 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
          <span>店铺变体</span>
          <span />
          <span>货源映射（{merchantTitle === "当前货源" ? "当前货源" : "同一货源"}）</span>
        </div>
      </div>

      {/* 对照列表 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
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
          <div className="space-y-3">
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

  return (
    <div
      ref={rowRef}
      id={`sku-compare-row-${variant.thirdPlatformSkuId}`}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1.25fr)] items-center gap-4 rounded-[var(--radius-control)] border px-4 py-3.5 transition-colors",
        highlighted
          ? "border-brand bg-brand/5"
          : matched
            ? "border-emerald-200/80 bg-emerald-50/50"
            : isGap
              ? "border-amber-200/80 bg-amber-50/40"
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

      {/* 右：货源映射 — 始终下拉，支持手工调整 */}
      <div className={COMPARE_MAP_PANEL_CLASS}>
        {matrix.length === 0 ? (
          <p className="text-[11px] text-ink-muted">
            {effectiveSkuId
              ? `已绑定 skuId ${effectiveSkuId}，规格表加载后可调整`
              : "规格表暂无数据"}
          </p>
        ) : (
          <div className="space-y-2">
            <Select
              value={effectiveSkuId}
              onChange={(e) => onSelect(e.target.value)}
              className={COMPARE_SELECT_CLASS}
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
            {matched && row ? (
              <p className="truncate text-[10px] text-ink-subtle">
                当前：{row.specLabel} · 采购价{" "}
                {formatOptionPrice(row.procurementPrice, shopCurrency, pricingTemplate)}
              </p>
            ) : null}
            {(isGap || bestScore < COVERAGE_MATCH_THRESHOLD) && !effectiveSkuId ? (
              <button
                type="button"
                onClick={onGoSupplement}
                className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-amber-300/80 bg-amber-50/60 px-2 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-50"
              >
                <Plus className="h-3 w-3" />
                当前货源无此规格，去补充货源
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  Replace primary source — whole-product binding swap                  */
/* ==================================================================== */

function ReplacePrimaryPanel({
  currentTitle,
  currentImage,
  loading,
  error,
  candidates,
  replacing,
  onSearch,
  onApply,
}: {
  currentTitle: string;
  currentImage?: string | null;
  loading: boolean;
  error: string | null;
  candidates: ImageSearchProduct[];
  replacing: boolean;
  onSearch: () => void;
  onApply: (candidate: ImageSearchProduct) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-hairline px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink">替换主货源</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              整款绑错了时用：图搜同款并替换当前主货源，系统会重新对齐全部 SKU。
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 gap-1 text-[11px]"
            onClick={onSearch}
            disabled={loading || replacing}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI 图搜
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2.5 rounded-[var(--radius-control)] border border-hairline/80 bg-surface-muted/40 px-3 py-2">
          <VariantThumb src={currentImage} alt={currentTitle} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
              当前主货源
            </p>
            <p className="truncate text-xs text-ink">{truncateMerchant(currentTitle, 36)}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在搜索可替换的同款货源…
          </div>
        ) : error ? (
          <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] text-amber-800">{error}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={onSearch}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              重新搜索
            </Button>
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-muted">
            点击右上「AI 图搜」查找可替换的主货源。
          </p>
        ) : (
          <div className="space-y-2">
            {candidates.map((candidate) => {
              const key = candidateKeyOf(candidate);
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-[var(--radius-control)] border border-hairline px-3 py-2.5"
                >
                  <VariantThumb
                    src={candidate.imageUrl}
                    alt={candidate.title}
                    className="h-12 w-12"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-medium text-ink">
                      {candidate.title?.trim() || "未命名货源"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {candidate.price ? `¥${candidate.price}` : "价格未知"}
                      {candidate.soldCount != null ? ` · 月销 ${candidate.soldCount}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 shrink-0 text-[11px]"
                    onClick={() => onApply(candidate)}
                    disabled={replacing}
                  >
                    {replacing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "替换"
                    )}
                  </Button>
                </div>
              );
            })}
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
  matrixLoading,
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
  matrixFetchingKey,
  className,
}: {
  supplementGaps: SkuVariant[];
  searchLoading: boolean;
  matrixLoading: boolean;
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
  matrixFetchingKey?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      {/* 搜索控制 */}
      <div className="shrink-0 border-b border-hairline px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink">补充货源</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              为当前主货源无法覆盖的规格追加第二货源；不同缺口可来自不同商家，主货源不变。
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
            AI 图搜
          </Button>
        </div>
      </div>

      {/* 缺口列表 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {searchLoading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在图搜同款货源…
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
            点击右上「AI 图搜」搜索同款货源。
          </p>
        ) : (
          <div className="space-y-3">
            {supplementGaps.map((variant) => (
              <SupplementGapRow
                key={variant.thirdPlatformSkuId}
                variant={variant}
                candidates={candidates}
                candidateMatrices={candidateMatrices}
                assignment={gapAssignments[variant.thirdPlatformSkuId]}
                shopCurrency={shopCurrency}
                pricingTemplate={pricingTemplate}
                matrixFetchingKey={matrixFetchingKey}
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
  matrixFetchingKey,
  onSetMerchant,
  onSetSku,
}: {
  variant: SkuVariant;
  candidates: RankedCoverageCandidate[];
  candidateMatrices: Map<string, SourceSkuRow[]>;
  assignment?: GapAssignment;
  shopCurrency?: string | null;
  pricingTemplate?: PricingTemplate | null;
  matrixFetchingKey?: string | null;
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
  const fetchingSpecs =
    Boolean(candidateKey) && matrixFetchingKey === candidateKey;

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1.5fr)] items-center gap-3 rounded-[var(--radius-control)] border px-3 py-3.5 transition-colors",
        resolved ? "border-emerald-200/80 bg-emerald-50/50" : "border-amber-200/80 bg-amber-50/40"
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
      <div className="flex justify-center text-ink-subtle">
        <ArrowLeftRight className="h-4 w-4" />
      </div>

      {/* 右：商家 + 货源 SKU */}
      <div className={cn(COMPARE_MAP_PANEL_CLASS, "space-y-2.5")}>
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
            商家
          </p>
          <Select
            value={candidateKey}
            onChange={(e) => onSetMerchant(e.target.value)}
            className={COMPARE_SELECT_CLASS}
          >
            <option value="">选择商家…</option>
            {candidates.map((c) => {
              const key = candidateKeyOf(c.candidate);
              const matrixLoaded = candidateMatrices.has(key);
              return (
                <option key={key} value={key}>
                  {truncateMerchant(c.candidate.title, 28)}
                  {matrixLoaded && c.total > 0
                    ? ` · 可覆盖 ${c.coverage}/${c.total}`
                    : ""}
                </option>
              );
            })}
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
            货源规格
          </p>
          <Select
            value={skuId}
            onChange={(e) => onSetSku(e.target.value)}
            className={COMPARE_SELECT_CLASS}
            disabled={!candidateKey || fetchingSpecs || skuOptions.length === 0}
          >
          <option value="">
            {fetchingSpecs
              ? "正在读取规格…"
              : !candidateKey
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
        </div>
        {resolved ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/80 px-2.5 py-2">
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
