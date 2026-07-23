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
  X,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { api, readableError } from "@/lib/api";
import { resolve1688ProductTitle, resolveImageSearchDisplayTitle } from "@/lib/batch-link/1688-title-locale";
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
  autoAssignSupplementGaps,
  filterSupplementCandidates,
  rankCandidatesByCoverage,
  resolveCandidateOfferId,
  supplementGapVariantsFromOverview,
  type RankedCoverageCandidate,
} from "@/lib/sku-align/drawer-helpers";
import { loadSupplementManualProduct } from "@/lib/sku-align/supplement-manual-add";
import { filterAvailableSupplementCandidates } from "@/lib/sku-align/supplement-candidate-availability";
import { manualBindWithFallback } from "@/lib/sku-align-v1/compat";
import { recordBinding } from "@/lib/sku-align/learned-aliases";
import {
  fetchSpecMatchLlm,
  grayZoneRows,
  isSemanticLlmBoost,
  pairKey,
} from "@/lib/sku-align/spec-match-llm";
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
  displayStateLabel,
  type SkuVariantDisplayState,
} from "@/lib/sku-align/display";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n/config";
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

function truncateMerchant(
  title: string | null | undefined,
  unknownLabel: string,
  max = 22
): string {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return unknownLabel;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
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
  const t = useT();
  const locale = useLocale();
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
  const [manualAddInput, setManualAddInput] = useState("");
  const [manualAddLoading, setManualAddLoading] = useState(false);
  const [manualAddError, setManualAddError] = useState<string | null>(null);
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
    t("skuWorkbench.currentSource");
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
    setManualAddInput("");
    setManualAddLoading(false);
    setManualAddError(null);
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
        for (const r of grayZoneRows(variant.optionLabel, ranked)) {
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
        setLoadError(t("skuWorkbench.errMissingDetailUrl"));
        setMatrix([]);
        return [];
      }
      setLoading(true);
      setLoadError(null);
      try {
        const { rows, error } = await fetchSourceSkuMatrixResult(url);
        setMatrix(rows);
        if (error) setLoadError(error);
        else if (!rows.length) setLoadError(t("skuWorkbench.errNoSpecs"));
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
    [effectiveDetailUrl, refineGrayZone, t]
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
        5,
        { locale }
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
        setSearchError(t("skuWorkbench.errNoAlternateCandidates"));
        return;
      }

      const { accepted, matrices, rejectedCount } =
        await filterAvailableSupplementCandidates(filtered);
      if (!accepted.length) {
        setSearchError(
          rejectedCount > 0
            ? t("skuWorkbench.errAllCandidatesInvalid")
            : t("skuWorkbench.errNoAlternateCandidates")
        );
        return;
      }

      lastImageScoresRef.current = pipeline.matchScores ?? {};
      const previewRanked = rankCandidatesByCoverage(
        accepted,
        supplementGaps,
        matrices,
        lastImageScoresRef.current
      );
      setCandidateMatrices(matrices);
      setCandidates(previewRanked);

      const autoAssignments: Record<string, GapAssignment> = {};
      for (const ranked of previewRanked) {
        const key = candidateKeyOf(ranked.candidate);
        const matrix = matrices.get(key);
        if (!matrix?.length) continue;
        Object.assign(
          autoAssignments,
          autoAssignSupplementGaps(supplementGaps, key, matrix)
        );
      }
      if (Object.keys(autoAssignments).length > 0) {
        setGapAssignments(autoAssignments);
      }

      if (rejectedCount > 0) {
        showToast(t("skuWorkbench.toastFilteredInvalid", { count: rejectedCount }));
      }
    } catch (err) {
      setSearchError(readableError(err));
    } finally {
      setSearchLoading(false);
      setMatrixLoading(false);
    }
  }, [shopName, product, supplementGaps, tangbuyProductId, detailUrl, v1Detail, showToast, t, locale]);

  const clearSupplementWorkspace = useCallback(() => {
    setCandidates([]);
    setCandidateMatrices(new Map());
    setGapAssignments({});
    setSearchError(null);
    setManualAddInput("");
    setManualAddError(null);
  }, []);

  const supplementExcludeCtx = useMemo(
    () => ({
      tangbuyProductId,
      detailUrl,
      primaryOfferId: v1Detail?.primaryOffer?.offerId,
      primaryOfferDetailUrl: v1Detail?.primaryOffer?.detailUrl,
      supplementOfferId: v1Detail?.supplementOffer?.offerId,
      supplementOfferDetailUrl: v1Detail?.supplementOffer?.detailUrl,
      boundTangbuyProductIds: Array.from(
        new Set(
          product.variants
            .map((v) => v.bound?.tangbuyProductId?.trim())
            .filter((id): id is string => Boolean(id))
        )
      ),
    }),
    [tangbuyProductId, detailUrl, v1Detail, product.variants]
  );

  const runManualSupplementAdd = useCallback(async () => {
    const raw = manualAddInput.trim();
    if (!raw) {
      showToast(t("skuWorkbench.toastEnterLinkOrId"));
      return;
    }
    setManualAddLoading(true);
    setManualAddError(null);
    try {
      const { candidate, matrixRows } = await loadSupplementManualProduct(raw);
      const filtered = filterSupplementCandidates([candidate], supplementExcludeCtx);
      if (!filtered.length) {
        setManualAddError(t("skuWorkbench.errDuplicatePrimary"));
        return;
      }
      const accepted = filtered[0]!;
      const acceptedKey = candidateKeyOf(accepted);

      if (candidates.some((c) => candidateKeyOf(c.candidate) === acceptedKey)) {
        showToast(t("skuWorkbench.toastAlreadyInList"));
        return;
      }

      setCandidateMatrices((prev) => {
        const next = new Map(prev);
        next.set(acceptedKey, matrixRows);
        setCandidates((prevCandidates) =>
          rankCandidatesByCoverage(
            [...prevCandidates.map((c) => c.candidate), accepted],
            supplementGaps,
            next,
            lastImageScoresRef.current
          )
        );
        return next;
      });

      const auto = autoAssignSupplementGaps(supplementGaps, acceptedKey, matrixRows);
      const autoCount = Object.keys(auto).length;
      if (autoCount > 0) {
        setGapAssignments((prev) => {
          const next = { ...prev };
          for (const [variantId, assignment] of Object.entries(auto)) {
            const existing = next[variantId];
            if (existing?.candidateKey && existing?.skuId) continue;
            next[variantId] = assignment;
          }
          return next;
        });
      }

      setManualAddInput("");
      showToast(
        autoCount > 0
          ? t("skuWorkbench.toastAddedWithAuto", { count: autoCount })
          : t("skuWorkbench.toastAddedManual")
      );
    } catch (err) {
      setManualAddError(readableError(err));
    } finally {
      setManualAddLoading(false);
    }
  }, [
    manualAddInput,
    supplementExcludeCtx,
    supplementGaps,
    candidates,
    showToast,
    t,
  ]);

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
        6,
        { locale }
      );
      if (pipeline.error) {
        setReplaceSearchError(pipeline.error);
        return;
      }
      if (!pipeline.rankedItems.length) {
        setReplaceSearchError(t("skuWorkbench.errNoReplaceCandidates"));
        return;
      }
      setReplaceCandidates(pipeline.rankedItems.slice(0, 6));
    } catch (err) {
      setReplaceSearchError(readableError(err));
    } finally {
      setReplaceSearchLoading(false);
    }
  }, [shopName, product, t, locale]);

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
        throw new Error(t("skuWorkbench.errCannotParseDetailUrl"));
      }
      const localizedTitle =
        resolve1688ProductTitle({
          locale,
          title: candidate.title,
          titleTrans: candidate.titleTrans,
          subject: candidate.subject,
          subjectTrans: candidate.subjectTrans,
          englishTitle: candidate.englishTitle,
        })?.trim() || null;

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
        offerTitle: localizedTitle,
        auto: false,
      });
      writeProductSourceIdentity(shopName, product.thirdPlatformItemId, fromCandidate);
      setSourceOverride({
        detailUrl: confirmDetailUrl.trim(),
        tangbuyProductId: offerProductId,
        title: localizedTitle || t("skuWorkbench.newPrimarySource"),
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
          ? t("skuWorkbench.toastReplacedWithAlign", { count: matched })
          : t("skuWorkbench.toastReplacedReview")
      );
    } catch (err) {
      setSaveError(mapImageMatchConfirmError(err) || mapSkuAlignError(err, t));
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

  useEffect(() => {
    if (loading || !matrix.length) return;
    const suggestions = buildAutoSuggestions(
      product.variants,
      matrix,
      selections,
      llmScores
    );
    if (Object.keys(suggestions).length === 0) return;
    setSelections((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [variantId, skuId] of Object.entries(suggestions)) {
        if (!next[variantId]?.trim()) {
          next[variantId] = skuId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [loading, matrix, product.variants, llmScores]);

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

  const [bindingVariantId, setBindingVariantId] = useState<string | null>(null);

  const handleSelect = async (variantId: string, skuId: string) => {
    setSelections((prev) => ({ ...prev, [variantId]: skuId }));
    const trimmed = skuId.trim();
    if (!trimmed || !canPick || !effectiveTangbuyId) return;

    const variant = product.variants.find((v) => v.thirdPlatformSkuId === variantId);
    if (!variant) return;
    const current = variant.bound?.tangbuySkuId?.trim() ?? "";
    if (trimmed === current) return;

    const row = findSourceSkuRow(matrix, trimmed);
    if (!row) return;

    setBindingVariantId(variantId);
    try {
      await manualBindWithFallback(
        variantId,
        {
          shopName,
          thirdPlatformItemId: product.thirdPlatformItemId,
          offerId: effectiveTangbuyId,
          offerSkuId: trimmed,
          reason: row.specLabel,
          detailUrl: effectiveDetailUrl ?? undefined,
          sourceRole: "PRIMARY",
          matchSource: isSemanticLlmBoost(llmScores[pairKey(variant.optionLabel, row.specLabel)])
            ? "SEMANTIC"
            : undefined,
        },
        { detailUrl: effectiveDetailUrl ?? undefined }
      );
      recordBinding(variant.optionLabel, row.specLabel, { shopName });
      showToast(t("skuWorkbench.toastBound", { spec: row.specLabel }));
      await onSaved();
    } catch (err) {
      showToast(readableError(err));
      setSelections((prev) => ({
        ...prev,
        [variantId]: current,
      }));
    } finally {
      setBindingVariantId(null);
    }
  };

  const applyAllSuggestions = () => {
    const count = Object.keys(autoSuggestions).length;
    if (count === 0) {
      showToast(t("skuWorkbench.toastNoSuggestions"));
      return;
    }
    setSelections((prev) => ({ ...prev, ...autoSuggestions }));
    showToast(t("skuWorkbench.toastAppliedSuggestions", { count }));
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
      showToast(t("skuWorkbench.toastNothingToSave"));
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
            matchSource: isSemanticLlmBoost(llmScores[pairKey(variant.optionLabel, specLabel)])
              ? "SEMANTIC"
              : undefined,
          },
          { detailUrl: effectiveDetailUrl ?? undefined }
        );
        // 反馈沉淀：从人工确认的绑定学习别名（如 深燕麦≈燕麦色）
        recordBinding(variant.optionLabel, specLabel, { shopName });
      }
      showToast(t("skuWorkbench.toastSavedMappings", { count: pendingChanges.length }));
      await onSaved();
      if (supplementGaps.length > 0) {
        onPhaseChange("supplement");
      } else {
        onBack();
      }
    } catch (err) {
      setSaveError(mapSkuAlignError(err, t));
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
      showToast(t("skuWorkbench.toastPickSupplement"));
      return;
    }
    setRegistering(true);
    setSaveError(null);
    try {
      const distinctKeys = new Set(entries.map(([, a]) => a.candidateKey));
      for (const key of distinctKeys) {
        const cand = candidateByKey.get(key);
        if (!cand) continue;
        const probe = await filterAvailableSupplementCandidates([cand.candidate]);
        if (!probe.accepted.length) {
          const title = cand.candidate.title?.trim() || t("skuWorkbench.selectedSourceFallback");
          throw new Error(t("skuWorkbench.errSourceInvalid", { title }));
        }
      }

      // Register each distinct supplement merchant once (best-effort).
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
        const variantLabel = product.variants.find(
          (v) => v.thirdPlatformSkuId === variantId
        )?.optionLabel;
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
            matchSource:
              variantLabel && row?.specLabel
                ? isSemanticLlmBoost(llmScores[pairKey(variantLabel, row.specLabel)])
                  ? "SEMANTIC"
                  : undefined
                : undefined,
          },
          { detailUrl: detail }
        );
        // 反馈沉淀：补充货源绑定同样学习别名
        if (variantLabel && row?.specLabel)
          recordBinding(variantLabel, row.specLabel, { shopName });
      }
      showToast(t("skuWorkbench.toastSavedSupplement", { count: entries.length }));
      onBack();
      await onSaved();
    } catch (err) {
      setSaveError(mapSkuAlignError(err, t));
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
      {
        id: "primary",
        label: t("skuWorkbench.tabPrimary", { count: product.variants.length }),
      },
      {
        id: "replace",
        label: t("skuWorkbench.tabReplace"),
      },
      {
        id: "supplement",
        label:
          supplementGaps.length > 0
            ? t("skuWorkbench.tabSupplementCount", { count: supplementGaps.length })
            : t("skuWorkbench.tabSupplement"),
      },
    ],
    [product.variants.length, supplementGaps.length, t]
  );

  /* ---------- render ---------- */
  return (
    <div className="flex min-h-[min(72vh,800px)] flex-col overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
      <header className="shrink-0 border-b border-hairline px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <VariantThumb
              src={product.imageUrl}
              alt={product.title ?? ""}
              className="h-16 w-16"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                {t("skuWorkbench.headerEyebrow")}
              </p>
              <h2 className="text-base font-semibold leading-6 text-ink">
                {product.title ?? product.thirdPlatformItemId}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span className="text-emerald-700">
                  {t("skuWorkbench.aligned", {
                    aligned: alignedCount,
                    total: product.variants.length,
                  })}
                </span>
                <span>·</span>
                <span>{t("skuWorkbench.unmapped", { count: unboundCount })}</span>
                {supplementGaps.length > 0 ? (
                  <>
                    <span>·</span>
                    <span className="text-amber-700">
                      {t("skuWorkbench.sourceGaps", { count: supplementGaps.length })}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 shrink-0 px-0"
              onClick={onBack}
              disabled={saving || registering}
              title={t("skuWorkbench.backToListTitle")}
              aria-label={t("skuWorkbench.backToListAria")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
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
            bindingVariantId={bindingVariantId}
            merchantTitle={currentMerchantTitle}
            merchantImage={currentMerchantImage}
            currentSourceLabel={t("skuWorkbench.currentSource")}
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
            locale={locale}
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
            manualAddInput={manualAddInput}
            manualAddLoading={manualAddLoading}
            manualAddError={manualAddError}
            candidates={candidates}
            candidateMatrices={candidateMatrices}
            gapAssignments={gapAssignments}
            merchantCount={merchantCount}
            hasSupplementOffer={hasSupplementOffer}
            shopCurrency={product.currency}
            pricingTemplate={pricingTemplate}
            locale={locale}
            onSearch={() => void runSupplementSearch()}
            onManualAddInputChange={setManualAddInput}
            onManualAdd={() => void runManualSupplementAdd()}
            onClearManualInput={() => {
              setManualAddInput("");
              setManualAddError(null);
            }}
            onClearWorkspace={clearSupplementWorkspace}
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
                ? t("skuWorkbench.footerPendingSave", { count: pendingChanges.length })
                : t("skuWorkbench.footerPrimaryHint")
              : phase === "replace"
                ? t("skuWorkbench.footerReplaceHint")
                : supplementGaps.length > 0
                  ? t("skuWorkbench.footerSupplementProgress", {
                      assigned: assignedGapCount,
                      total: supplementGaps.length,
                    })
                  : t("skuWorkbench.footerNoSupplementNeeded")}
          </p>
          <div className="flex items-center gap-2">
            {phase === "primary" ? (
              <Button
                size="sm"
                onClick={() => void savePrimary()}
                disabled={saving || !canPick || loading}
              >
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {t("skuWorkbench.saveMappings")}
              </Button>
            ) : phase === "replace" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onPhaseChange("primary")}
                disabled={replacingPrimary}
              >
                {t("skuWorkbench.backToCompare")}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onPhaseChange("primary")}
                  disabled={registering}
                >
                  {t("skuWorkbench.backToCompare")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void registerSupplement()}
                  disabled={registering || assignedGapCount === 0 || supplementGaps.length === 0}
                >
                  {registering ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  {t("skuWorkbench.saveSupplement")}
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
  bindingVariantId,
  merchantTitle,
  merchantImage,
  currentSourceLabel,
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
  bindingVariantId: string | null;
  merchantTitle: string;
  merchantImage: string | null;
  currentSourceLabel: string;
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
  const t = useT();
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
              <p className="text-[10px] uppercase tracking-wide text-ink-subtle">
                {currentSourceLabel}
              </p>
              <p className="line-clamp-1 text-xs font-medium text-ink">{merchantTitle}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 gap-1 text-[11px]"
            onClick={onApplySuggestions}
            disabled={suggestCount === 0}
            title={t("skuWorkbench.applySuggestionsTitle")}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {suggestCount > 0
              ? t("skuWorkbench.applySuggestions", { count: suggestCount })
              : t("skuWorkbench.suggestionsApplied")}
          </Button>
        </div>
      </div>

      {/* 列表头 */}
      <div className="shrink-0 border-b border-hairline bg-canvas/40 px-5 py-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1.25fr)] items-center gap-4 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
          <span>{t("skuWorkbench.colShopVariant")}</span>
          <span />
          <span>
            {t("skuWorkbench.colSourceMapping", {
              scope:
                merchantTitle === currentSourceLabel
                  ? currentSourceLabel
                  : t("skuWorkbench.sameSource"),
            })}
          </span>
        </div>
      </div>

      {/* 对照列表 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("skuWorkbench.loadingSpecTable")}
          </div>
        ) : !canPick ? (
          <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("skuWorkbench.errNoSourceLink")}
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
              {t("skuWorkbench.retry")}
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
                binding={bindingVariantId === variant.thirdPlatformSkuId}
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
function variantDisplayStateClass(state: SkuVariantDisplayState): string {
  switch (state) {
    case "active_auto":
      return "bg-emerald-50 text-emerald-700";
    case "manual_active":
      return "bg-sky-50 text-sky-700";
    case "needs_review":
      return "bg-amber-50 text-amber-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function PrimaryCompareRow({
  variant,
  matrix,
  merchantTitle,
  shopCurrency,
  pricingTemplate,
  value,
  isGap,
  highlighted,
  binding,
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
  binding?: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
  onSelect: (skuId: string) => void;
  onGoSupplement: () => void;
}) {
  const t = useT();
  const displayState = deriveVariantDisplayState(variant);
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
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-xs font-medium text-ink">{variant.optionLabel}</p>
            <span
              className={cn(
                "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                variantDisplayStateClass(displayState)
              )}
            >
              {displayStateLabel(t, displayState)}
            </span>
            {binding ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-ink-subtle" aria-label={t("skuWorkbench.savingAria")} />
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            {t("skuWorkbench.listingPrice")}{" "}
            {formatShopListingPrice(variant.price, shopCurrency)}
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
              ? t("skuWorkbench.boundSkuAdjust", { id: effectiveSkuId })
              : t("skuWorkbench.specTableEmpty")}
          </p>
        ) : (
          <div className="space-y-2">
            <Select
              value={effectiveSkuId}
              onChange={(e) => onSelect(e.target.value)}
              disabled={binding}
              className={COMPARE_SELECT_CLASS}
            >
              <option value="">
                {ranked.length === 0
                  ? t("skuWorkbench.noSpecsInSource")
                  : t("skuWorkbench.pickSpec")}
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
                {t("skuWorkbench.currentSpec", {
                  spec: row.specLabel,
                  price: formatOptionPrice(row.procurementPrice, shopCurrency, pricingTemplate),
                })}
              </p>
            ) : null}
            {(isGap || bestScore < COVERAGE_MATCH_THRESHOLD) && !effectiveSkuId ? (
              <button
                type="button"
                onClick={onGoSupplement}
                className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-amber-300/80 bg-amber-50/60 px-2 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-50"
              >
                <Plus className="h-3 w-3" />
                {t("skuWorkbench.goSupplement")}
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
  locale,
  onSearch,
  onApply,
}: {
  currentTitle: string;
  currentImage?: string | null;
  loading: boolean;
  error: string | null;
  candidates: ImageSearchProduct[];
  replacing: boolean;
  locale: Locale;
  onSearch: () => void;
  onApply: (candidate: ImageSearchProduct) => void;
}) {
  const t = useT();
  const unknownSource = t("skuWorkbench.unknownSource");
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-hairline px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink">{t("skuWorkbench.replaceTitle")}</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {t("skuWorkbench.replaceDesc")}
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
            {t("skuWorkbench.aiImageSearch")}
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2.5 rounded-[var(--radius-control)] border border-hairline/80 bg-surface-muted/40 px-3 py-2">
          <VariantThumb src={currentImage} alt={currentTitle} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
              {t("skuWorkbench.currentPrimary")}
            </p>
            <p className="truncate text-xs text-ink">
              {truncateMerchant(currentTitle, unknownSource, 36)}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("skuWorkbench.searchingReplace")}
          </div>
        ) : error ? (
          <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] text-amber-800">{error}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={onSearch}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              {t("skuWorkbench.searchAgain")}
            </Button>
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-muted">
            {t("skuWorkbench.replaceEmptyHint")}
          </p>
        ) : (
          <div className="space-y-2">
            {candidates.map((candidate) => {
              const key = candidateKeyOf(candidate);
              const displayTitle =
                resolveImageSearchDisplayTitle(candidate, locale) ||
                t("skuWorkbench.unnamedSource");
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-[var(--radius-control)] border border-hairline px-3 py-2.5"
                >
                  <VariantThumb
                    src={candidate.imageUrl}
                    alt={displayTitle}
                    className="h-12 w-12"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-medium text-ink">
                      {displayTitle}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {candidate.price ? `¥${candidate.price}` : t("skuWorkbench.priceUnknown")}
                      {candidate.soldCount != null
                        ? t("skuWorkbench.monthlySales", { count: candidate.soldCount })
                        : ""}
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
                      t("skuWorkbench.replace")
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
  manualAddInput,
  manualAddLoading,
  manualAddError,
  candidates,
  candidateMatrices,
  gapAssignments,
  merchantCount,
  hasSupplementOffer,
  shopCurrency,
  pricingTemplate,
  onSearch,
  onManualAddInputChange,
  onManualAdd,
  onClearManualInput,
  onClearWorkspace,
  onSetMerchant,
  onSetSku,
  matrixFetchingKey,
  className,
  locale,
}: {
  supplementGaps: SkuVariant[];
  searchLoading: boolean;
  matrixLoading: boolean;
  searchError: string | null;
  manualAddInput: string;
  manualAddLoading: boolean;
  manualAddError: string | null;
  candidates: RankedCoverageCandidate[];
  candidateMatrices: Map<string, SourceSkuRow[]>;
  gapAssignments: Record<string, GapAssignment>;
  merchantCount: number;
  hasSupplementOffer: boolean;
  shopCurrency?: string | null;
  pricingTemplate?: PricingTemplate | null;
  locale: Locale;
  onSearch: () => void;
  onManualAddInputChange: (value: string) => void;
  onManualAdd: () => void;
  onClearManualInput: () => void;
  onClearWorkspace: () => void;
  onSetMerchant: (variant: SkuVariant, candidateKey: string) => void;
  onSetSku: (variantId: string, skuId: string) => void;
  matrixFetchingKey?: string | null;
  className?: string;
}) {
  const t = useT();
  const busy = searchLoading || manualAddLoading;
  const canClearWorkspace =
    candidates.length > 0 ||
    Object.values(gapAssignments).some((a) => a?.candidateKey?.trim());

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      {/* 搜索控制 */}
      <div className="shrink-0 border-b border-hairline px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-ink">{t("skuWorkbench.supplementTitle")}</p>
              {canClearWorkspace ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 w-7 shrink-0 px-0"
                  onClick={onClearWorkspace}
                  disabled={busy}
                  title={t("skuWorkbench.clearWorkspaceTitle")}
                  aria-label={t("skuWorkbench.clearWorkspaceAria")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {t("skuWorkbench.supplementDesc")}
              {merchantCount > 0
                ? t("skuWorkbench.merchantsFound", { count: merchantCount })
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="relative">
              <Input
                value={manualAddInput}
                onChange={(e) => onManualAddInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) onManualAdd();
                }}
                placeholder={t("skuWorkbench.linkOrIdPlaceholder")}
                className="h-8 w-44 pr-8 text-[11px]"
                disabled={busy}
              />
              {manualAddInput.trim() ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 px-0"
                  onClick={onClearManualInput}
                  disabled={busy}
                  title={t("skuWorkbench.clearInput")}
                  aria-label={t("skuWorkbench.clearInputAria")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 shrink-0 gap-1 text-[11px]"
              onClick={onManualAdd}
              disabled={busy || !manualAddInput.trim()}
            >
              {manualAddLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {t("skuWorkbench.manualAdd")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 shrink-0 gap-1 text-[11px]"
              onClick={onSearch}
              disabled={busy}
            >
              {searchLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {t("skuWorkbench.aiImageSearch")}
            </Button>
          </div>
        </div>
        {manualAddError ? (
          <p className="mt-2 text-[11px] text-red-600">{manualAddError}</p>
        ) : null}
      </div>

      {/* 缺口列表 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {searchLoading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("skuWorkbench.searchingSupplement")}
          </div>
        ) : searchError ? (
          <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] text-amber-800">{searchError}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={onSearch}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              {t("skuWorkbench.searchAgain")}
            </Button>
          </div>
        ) : supplementGaps.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-muted">
            {t("skuWorkbench.noGapVariants")}
          </p>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-muted">
            {t("skuWorkbench.supplementEmptyHint")}
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
                locale={locale}
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
  locale,
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
  locale: Locale;
  onSetMerchant: (candidateKey: string) => void;
  onSetSku: (skuId: string) => void;
}) {
  const t = useT();
  const unknownSource = t("skuWorkbench.unknownSource");
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
            {t("skuWorkbench.listingPrice")}{" "}
            {formatShopListingPrice(variant.price, shopCurrency)}
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
            {t("skuWorkbench.merchant")}
          </p>
          <Select
            value={candidateKey}
            onChange={(e) => onSetMerchant(e.target.value)}
            className={COMPARE_SELECT_CLASS}
          >
            <option value="">{t("skuWorkbench.pickMerchant")}</option>
            {candidates.map((c) => {
              const key = candidateKeyOf(c.candidate);
              const matrixLoaded = candidateMatrices.has(key);
              return (
                <option key={key} value={key}>
                  {truncateMerchant(
                    resolveImageSearchDisplayTitle(c.candidate, locale),
                    unknownSource,
                    28
                  )}
                  {matrixLoaded && c.total > 0
                    ? t("skuWorkbench.coverage", {
                        coverage: c.coverage,
                        total: c.total,
                      })
                    : ""}
                </option>
              );
            })}
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
            {t("skuWorkbench.sourceSpec")}
          </p>
          <Select
            value={skuId}
            onChange={(e) => onSetSku(e.target.value)}
            className={COMPARE_SELECT_CLASS}
            disabled={!candidateKey || fetchingSpecs || skuOptions.length === 0}
          >
          <option value="">
            {fetchingSpecs
              ? t("skuWorkbench.loadingSpecs")
              : !candidateKey
              ? t("skuWorkbench.pickMerchantFirst")
              : skuOptions.length === 0
                ? t("skuWorkbench.sourceNoSpecs")
                : t("skuWorkbench.pickSpec")}
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
              {t("skuWorkbench.providedBy", {
                merchant: truncateMerchant(
                  chosenCandidate
                    ? resolveImageSearchDisplayTitle(
                        chosenCandidate.candidate,
                        locale
                      )
                    : null,
                  unknownSource
                ),
                spec: chosenRow?.specLabel ?? "",
              })}
            </span>
            <span className="shrink-0 text-[10px] font-medium text-ink-subtle">
              {formatOptionPrice(chosenRow?.procurementPrice, shopCurrency, pricingTemplate)}
            </span>
          </div>
        ) : (
          <Badge variant="warning" className="px-1.5 py-0 text-[9px]">
            {t("skuWorkbench.pendingSource")}
          </Badge>
        )}
      </div>
    </div>
  );
}
