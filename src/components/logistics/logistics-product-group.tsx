"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
} from "@/lib/ui/icons";
import type { LogisticsEstimateResult } from "@/lib/api";
import {
  buildTypeOptions,
  collectQuoteLines,
  formatLineFeeOnly,
  formatMeasureFields,
  formatPostalLimitBadge,
  formatTransitLabel,
  computeOvertimeCompensationDays,
  isVariantException,
  logisticsLineKey,
  productQuoteActionLabel,
  collectProductQuotableVariantIds,
  resolveSelectedLogisticsLine,
  shouldShowManualAcceptAction,
  variantCardTone,
  type LogisticsTranslate,
} from "@/lib/logistics/display";
import { skuAlignProductHref } from "@/lib/sku-align/deep-link";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import {
  computeProductShellMeta,
  computeSkuRowStatus,
  formatVariantIssueHint,
  productShellStatusClass,
  productShellStatusLabel,
  skuRowStatusLabel,
  type ProductShellMeta,
} from "@/lib/logistics/product-shell";
import { Button } from "@/components/ui/button";
import { CatalogIngestingBadge } from "@/components/ui/catalog-ingesting-badge";
import { Select } from "@/components/ui/select";
import { useT } from "@/i18n/LocaleProvider";
import { useCatalogIngestStatus } from "@/hooks/use-catalog-ingest-status";
import { isProductQuoteIngesting } from "@/lib/tangbuy/catalog-ingest-display";
import { cn } from "@/lib/utils";
import type {
  LogisticsTemplate,
  LogisticsTypeCode,
  PricingTemplate,
  ProductLogisticsProfile,
  VariantLogisticsDecision,
} from "@/lib/types";
import type { MeasureOverride } from "@/lib/logistics/product-shell";

/** Shared column template — header and body must use the same tracks. */
function skuRowGridClass(showOps: boolean): string {
  return showOps
    ? "grid-cols-[minmax(10rem,30%)_minmax(0,1fr)_5.75rem_7rem]"
    : "grid-cols-[minmax(10rem,30%)_minmax(0,1fr)_5.75rem]";
}

function ProductThumb({
  src,
  alt,
  size = 48,
  noImageLabel,
}: {
  src?: string | null;
  alt: string;
  size?: number;
  noImageLabel: string;
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
      {noImageLabel}
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
  productLevelSkuAlign = false,
  selectedLineKey,
  onSelectLine,
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
  productLevelSkuAlign?: boolean;
  selectedLineKey?: string | null;
  onSelectLine?: (lineKey: string) => void;
}) {
  const t = useT();
  const typeOptions = useMemo(() => buildTypeOptions(t), [t]);

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
  const measures = formatMeasureFields(t, mergedDecision, tone);
  const lines = collectQuoteLines(mergedDecision, quoteResult);
  const selectedLine = resolveSelectedLogisticsLine(lines, selectedLineKey);
  const routeFee = formatLineFeeOnly(selectedLine, pricing);
  const transitLabel = formatTransitLabel(t, selectedLine);
  const overtimeDays = computeOvertimeCompensationDays(selectedLine);
  const exception = isVariantException(mergedDecision);
  const rowStatus = computeSkuRowStatus(mergedDecision, quoteResult, {
    processing: Boolean(
      pipelineProcessing &&
        !mergedDecision.decisionConfirmed &&
        mergedDecision.decisionStatus !== "confirmed"
    ),
  });
  const issueHint = formatVariantIssueHint(t, mergedDecision, quoteResult);

  const showAccept = shouldShowManualAcceptAction(mergedDecision, {
    pipelineActive,
    quoteResult,
  });
  const needsMeasure =
    exception &&
    (mergedDecision.decisionReason?.includes("重量") ||
      mergedDecision.decisionReason?.includes("尺寸") ||
      !mergedDecision.estimatedWeightG);

  let primaryAction: ReactNode = null;
  if (mergedDecision.decisionStatus === "pending_sku" && !productLevelSkuAlign) {
    primaryAction = (
      <Link href={skuAlignProductHref(profile.thirdPlatformItemId)}>
        <Button size="sm" className="h-7 text-[11px]">
          {t("logisticsProduct.goSkuAlign")}
        </Button>
      </Link>
    );
  } else if (needsMeasure && !editingMeasures) {
    primaryAction = (
      <Button size="sm" className="h-7 text-[11px]" onClick={onToggleEdit}>
        {t("logisticsProduct.addDimensions")}
      </Button>
    );
  } else if (showAccept) {
    primaryAction = (
      <Button
        size="sm"
        className="h-7 min-w-[4rem]"
        onClick={onAcceptAi}
        disabled={busy || accepting || quotingThis}
      >
        {accepting ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="mr-1 h-3.5 w-3.5" />
        )}
        {t("logisticsProduct.confirm")}
      </Button>
    );
  } else if (rowStatus === "pending_review" && exception && !hideQuoteActions) {
    primaryAction = (
      <Button size="sm" className="h-7 text-[11px]" onClick={onToggleEdit}>
        {t("logisticsProduct.addInfo")}
      </Button>
    );
  }

  return (
    <div
      data-logistics-variant={variant.thirdPlatformSkuId}
      data-logistics-status={variant.decisionStatus}
      className={cn(
        "border-t border-hairline/80 px-4 py-3 first:border-t-0",
        rowStatus === "failed" && "bg-red-50/30",
        rowStatus === "ingesting" && "bg-sky-50/25",
        rowStatus === "pending_review" && "bg-amber-50/20"
      )}
    >
      <div
        className={cn(
          "grid items-center gap-x-4",
          skuRowGridClass(!hideQuoteActions)
        )}
      >
        <div className="min-w-0 self-start py-0.5">
          <p className="line-clamp-2 text-xs font-medium leading-snug text-ink">
            {variant.optionLabel || variant.thirdPlatformSkuId}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                rowStatus === "confirmed" && "bg-emerald-50 text-emerald-800",
                rowStatus === "ready" && "bg-brand-soft text-brand-strong",
                rowStatus === "pending_review" && "bg-amber-100 text-amber-800",
                rowStatus === "pending_sku" && "bg-surface-muted text-ink-subtle",
                rowStatus === "failed" && "bg-red-50 text-red-700",
                rowStatus === "ingesting" && "bg-sky-50 text-sky-800",
                rowStatus === "processing" && "bg-sky-50 text-sky-800"
              )}
            >
              {skuRowStatusLabel(t, rowStatus)}
            </span>
            {rowStatus === "confirmed" ? (
              <span
                className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                title={t("logisticsUi.fulfillmentSavedDetail")}
              >
                {t("logisticsProduct.stagedLocally")}
              </span>
            ) : null}
            {(() => {
              const postal = formatPostalLimitBadge(t, mergedDecision);
              return (
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                    postal.className
                  )}
                  title={postal.title}
                >
                  {postal.label}
                </span>
              );
            })()}
          </div>
        </div>

        <div className="ml-auto w-full max-w-[15rem] min-w-0 justify-self-end self-start py-0.5">
          {selectedLine ? (
            <>
              {lines.length > 1 && onSelectLine ? (
                <Select
                  value={logisticsLineKey(selectedLine)}
                  onChange={(e) => onSelectLine(e.target.value)}
                  disabled={busy || accepting}
                  className="h-7 w-full px-2 !text-[10px] leading-tight font-normal"
                  title={t("logisticsProduct.selectRoute")}
                >
                  {lines.map((line) => {
                    const key = logisticsLineKey(line);
                    const fee = formatLineFeeOnly(line, pricing);
                    return (
                      <option key={key} value={key}>
                        {line.lineName}
                        {fee ? ` · ${fee}` : ""}
                      </option>
                    );
                  })}
                </Select>
              ) : (
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right">
                  <span className="min-w-0 text-[10px] font-medium leading-snug text-ink">
                    {selectedLine.lineName}
                  </span>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200">
                    {t("logisticsProduct.overtimeTitle")}
                  </span>
                </div>
              )}
              <p className="mt-1 text-right text-[10px] leading-snug text-slate-600">
                {[
                  overtimeDays != null
                    ? t("logisticsProduct.overtimeComp", { days: overtimeDays })
                    : null,
                  transitLabel
                    ? t("logisticsProduct.transitTitle", { label: transitLabel })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </>
          ) : issueHint ? (
            <span className="text-[11px] leading-snug text-amber-900">{issueHint}</span>
          ) : (
            <span className="text-[11px] leading-snug text-ink-muted">
              {measures.weight} · {measures.dimensions}
            </span>
          )}
        </div>

        <div className="text-right tabular-nums">
          {routeFee ? (
            <span className="text-sm font-semibold text-brand-strong">{routeFee}</span>
          ) : (
            <span className="text-[11px] text-ink-muted">—</span>
          )}
        </div>

        {!hideQuoteActions ? (
          <div className="flex justify-end">
            {primaryAction ?? (
              <span className="text-[11px] text-ink-subtle">—</span>
            )}
          </div>
        ) : null}
      </div>

      {exception && !editingMeasures ? (
        <div className="mt-2">
          <Select
            value={profile.dominantLogisticsType || "GENERAL"}
            disabled={busy}
            onChange={(e) => onCorrect(e.target.value as LogisticsTypeCode)}
            className="h-7 w-36 text-[11px]"
          >
            {typeOptions.map((o) => (
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
  selectedLineByVariant,
  onSelectLine,
  shopName = "",
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
  shopName?: string;
  selectedLineByVariant?: Map<string, string>;
  onSelectLine?: (variantId: string, lineKey: string) => void;
  renderMeasureEditPanel: (
    variant: VariantLogisticsDecision,
    override: MeasureOverride | undefined,
    onSave: (next: MeasureOverride) => void,
    onCancel: () => void
  ) => ReactNode;
}) {
  const t = useT();
  const variants = profile.variantDecisions ?? [];
  const identityIngesting = useCatalogIngestStatus(
    shopName,
    profile.thirdPlatformItemId,
    null,
    {
      poll: true,
      titleHint: profile.title,
    }
  );
  const quoteIngesting = useMemo(
    () => isProductQuoteIngesting(variants, quoteResults),
    [variants, quoteResults]
  );
  const catalogIngesting = identityIngesting || quoteIngesting;
  const busy = correctingId === profile.thirdPlatformItemId;
  const productQuoteLabel = useMemo(
    () => productQuoteActionLabel(t, variants, quoteResults, pipelineActive),
    [t, variants, quoteResults, pipelineActive]
  );
  const quotableSkuCount = useMemo(
    () =>
      collectProductQuotableVariantIds(variants, quoteResults, pipelineActive)
        .length,
    [variants, quoteResults, pipelineActive]
  );
  const skuUnlinkedCount = useMemo(
    () => variants.filter((v) => v.decisionStatus === "pending_sku").length,
    [variants]
  );
  const needsSkuAlign = skuUnlinkedCount > 0;
  const allSkuUnlinked =
    variants.length > 0 && skuUnlinkedCount === variants.length;
  const showOpsColumn = useMemo(() => {
    if (allSkuUnlinked) return false;
    return variants.some((variant) => {
      const quote = quoteResults.get(variant.thirdPlatformSkuId);
      if (variant.decisionStatus === "pending_sku") return false;
      if (variant.decisionConfirmed || variant.decisionStatus === "confirmed") {
        return false;
      }
      const exception = isVariantException(variant);
      const needsMeasure =
        exception &&
        (variant.decisionReason?.includes("重量") ||
          variant.decisionReason?.includes("尺寸") ||
          !variant.estimatedWeightG);
      if (needsMeasure) return true;
      if (shouldShowManualAcceptAction(variant, { pipelineActive, quoteResult: quote })) {
        return true;
      }
      if (exception) return true;
      return false;
    });
  }, [allSkuUnlinked, variants, quoteResults, pipelineActive]);

  return (
    <article
      data-logistics-product={profile.thirdPlatformItemId}
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border bg-surface shadow-card transition-shadow",
        meta.status === "failed" && "border-red-200",
        meta.status === "issues" && "border-amber-200",
        meta.status === "unidentified" && "border-hairline",
        meta.status === "ready" && "border-brand/25",
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
            alt={profile.title ?? t("logisticsProduct.productAlt")}
            noImageLabel={t("logisticsProduct.noImage")}
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-medium text-ink">
              {profile.title || profile.thirdPlatformItemId}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  productShellStatusClass(meta.status)
                )}
              >
                {productShellStatusLabel(t, meta.status)}
              </span>
              {catalogIngesting ? <CatalogIngestingBadge /> : null}
              {pipelineHighlighted || quotingProduct ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#325BE6]" />
              ) : null}
              <span className="text-[11px] text-ink-subtle">
                {t("logisticsProduct.skuCount", { count: meta.skuTotal })}
                {meta.summaryLine ? ` · ${meta.summaryLine}` : ""}
              </span>
            </div>
            {!expanded && meta.issueLine ? (
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-amber-900">
                {meta.issueLine}
              </p>
            ) : null}
          </div>
        </button>
        {needsSkuAlign ? (
          <Link
            href={skuAlignProductHref(profile.thirdPlatformItemId)}
            onClick={(e) => e.stopPropagation()}
          >
            <Button size="sm" className="h-7 shrink-0">
              {t("logisticsProduct.goSkuAlign")}
            </Button>
          </Link>
        ) : productQuoteLabel ? (
          <Button
            size="sm"
            variant={meta.status === "failed" ? "primary" : "secondary"}
            className="h-7 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onFetchProductQuotes();
            }}
            disabled={busy || quotingProduct || pipelineHighlighted}
            title={
              meta.status === "failed"
                ? t("logisticsProduct.retryQuoteTitle", { count: quotableSkuCount })
                : t("logisticsProduct.estimateQuoteTitle", { count: quotableSkuCount })
            }
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
          aria-label={expanded ? t("logisticsProduct.collapseSku") : t("logisticsProduct.expandSku")}
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
            className={cn(
              "grid gap-x-4 border-b border-hairline/80 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted",
              skuRowGridClass(showOpsColumn)
            )}
            aria-hidden
          >
            <span>{t("logisticsProduct.colSpec")}</span>
            <span className="justify-self-end text-right">{t("logisticsProduct.colRoute")}</span>
            <span className="text-right">{t("logisticsProduct.colFee")}</span>
            {showOpsColumn ? <span className="text-right">{t("logisticsProduct.colOps")}</span> : null}
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
                productLevelSkuAlign={needsSkuAlign}
                hideQuoteActions={!showOpsColumn}
                selectedLineKey={selectedLineByVariant?.get(variantId)}
                onSelectLine={
                  onSelectLine
                    ? (lineKey) => onSelectLine(variantId, lineKey)
                    : undefined
                }
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
  t: LogisticsTranslate,
  profile: ProductLogisticsProfile,
  quoteResults: Map<string, LogisticsEstimateResult>,
  pricing: PricingTemplate | null | undefined,
  pipeline?: LogisticsPipelineProgress | null,
  pipelineActive?: boolean
) {
  return computeProductShellMeta(
    t,
    profile,
    quoteResults,
    pricing,
    pipeline,
    pipelineActive
  );
}
