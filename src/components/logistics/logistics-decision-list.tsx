"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import type { LogisticsEstimateResult } from "@/lib/api";
import {
  buildQuoteColumn,
  countIssues,
  countReady,
  filterProfiles,
  filterVariants,
  shouldDefaultExpand,
  shouldShowAcceptAction,
  shouldShowDecisionReason,
  TYPE_OPTIONS,
  variantStatusBadgeClass,
  variantStatusLabel,
  type LogisticsFilterMode,
} from "@/lib/logistics/display";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsTypeCode,
  ProductLogisticsProfile,
  VariantLogisticsDecision,
} from "@/lib/types";

function ProductThumb({
  src,
  alt,
}: {
  src?: string | null;
  alt: string;
}) {
  if (src?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="h-12 w-12 shrink-0 rounded-[var(--radius-control)] border border-hairline object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-hairline bg-surface-muted text-[10px] text-ink-subtle"
      aria-hidden
    >
      无图
    </div>
  );
}

function VariantDetailReadonly({ decision }: { decision: VariantLogisticsDecision }) {
  return (
    <div className="mt-2 space-y-1 rounded border border-hairline bg-surface-muted/30 p-2 text-[10px] text-ink-subtle">
      {decision.decisionConfirmed && decision.acceptedAt ? (
        <p>确认时间: {new Date(decision.acceptedAt).toLocaleString()}</p>
      ) : null}
      {decision.decisionReason ? <p>{decision.decisionReason}</p> : null}
      {decision.postalLimitLabel ? <p>邮限: {decision.postalLimitLabel}</p> : null}
      {decision.tangbuySkuId ? <p>skuId: {decision.tangbuySkuId}</p> : null}
      {decision.tangbuyGoodsId ? <p>goodsId: {decision.tangbuyGoodsId}</p> : null}
      {decision.estimatedVolumeCm3 != null ? (
        <p>体积: {decision.estimatedVolumeCm3} cm³</p>
      ) : null}
      {decision.estimatedLengthCm != null ? (
        <p>
          尺寸: {decision.estimatedLengthCm}×{decision.estimatedWidthCm}×
          {decision.estimatedHeightCm} cm
        </p>
      ) : null}
      {decision.postalLimitConfidence != null ? (
        <p>邮限置信: {Math.round(decision.postalLimitConfidence * 100)}%</p>
      ) : null}
      {decision.quoteStatus ? <p>报价状态: {decision.quoteStatus}</p> : null}
      {decision.alternativeLines?.length ? (
        <p>备选线路: {decision.alternativeLines.length} 条</p>
      ) : null}
    </div>
  );
}

function VariantDecisionRow({
  decision,
  quoteResult,
  busy,
  accepting,
  focusKey,
  highlighted,
  onCorrectType,
  onAcceptAi,
}: {
  decision: VariantLogisticsDecision;
  quoteResult?: LogisticsEstimateResult;
  busy: boolean;
  accepting?: boolean;
  focusKey: string;
  highlighted: boolean;
  onCorrectType: () => void;
  onAcceptAi: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const quote = buildQuoteColumn(decision, quoteResult);
  const status = decision.decisionStatus;
  const showMeta =
    !decision.decisionConfirmed &&
    (status === "pending_postal_meta" ||
      status === "needs_review" ||
      status === "restricted");

  return (
    <div
      data-logistics-variant={decision.thirdPlatformSkuId}
      data-logistics-status={decision.decisionStatus}
      data-logistics-focus={focusKey}
      className={cn(
        "grid grid-cols-1 gap-2 border-t border-hairline/60 px-3 py-2.5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]",
        highlighted && "bg-amber-50/40 ring-1 ring-inset ring-amber-200"
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink">{decision.optionLabel}</span>
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
              variantStatusBadgeClass(decision)
            )}
          >
            {variantStatusLabel(decision)}
          </span>
        </div>
        {shouldShowDecisionReason(decision) && decision.decisionReason ? (
          <p className="line-clamp-1 text-[11px] text-ink-subtle">
            {decision.decisionReason}
          </p>
        ) : null}
        {showMeta ? (
          <p className="text-[11px] text-ink-muted">
            {decision.postalLimitLabel ?? "邮限未知"}
            {decision.estimatedWeightG != null
              ? ` · ${decision.estimatedWeightG}g`
              : ""}
          </p>
        ) : null}
      </div>

      <div className="min-w-0 text-[11px]">
        <p className="font-medium text-ink">{quote.primary}</p>
        {quote.secondary ? (
          <p className="text-ink-subtle">{quote.secondary}</p>
        ) : null}
        {quote.tertiary ? (
          <p className="text-ink-subtle">{quote.tertiary}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {status === "pending_sku" ? (
          <Link
            href="/sku-align"
            className="inline-flex h-7 items-center rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 text-[11px] font-medium text-ink hover:bg-surface-muted"
          >
            去 SKU 对齐
          </Link>
        ) : shouldShowAcceptAction(decision) ? (
          <>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={onAcceptAi}
              disabled={busy || accepting}
            >
              接受 AI
            </Button>
            {(status === "needs_review" || status === "restricted") && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-[11px]"
                onClick={onCorrectType}
                disabled={busy || accepting}
              >
                修正主类型
              </Button>
            )}
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 px-0"
          title="详情"
          aria-label="详情"
          onClick={() => setDetailOpen((v) => !v)}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </div>

      {detailOpen ? <VariantDetailReadonly decision={decision} /> : null}
    </div>
  );
}

function ProductDecisionCard({
  profile,
  filterMode,
  expanded,
  onToggle,
  quoteResults,
  correcting,
  highlightVariantId,
  accepting,
  onCorrect,
  onAcceptAi,
}: {
  profile: ProductLogisticsProfile;
  filterMode: LogisticsFilterMode;
  expanded: boolean;
  onToggle: () => void;
  quoteResults: Map<string, LogisticsEstimateResult>;
  correcting: boolean;
  highlightVariantId: string | null;
  accepting?: boolean;
  onCorrect: (itemId: string, type: LogisticsTypeCode) => void;
  onAcceptAi: (variant: VariantLogisticsDecision) => void;
}) {
  const variants = filterVariants(profile.variantDecisions ?? [], filterMode);
  const ready = countReady(profile);
  const issues = countIssues(profile);

  if (variants.length === 0) return null;

  return (
    <article
      data-logistics-product={profile.thirdPlatformItemId}
      className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface"
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <ProductThumb src={profile.primaryImageUrl} alt={profile.title ?? "商品"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm font-medium text-ink">
                {profile.title || profile.thirdPlatformItemId}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-subtle">
                {ready}/{profile.totalVariants ?? variants.length} 可报价
                {issues > 0 ? ` · ${issues} 待处理` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-subtle hover:bg-surface-muted"
              title={expanded ? "折叠" : "展开"}
              aria-label={expanded ? "折叠" : "展开"}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select
              value={profile.dominantLogisticsType || "GENERAL"}
              disabled={correcting}
              onChange={(e) =>
                onCorrect(
                  profile.thirdPlatformItemId,
                  e.target.value as LogisticsTypeCode
                )
              }
              className="h-7 w-32 text-[11px]"
              onClick={(e) => e.stopPropagation()}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {expanded
        ? variants.map((v) => (
            <VariantDecisionRow
              key={v.thirdPlatformSkuId}
              decision={v}
              quoteResult={quoteResults.get(v.thirdPlatformSkuId)}
              busy={correcting}
              accepting={accepting}
              focusKey={`${profile.thirdPlatformItemId}:${v.thirdPlatformSkuId}`}
              highlighted={
                highlightVariantId === v.thirdPlatformSkuId ||
                highlightVariantId === `status:${v.decisionStatus}`
              }
              onCorrectType={() => {
                const el = document.querySelector(
                  `[data-logistics-product="${profile.thirdPlatformItemId}"] select`
                ) as HTMLSelectElement | null;
                el?.focus();
              }}
              onAcceptAi={() => onAcceptAi(v)}
            />
          ))
        : null}
    </article>
  );
}

export function LogisticsDecisionList({
  analysis,
  filterMode,
  quoteResults,
  correctingId,
  focusTarget,
  onCorrect,
  onAcceptAi,
  onClearFocus,
  accepting,
}: {
  analysis: LogisticsAnalysis;
  filterMode: LogisticsFilterMode;
  quoteResults: Map<string, LogisticsEstimateResult>;
  correctingId?: string | null;
  focusTarget: LogisticsFocusTarget | null;
  onCorrect: (itemId: string, type: LogisticsTypeCode) => void;
  onAcceptAi: (variant: VariantLogisticsDecision, productId: string) => void;
  onClearFocus: () => void;
  accepting?: boolean;
}) {
  const profiles = useMemo(
    () => filterProfiles(analysis.productProfiles ?? [], filterMode),
    [analysis.productProfiles, filterMode]
  );

  const defaultExpanded = useMemo(() => {
    const ids = new Set<string>();
    for (const p of profiles) {
      if (shouldDefaultExpand(p, filterMode)) {
        ids.add(p.thirdPlatformItemId);
      }
    }
    return ids;
  }, [profiles, filterMode]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(defaultExpanded);

  useEffect(() => {
    setExpandedIds(defaultExpanded);
  }, [defaultExpanded]);

  useEffect(() => {
    if (!focusTarget) return;
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
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(productId);
          return next;
        });
      }
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    const t = window.setTimeout(onClearFocus, 2400);
    return () => window.clearTimeout(t);
  }, [focusTarget, onClearFocus]);

  const highlightVariantId = focusTarget?.variantId
    ? focusTarget.variantId
    : focusTarget?.status
      ? `status:${focusTarget.status}`
      : null;

  if (profiles.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-hairline px-4 py-8 text-center text-sm text-ink-subtle">
        {filterMode === "issues"
          ? "当前没有待处理项"
          : filterMode === "ready"
            ? "暂无可报价规格"
            : "暂无已关联商品"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {profiles.map((p) => {
        const expanded = expandedIds.has(p.thirdPlatformItemId);
        return (
          <ProductDecisionCard
            key={p.thirdPlatformItemId}
            profile={p}
            filterMode={filterMode}
            expanded={expanded}
            onToggle={() =>
              setExpandedIds((prev) => {
                const next = new Set(prev);
                if (next.has(p.thirdPlatformItemId)) {
                  next.delete(p.thirdPlatformItemId);
                } else {
                  next.add(p.thirdPlatformItemId);
                }
                return next;
              })
            }
            quoteResults={quoteResults}
            correcting={correctingId === p.thirdPlatformItemId}
            highlightVariantId={highlightVariantId}
            accepting={accepting}
            onCorrect={onCorrect}
            onAcceptAi={(v) => onAcceptAi(v, p.thirdPlatformItemId)}
          />
        );
      })}
    </div>
  );
}

export type LogisticsFocusTarget = {
  productId?: string;
  variantId?: string;
  status?: LogisticsDecisionStatus;
};
