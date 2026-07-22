"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LogisticsEstimateResult } from "@/lib/api";
import {
  filterProfiles,
  filterVariants,
  LOGISTICS_PAGE_SIZE,
  variantCardTone,
  type LogisticsFilterMode,
} from "@/lib/logistics/display";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import {
  LogisticsProductGroup,
  buildProductShellMeta,
} from "@/components/logistics/logistics-product-group";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsTemplate,
  LogisticsTypeCode,
  PricingTemplate,
  ProductLogisticsProfile,
  VariantLogisticsDecision,
} from "@/lib/types";

import type { MeasureOverride } from "@/lib/logistics/product-shell";

export type { MeasureOverride };

export type LogisticsFocusTarget = {
  productId?: string;
  variantId?: string;
  status?: LogisticsDecisionStatus;
};

function MeasureEditPanel({
  decision,
  override,
  onSave,
  onCancel,
}: {
  decision: VariantLogisticsDecision;
  override?: MeasureOverride;
  onSave: (next: MeasureOverride) => void;
  onCancel: () => void;
}) {
  const [weightG, setWeightG] = useState(
    String(override?.weightG ?? decision.estimatedWeightG ?? "")
  );
  const [lengthCm, setLengthCm] = useState(
    String(override?.lengthCm ?? decision.estimatedLengthCm ?? "")
  );
  const [widthCm, setWidthCm] = useState(
    String(override?.widthCm ?? decision.estimatedWidthCm ?? "")
  );
  const [heightCm, setHeightCm] = useState(
    String(override?.heightCm ?? decision.estimatedHeightCm ?? "")
  );

  return (
    <div className="mt-2 rounded-md border border-amber-200/80 bg-amber-50/50 px-2.5 py-2">
      <p className="mb-2 text-[10px] font-medium text-amber-900">补充重量与尺寸</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="space-y-1 text-[10px] text-ink-subtle">
          重量 (g)
          <Input
            value={weightG}
            onChange={(e) => setWeightG(e.target.value)}
            className="h-7 bg-surface text-xs"
            inputMode="decimal"
          />
        </label>
        <label className="space-y-1 text-[10px] text-ink-subtle">
          长 (cm)
          <Input
            value={lengthCm}
            onChange={(e) => setLengthCm(e.target.value)}
            className="h-7 bg-surface text-xs"
            inputMode="decimal"
          />
        </label>
        <label className="space-y-1 text-[10px] text-ink-subtle">
          宽 (cm)
          <Input
            value={widthCm}
            onChange={(e) => setWidthCm(e.target.value)}
            className="h-7 bg-surface text-xs"
            inputMode="decimal"
          />
        </label>
        <label className="space-y-1 text-[10px] text-ink-subtle">
          高 (cm)
          <Input
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            className="h-7 bg-surface text-xs"
            inputMode="decimal"
          />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          className="h-7 text-[10px]"
          onClick={() =>
            onSave({
              weightG: weightG.trim() ? Number(weightG) : undefined,
              lengthCm: lengthCm.trim() ? Number(lengthCm) : undefined,
              widthCm: widthCm.trim() ? Number(widthCm) : undefined,
              heightCm: heightCm.trim() ? Number(heightCm) : undefined,
            })
          }
        >
          保存并重算
        </Button>
        <Button size="sm" variant="secondary" className="h-7 text-[10px]" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

function profileMatchesFilter(
  profile: ProductLogisticsProfile,
  filterMode: LogisticsFilterMode,
  quoteResults: Map<string, LogisticsEstimateResult>
): boolean {
  const variants = filterVariants(
    profile.variantDecisions ?? [],
    filterMode,
    quoteResults
  );
  return variants.length > 0;
}

export function LogisticsDecisionList({
  analysis,
  filterMode,
  quoteResults,
  activeTemplate,
  correctingId,
  focusTarget,
  onCorrect,
  onAcceptAi,
  onFetchProductQuotes,
  onClearFocus,
  onMeasureOverride,
  accepting,
  quotingProductId,
  pricing,
  pipelineActive,
  pipelineProgress,
}: {
  analysis: LogisticsAnalysis;
  filterMode: LogisticsFilterMode;
  quoteResults: Map<string, LogisticsEstimateResult>;
  activeTemplate: LogisticsTemplate | null;
  correctingId?: string | null;
  focusTarget: LogisticsFocusTarget | null;
  onCorrect: (itemId: string, type: LogisticsTypeCode) => void;
  onAcceptAi: (variant: VariantLogisticsDecision, productId: string) => void;
  onFetchProductQuotes: (productId: string, variants: VariantLogisticsDecision[]) => void;
  onClearFocus: () => void;
  onMeasureOverride?: (variantId: string, next: MeasureOverride) => void;
  accepting?: boolean;
  quotingProductId?: string | null;
  pricing?: PricingTemplate | null;
  pipelineActive?: boolean;
  pipelineProgress?: LogisticsPipelineProgress | null;
}) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [filterMode]);

  const profiles = useMemo(() => {
    const filtered = filterProfiles(analysis.productProfiles ?? [], filterMode, quoteResults)
      .filter((p) => profileMatchesFilter(p, filterMode, quoteResults))
      .map((profile) => ({
        profile,
        variants: filterVariants(
          profile.variantDecisions ?? [],
          filterMode,
          quoteResults
        ),
      }));

    return filtered.sort((a, b) => {
      const toneOrder = { auto: 0, review: 1, unidentified: 2 };
      const worst = (variants: VariantLogisticsDecision[]) => {
        let worstTone: keyof typeof toneOrder = "auto";
        for (const v of variants) {
          const t = variantCardTone(v);
          if (toneOrder[t] > toneOrder[worstTone]) worstTone = t;
        }
        return toneOrder[worstTone];
      };
      return worst(a.variants) - worst(b.variants);
    });
  }, [analysis.productProfiles, filterMode, quoteResults]);

  const totalPages = Math.max(1, Math.ceil(profiles.length / LOGISTICS_PAGE_SIZE));
  const pagedProfiles = useMemo(() => {
    const start = (page - 1) * LOGISTICS_PAGE_SIZE;
    return profiles.slice(start, start + LOGISTICS_PAGE_SIZE);
  }, [profiles, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const [measureOverrides, setMeasureOverrides] = useState<Map<string, MeasureOverride>>(
    new Map()
  );
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [userExpandedOverrides, setUserExpandedOverrides] = useState<
    Map<string, boolean>
  >(new Map());

  const shellMetaByProduct = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildProductShellMeta>>();
    for (const { profile, variants } of profiles) {
      map.set(
        profile.thirdPlatformItemId,
        buildProductShellMeta(
          { ...profile, variantDecisions: variants },
          quoteResults,
          pricing,
          pipelineProgress,
          pipelineActive
        )
      );
    }
    return map;
  }, [profiles, quoteResults, pricing, pipelineProgress, pipelineActive]);

  const isExpanded = useCallback(
    (productId: string) => {
      if (userExpandedOverrides.has(productId)) {
        return userExpandedOverrides.get(productId)!;
      }
      if (
        pipelineActive &&
        pipelineProgress?.phase === "running" &&
        pipelineProgress.currentProductId === productId
      ) {
        return true;
      }
      const meta = shellMetaByProduct.get(productId);
      if (
        filterMode === "ready" &&
        (meta?.status === "failed" || meta?.status === "partial" || meta?.status === "issues")
      ) {
        return true;
      }
      return meta?.defaultExpanded ?? false;
    },
    [userExpandedOverrides, shellMetaByProduct, pipelineActive, pipelineProgress, filterMode]
  );

  const toggleExpanded = useCallback(
    (productId: string) => {
      setUserExpandedOverrides((prev) => {
        const next = new Map(prev);
        const current =
          next.get(productId) ?? shellMetaByProduct.get(productId)?.defaultExpanded ?? false;
        next.set(productId, !current);
        return next;
      });
    },
    [shellMetaByProduct]
  );

  useEffect(() => {
    if (!pipelineProgress?.currentProductId || pipelineProgress.phase !== "running") {
      return;
    }
    const productId = pipelineProgress.currentProductId;
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-logistics-product="${CSS.escape(productId)}"]`
      );
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [pipelineProgress?.currentProductId, pipelineProgress?.phase]);

  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget.productId) {
      setUserExpandedOverrides((prev) => {
        const next = new Map(prev);
        next.set(focusTarget.productId!, true);
        return next;
      });
    }
    let selector: string | null = null;
    if (focusTarget.variantId) {
      selector = `[data-logistics-variant="${focusTarget.variantId}"]`;
    } else if (focusTarget.status) {
      selector = `[data-logistics-status="${focusTarget.status}"]`;
    } else if (focusTarget.productId) {
      selector = `[data-logistics-product="${focusTarget.productId}"]`;
    }
    if (!selector) return;

    const el = document.querySelector(selector);
    if (el) {
      const productEl = el.closest("[data-logistics-product]");
      const productId = productEl?.getAttribute("data-logistics-product");
      if (productId) {
        setUserExpandedOverrides((prev) => {
          const next = new Map(prev);
          next.set(productId, true);
          return next;
        });
      }
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    const t = window.setTimeout(onClearFocus, 2400);
    return () => window.clearTimeout(t);
  }, [focusTarget, onClearFocus]);

  const renderMeasureEditPanel = useCallback(
    (
      variant: VariantLogisticsDecision,
      override: MeasureOverride | undefined,
      onSave: (next: MeasureOverride) => void,
      onCancel: () => void
    ) => (
      <MeasureEditPanel
        decision={variant}
        override={override}
        onSave={onSave}
        onCancel={onCancel}
      />
    ),
    []
  );

  if (profiles.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-hairline px-4 py-12 text-center">
        <p className="text-sm font-medium text-ink">当前筛选下暂无商品</p>
        <p className="mt-1 text-xs text-ink-subtle">
          切换上方标签查看 AI 已规划或待确认项。
        </p>
      </div>
    );
  }

  const readySkuCount = profiles.reduce((sum, { variants }) => sum + variants.length, 0);

  return (
    <div className="space-y-3">
      {filterMode === "ready" && readySkuCount > 0 ? (
        <p className="rounded-[var(--radius-control)] border border-brand/20 bg-brand-soft/30 px-3 py-2 text-[11px] leading-snug text-ink">
          本 Tab 共{" "}
          <span className="font-semibold tabular-nums">{readySkuCount}</span>{" "}
          个普货 SKU 待拉取报价。点击右上角「一键预估」可批量处理；失败项请展开后点「重试报价」。
        </p>
      ) : null}
      {pagedProfiles.map(({ profile, variants }) => {
        const productId = profile.thirdPlatformItemId;
        const meta = shellMetaByProduct.get(productId)!;
        const displayProfile: ProductLogisticsProfile = {
          ...profile,
          variantDecisions: variants,
        };
        const pipelineHighlighted = Boolean(
          pipelineActive &&
            pipelineProgress?.currentProductId === productId &&
            pipelineProgress.phase === "running"
        );

        return (
          <LogisticsProductGroup
            key={productId}
            profile={displayProfile}
            quoteResults={quoteResults}
            activeTemplate={activeTemplate}
            pricing={pricing}
            meta={meta}
            expanded={isExpanded(productId)}
            pipelineHighlighted={pipelineHighlighted}
            correctingId={correctingId}
            accepting={accepting}
            pipelineActive={pipelineActive}
            measureOverrides={measureOverrides}
            editingVariantId={editingVariantId}
            quotingProduct={quotingProductId === productId}
            onToggleExpanded={() => toggleExpanded(productId)}
            onToggleEdit={(variantId) =>
              setEditingVariantId((cur) => (cur === variantId ? null : variantId))
            }
            onSaveMeasures={(variantId, next) => {
              setMeasureOverrides((prev) => {
                const map = new Map(prev);
                map.set(variantId, next);
                return map;
              });
              onMeasureOverride?.(variantId, next);
              setEditingVariantId(null);
            }}
            onAcceptAi={(variant) =>
              onAcceptAi(variant, profile.thirdPlatformItemId)
            }
            onFetchProductQuotes={() =>
              onFetchProductQuotes(profile.thirdPlatformItemId, variants)
            }
            onCorrect={(type) => onCorrect(productId, type)}
            onMeasureOverride={onMeasureOverride}
            renderMeasureEditPanel={renderMeasureEditPanel}
          />
        );
      })}

      {profiles.length > LOGISTICS_PAGE_SIZE ? (
        <div className="flex items-center justify-center gap-3 pt-1">
          <Button
            variant="secondary"
            size="sm"
            className="h-8 w-8 px-0"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            title="上一页"
            aria-label="上一页"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[5.5rem] text-center text-xs text-ink-subtle tabular-nums">
            第 {page} / {totalPages} 页
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 w-8 px-0"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            title="下一页"
            aria-label="下一页"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
