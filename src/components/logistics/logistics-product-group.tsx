"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { LogisticsEstimateResult } from "@/lib/api";
import {
  collectQuoteLines,
  formatLineFeeOnly,
  formatMeasureFields,
  formatProfitColumn,
  formatTransitLabel,
  computeOvertimeCompensationDays,
  isVariantException,
  productQuoteActionLabel,
  collectProductQuotableVariantIds,
  shouldShowManualAcceptAction,
  TYPE_OPTIONS,
  variantCardTone,
} from "@/lib/logistics/display";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import {
  computeProductShellMeta,
  computeSkuRowStatus,
  formatVariantIssueHint,
  PRODUCT_SHELL_STATUS_LABELS,
  productShellStatusClass,
  SKU_ROW_STATUS_LABELS,
  type ProductShellMeta,
} from "@/lib/logistics/product-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  LogisticsTemplate,
  LogisticsTypeCode,
  PricingTemplate,
  ProductLogisticsProfile,
  VariantLogisticsDecision,
} from "@/lib/types";
import type { MeasureOverride } from "@/lib/logistics/product-shell";

function ProductThumb({
  src,
  alt,
  size = 48,
}: {
  src?: string | null;
  alt: string;
  size?: number;
}) {
  if (src?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="shrink-0 rounded-lg border border-hairline object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-muted text-[10px] text-ink-subtle"
      style={{ width: size, height: size }}
    >
      无图
    </div>
  );
}

function FulfillmentSkuRow({
  profile,
  variant,
  quoteResult,
  activeTemplate,
  pricing,
  editingMeasures,
  busy,
  accepting,
  quotingThis,
  pipelineActive,
  pipelineProcessing,
  measureOverride,
  onToggleEdit,
  onSaveMeasures,
  onAcceptAi,
  onCorrect,
  measureEditPanel,
  hideQuoteActions = false,
}: {
  profile: ProductLogisticsProfile;
  variant: VariantLogisticsDecision;
  quoteResult?: LogisticsEstimateResult;
  activeTemplate: LogisticsTemplate | null;
  pricing?: PricingTemplate | null;
  editingMeasures: boolean;
  busy: boolean;
  accepting?: boolean;
  quotingThis?: boolean;
  pipelineActive?: boolean;
  pipelineProcessing?: boolean;
  measureOverride?: MeasureOverride;
  onToggleEdit: () => void;
  onSaveMeasures: (next: MeasureOverride) => void;
  onAcceptAi: () => void;
  onCorrect: (type: LogisticsTypeCode) => void;
  measureEditPanel: ReactNode;
  hideQuoteActions?: boolean;
}) {
  const mergedDecision = useMemo(() => {
    if (!measureOverride) return variant;
    return {
      ...variant,
      estimatedWeightG: measureOverride.weightG ?? variant.estimatedWeightG,
      estimatedLengthCm: measureOverride.lengthCm ?? variant.estimatedLengthCm,
      estimatedWidthCm: measureOverride.widthCm ?? variant.estimatedWidthCm,
      estimatedHeightCm: measureOverride.heightCm ?? variant.estimatedHeightCm,
    };
  }, [variant, measureOverride]);

  const tone = variantCardTone(mergedDecision);
  const measures = formatMeasureFields(mergedDecision, tone);
  const lines = collectQuoteLines(mergedDecision, quoteResult);
  const recommended = lines[0];
  const profit = formatProfitColumn(recommended, mergedDecision, pricing);
  const routeFee = formatLineFeeOnly(recommended, pricing);
  const transitLabel = formatTransitLabel(recommended);
  const overtimeDays = computeOvertimeCompensationDays(recommended);
  const exception = isVariantException(mergedDecision);
  const rowStatus = computeSkuRowStatus(mergedDecision, quoteResult, {
    processing: Boolean(
      pipelineProcessing &&
        !mergedDecision.decisionConfirmed &&
        mergedDecision.decisionStatus !== "confirmed"
    ),
  });
  const issueHint = formatVariantIssueHint(mergedDecision, quoteResult);

  const showAccept = shouldShowManualAcceptAction(mergedDecision, { pipelineActive });
  const needsMeasure =
    exception &&
    (mergedDecision.decisionReason?.includes("重量") ||
      mergedDecision.decisionReason?.includes("尺寸") ||
      !mergedDecision.estimatedWeightG);

  let primaryAction: ReactNode = null;
  if (mergedDecision.decisionStatus === "pending_sku") {
    primaryAction = (
      <Link href="/sku-align">
        <Button size="sm" className="h-7 text-[11px]">
          去 SKU 对齐
        </Button>
      </Link>
    );
  } else if (needsMeasure && !editingMeasures) {
    primaryAction = (
      <Button size="sm" className="h-7 text-[11px]" onClick={onToggleEdit}>
        补充尺寸
      </Button>
    );
  } else if (showAccept) {
    primaryAction = (
      <Button
        size="sm"
        className="h-7 min-w-[4.5rem] text-[11px]"
        onClick={onAcceptAi}
        disabled={busy || accepting || quotingThis}
      >
        {accepting ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="mr-1 h-3.5 w-3.5" />
        )}
        确认方案
      </Button>
    );
  } else if (rowStatus === "pending_review" && exception && !hideQuoteActions) {
    primaryAction = (
      <Button size="sm" className="h-7 text-[11px]" onClick={onToggleEdit}>
        补充信息
      </Button>
    );
  }

  return (
    <div
      data-logistics-variant={variant.thirdPlatformSkuId}
      data-logistics-status={variant.decisionStatus}
      className={cn(
        "border-t border-hairline/80 px-3 py-2 first:border-t-0",
        rowStatus === "failed" && "bg-red-50/30",
        rowStatus === "pending_review" && "bg-amber-50/20"
      )}
    >
      <div className="grid grid-cols-[minmax(5.5rem,7.5rem)_minmax(0,1fr)_4.5rem_5.5rem] items-center gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-ink">
            {variant.optionLabel || variant.thirdPlatformSkuId}
          </p>
          <span className="mt-0.5 inline-flex rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-ink-subtle">
            {SKU_ROW_STATUS_LABELS[rowStatus]}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          {recommended ? (
            <>
              <span className="min-w-0 truncate text-[11px] text-ink">
                {recommended.lineName}
              </span>
              <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200">
                超时必赔
              </span>
              {overtimeDays != null ? (
                <span className="shrink-0 text-[10px] tabular-nums text-ink-subtle">
                  超时时效 {overtimeDays}天
                </span>
              ) : null}
              {transitLabel ? (
                <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">
                  {transitLabel}
                </span>
              ) : null}
              {profit.marginLabel && profit.marginLabel !== "毛利率 —" ? (
                <span className="hidden shrink-0 text-[10px] tabular-nums text-ink-subtle xl:inline">
                  {profit.marginLabel}
                </span>
              ) : null}
            </>
          ) : issueHint ? (
            <span className="truncate text-[10px] text-amber-900">{issueHint}</span>
          ) : (
            <span className="truncate text-[10px] text-ink-muted">
              {measures.weight} · {measures.dimensions}
            </span>
          )}
        </div>

        <div className="text-right">
          {routeFee ? (
            <span className="text-sm font-semibold tabular-nums text-brand-strong">
              {routeFee}
            </span>
          ) : (
            <span className="text-[10px] text-ink-muted">—</span>
          )}
        </div>

        <div className="flex justify-end">{primaryAction}</div>
      </div>

      {exception && !editingMeasures ? (
        <div className="mt-2">
          <Select
            value={profile.dominantLogisticsType || "GENERAL"}
            disabled={busy}
            onChange={(e) => onCorrect(e.target.value as LogisticsTypeCode)}
            className="h-7 w-36 text-[11px]"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {editingMeasures ? measureEditPanel : null}
    </div>
  );
}

export function LogisticsProductGroup({
  profile,
  quoteResults,
  activeTemplate,
  pricing,
  meta,
  expanded,
  pipelineHighlighted,
  correctingId,
  accepting,
  pipelineActive,
  measureOverrides,
  editingVariantId,
  onToggleExpanded,
  onToggleEdit,
  onSaveMeasures,
  onAcceptAi,
  onFetchProductQuotes,
  onCorrect,
  onMeasureOverride,
  renderMeasureEditPanel,
  quotingProduct = false,
}: {
  profile: ProductLogisticsProfile;
  quoteResults: Map<string, LogisticsEstimateResult>;
  activeTemplate: LogisticsTemplate | null;
  pricing?: PricingTemplate | null;
  meta: ProductShellMeta;
  expanded: boolean;
  pipelineHighlighted: boolean;
  correctingId?: string | null;
  accepting?: boolean;
  pipelineActive?: boolean;
  measureOverrides: Map<string, MeasureOverride>;
  editingVariantId: string | null;
  onToggleExpanded: () => void;
  onToggleEdit: (variantId: string) => void;
  onSaveMeasures: (variantId: string, next: MeasureOverride) => void;
  onAcceptAi: (variant: VariantLogisticsDecision) => void;
  onFetchProductQuotes: () => void;
  onCorrect: (type: LogisticsTypeCode) => void;
  onMeasureOverride?: (variantId: string, next: MeasureOverride) => void;
  quotingProduct?: boolean;
  renderMeasureEditPanel: (
    variant: VariantLogisticsDecision,
    override: MeasureOverride | undefined,
    onSave: (next: MeasureOverride) => void,
    onCancel: () => void
  ) => ReactNode;
}) {
  const variants = profile.variantDecisions ?? [];
  const busy = correctingId === profile.thirdPlatformItemId;
  const productQuoteLabel = useMemo(
    () => productQuoteActionLabel(variants, quoteResults, pipelineActive),
    [variants, quoteResults, pipelineActive]
  );
  const quotableSkuCount = useMemo(
    () =>
      collectProductQuotableVariantIds(variants, quoteResults, pipelineActive)
        .length,
    [variants, quoteResults, pipelineActive]
  );

  return (
    <article
      data-logistics-product={profile.thirdPlatformItemId}
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border bg-surface shadow-card transition-shadow",
        meta.status === "failed" && "border-red-200",
        meta.status === "issues" && "border-amber-200",
        meta.status === "done" && "border-hairline",
        meta.status === "quoted" && "border-brand/25",
        pipelineHighlighted && "ring-2 ring-sky-400/70"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left hover:bg-surface-muted/30"
        >
          <ProductThumb
            src={profile.primaryImageUrl}
            alt={profile.title ?? "商品"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="line-clamp-1 text-sm font-medium text-ink">
                {profile.title || profile.thirdPlatformItemId}
              </p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  productShellStatusClass(meta.status)
                )}
              >
                {PRODUCT_SHELL_STATUS_LABELS[meta.status]}
              </span>
              {pipelineHighlighted || quotingProduct ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-600" />
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-ink-subtle">
              {meta.skuTotal} 个 SKU · {meta.summaryLine}
            </p>
            {!expanded && meta.issueLine ? (
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-amber-900">
                {meta.issueLine}
              </p>
            ) : null}
          </div>
        </button>
        {productQuoteLabel ? (
          <Button
            size="sm"
            variant={meta.status === "failed" ? "primary" : "secondary"}
            className="h-8 shrink-0 text-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              onFetchProductQuotes();
            }}
            disabled={busy || quotingProduct || pipelineHighlighted}
            title={`对本商品 ${quotableSkuCount} 个可处理 SKU 批量拉取/重试`}
          >
            {quotingProduct ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            {productQuoteLabel}
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onToggleExpanded}
          className="shrink-0 rounded-md p-1 text-ink-subtle hover:bg-surface-muted/40"
          aria-label={expanded ? "收起 SKU" : "展开 SKU"}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-hairline bg-surface-muted/10">
          {meta.issueLine ? (
            <p className="border-b border-amber-100 bg-amber-50/60 px-3 py-1.5 text-[10px] leading-snug text-amber-900">
              {meta.issueLine}
            </p>
          ) : null}
          <div
            className="grid grid-cols-[minmax(5.5rem,7.5rem)_minmax(0,1fr)_4.5rem_5.5rem] gap-x-4 border-b border-hairline/80 px-3 py-1.5 text-[10px] text-ink-subtle"
            aria-hidden
          >
            <span>规格</span>
            <span>线路 · 时效</span>
            <span className="text-right">运费</span>
            <span />
          </div>
          {variants.map((variant) => {
            const variantId = variant.thirdPlatformSkuId;
            return (
              <FulfillmentSkuRow
                key={variantId}
                profile={profile}
                variant={variant}
                quoteResult={quoteResults.get(variantId)}
                activeTemplate={activeTemplate}
                pricing={pricing}
                editingMeasures={editingVariantId === variantId}
                busy={busy}
                accepting={accepting}
                quotingThis={quotingProduct}
                pipelineActive={pipelineActive}
                pipelineProcessing={pipelineHighlighted || quotingProduct}
                measureOverride={measureOverrides.get(variantId)}
                onToggleEdit={() => onToggleEdit(variantId)}
                onSaveMeasures={(next) => onSaveMeasures(variantId, next)}
                onAcceptAi={() => onAcceptAi(variant)}
                onCorrect={onCorrect}
                hideQuoteActions
                measureEditPanel={renderMeasureEditPanel(
                  variant,
                  measureOverrides.get(variantId),
                  (next) => {
                    onMeasureOverride?.(variantId, next);
                    onSaveMeasures(variantId, next);
                    onToggleEdit(variantId);
                    onFetchProductQuotes();
                  },
                  () => onToggleEdit(variantId)
                )}
              />
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

export function buildProductShellMeta(
  profile: ProductLogisticsProfile,
  quoteResults: Map<string, LogisticsEstimateResult>,
  pricing: PricingTemplate | null | undefined,
  pipeline?: LogisticsPipelineProgress | null,
  pipelineActive?: boolean
) {
  return computeProductShellMeta(
    profile,
    quoteResults,
    pricing,
    pipeline,
    pipelineActive
  );
}
