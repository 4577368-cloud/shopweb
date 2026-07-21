"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, MoreHorizontal } from "lucide-react";
import type { LogisticsEstimateResult } from "@/lib/api";
import {
  buildQuoteColumn,
  canFetchLogisticsQuote,
  countIssues,
  countReady,
  countReadyForQuote,
  fetchQuoteActionLabel,
  filterProfiles,
  filterVariants,
  formatQuoteStatusLabel,
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
  PricingTemplate,
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
  const quoteLabel = formatQuoteStatusLabel(decision);
  const line = decision.recommendedLine;

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
      {quoteLabel ? <p>线路报价: {quoteLabel}</p> : null}
      {line ? (
        <p>
          推荐线路: {line.lineName}
          {line.estimatedFee != null
            ? ` · ${line.currency ?? ""}${line.estimatedFee.toFixed(2)}`
            : ""}
          {line.estimatedDays != null ? ` · ${line.estimatedDays}天` : ""}
        </p>
      ) : decision.decisionConfirmed ? (
        <p>推荐线路: 未配置（可点右侧「拉取线路」或批量「拉取线路报价」）</p>
      ) : null}
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
  quotingThis,
  focusKey,
  highlighted,
  onCorrectType,
  onAcceptAi,
  onFetchQuote,
  pricing,
}: {
  decision: VariantLogisticsDecision;
  quoteResult?: LogisticsEstimateResult;
  busy: boolean;
  accepting?: boolean;
  quotingThis?: boolean;
  focusKey: string;
  highlighted: boolean;
  onCorrectType: () => void;
  onAcceptAi: () => void;
  onFetchQuote: () => void;
  pricing?: PricingTemplate | null;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const quote = buildQuoteColumn(decision, quoteResult, pricing);
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
            {canFetchLogisticsQuote(decision) ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-[11px]"
                onClick={onFetchQuote}
                disabled={busy || accepting || quotingThis}
              >
                {quotingThis ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                拉取线路
              </Button>
            ) : null}
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={onAcceptAi}
              disabled={busy || accepting || quotingThis}
            >
              接受 AI
            </Button>
            {(status === "needs_review" || status === "restricted") && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-[11px]"
                onClick={onCorrectType}
                disabled={busy || accepting || quotingThis}
              >
                修正主类型
              </Button>
            )}
          </>
        ) : canFetchLogisticsQuote(decision) ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px]"
            onClick={onFetchQuote}
            disabled={busy || accepting || quotingThis}
            title={fetchQuoteActionLabel(decision)}
          >
            {quotingThis ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {fetchQuoteActionLabel(decision)}
          </Button>
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
  quotingVariantId,
  onCorrect,
  onAcceptAi,
  onFetchQuote,
  pricing,
}: {
  profile: ProductLogisticsProfile;
  filterMode: LogisticsFilterMode;
  expanded: boolean;
  onToggle: () => void;
  quoteResults: Map<string, LogisticsEstimateResult>;
  correcting: boolean;
  highlightVariantId: string | null;
  accepting?: boolean;
  quotingVariantId?: string | null;
  onCorrect: (itemId: string, type: LogisticsTypeCode) => void;
  onAcceptAi: (variant: VariantLogisticsDecision) => void;
  onFetchQuote: (variant: VariantLogisticsDecision) => void;
  pricing?: PricingTemplate | null;
}) {
  const variants = filterVariants(profile.variantDecisions ?? [], filterMode);
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
                {countReadyForQuote(profile)}/{profile.totalVariants ?? variants.length}{" "}
                可报价
                {(profile.decisionStatusCounts?.confirmed ?? 0) > 0
                  ? ` · ${profile.decisionStatusCounts?.confirmed ?? 0} 已确认`
                  : ""}
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
              quotingThis={quotingVariantId === v.thirdPlatformSkuId}
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
              onFetchQuote={() => onFetchQuote(v)}
              pricing={pricing}
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
  onFetchQuote,
  onClearFocus,
  accepting,
  quotingVariantId,
  pricing,
}: {
  analysis: LogisticsAnalysis;
  filterMode: LogisticsFilterMode;
  quoteResults: Map<string, LogisticsEstimateResult>;
  correctingId?: string | null;
  focusTarget: LogisticsFocusTarget | null;
  onCorrect: (itemId: string, type: LogisticsTypeCode) => void;
  onAcceptAi: (variant: VariantLogisticsDecision, productId: string) => void;
  onFetchQuote: (variant: VariantLogisticsDecision) => void;
  onClearFocus: () => void;
  accepting?: boolean;
  quotingVariantId?: string | null;
  pricing?: PricingTemplate | null;
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
            ? "暂无可报价或已确认规格"
            : "暂无已关联商品"}
        {filterMode !== "all" ? (
          <p className="mt-2 text-xs text-ink-muted">
            切换到「全部」可查看完整列表。
          </p>
        ) : null}
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
            quotingVariantId={quotingVariantId}
            onCorrect={onCorrect}
            onAcceptAi={(v) => onAcceptAi(v, p.thirdPlatformItemId)}
            onFetchQuote={onFetchQuote}
            pricing={pricing}
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
