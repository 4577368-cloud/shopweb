"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api, type LogisticsEstimateResult } from "@/lib/api";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsTypeCode,
  ProductLogisticsProfile,
  QuoteStatus,
  VariantLogisticsDecision,
} from "@/lib/types";

const TYPE_OPTIONS: { value: LogisticsTypeCode; label: string }[] = [
  { value: "GENERAL", label: "普货" },
  { value: "APPAREL", label: "服装" },
  { value: "FOOD", label: "食品" },
  { value: "BATTERY_MAGNETIC", label: "带电 / 带磁" },
  { value: "BLADE", label: "刀具" },
  { value: "OTHER", label: "其他特殊品类" },
];

export function LogisticsTypeSummary({
  analysis,
  correctingId,
  onCorrect,
}: {
  analysis: LogisticsAnalysis;
  correctingId?: string | null;
  onCorrect: (itemId: string, type: LogisticsTypeCode) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quoteResults, setQuoteResults] = useState<Map<string, LogisticsEstimateResult>>(new Map());
  const [quoting, setQuoting] = useState(false);
  const profiles = analysis.productProfiles ?? [];
  const displayProfiles = profiles.slice(0, 6);

  const readyCount = profiles.reduce((sum, p) => {
    return sum + (p.decisionStatusCounts?.ready_for_quote ?? 0);
  }, 0);

  const handleGetQuote = async () => {
    if (quoting || readyCount === 0) return;
    setQuoting(true);
    try {
      const variants: Array<{
        thirdPlatformSkuId: string;
        tangbuySkuId: string;
        tangbuyGoodsId: string;
        incrementList: string[];
        quantity: number;
      }> = [];

      for (const p of profiles) {
        for (const v of p.variantDecisions ?? []) {
          if (v.decisionStatus === "ready_for_quote" && v.tangbuySkuId && v.tangbuyGoodsId) {
            variants.push({
              thirdPlatformSkuId: v.thirdPlatformSkuId,
              tangbuySkuId: v.tangbuySkuId,
              tangbuyGoodsId: v.tangbuyGoodsId,
              incrementList: [],
              quantity: 1,
            });
          }
        }
      }

      const response = await api.estimateLogistics({
        shopName: analysis.shopName,
        countryId: "124487",
        countryCode: "US",
        shippingOption: 2,
        variants,
        needOtherLine: true,
        needMeasure: false,
      });

      const resultsMap = new Map<string, LogisticsEstimateResult>();
      for (const r of response.results) {
        resultsMap.set(r.thirdPlatformSkuId, r);
      }
      setQuoteResults(resultsMap);
    } catch (err) {
      console.error("报价失败:", err);
    } finally {
      setQuoting(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">物流分析</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {analysis.analyzedCount ?? 0} 个商品 · {analysis.totalVariants ?? 0} 个规格
          </p>
        </div>
        <Badge variant="outline">{readyCount} 可报价</Badge>
      </div>

      {profiles.length === 0 ? (
        <p className="mt-3 text-xs text-ink-subtle">
          暂无已关联商品可分析。请先完成选品关联或 SKU 对齐。
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(analysis.decisionStatusCounts ?? {}).map(
            ([status, count]) =>
              count > 0 ? (
                <span
                  key={status}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                    getStatusBadgeStyle(status as LogisticsDecisionStatus)
                  )}
                >
                  {getDecisionLabel(status as LogisticsDecisionStatus)}
                  <span className="tabular-nums opacity-80">{count}</span>
                </span>
              ) : null
          )}
        </div>
      )}

      {readyCount > 0 ? (
        <div className="mt-3">
          <Button
            size="sm"
            variant="primary"
            onClick={handleGetQuote}
            disabled={quoting}
            className="h-8 text-xs"
          >
            {quoting ? "获取中..." : `获取报价（${readyCount} 个）`}
          </Button>
        </div>
      ) : null}

      {displayProfiles.length > 0 ? (
        <div className="mt-4 space-y-2">
          {displayProfiles.map((p) => (
            <ProductRow
              key={p.thirdPlatformItemId}
              profile={p}
              busy={correctingId === p.thirdPlatformItemId}
              onCorrect={onCorrect}
              quoteResults={quoteResults}
              expanded={expandedId === p.thirdPlatformItemId}
              onToggle={() => toggleExpand(p.thirdPlatformItemId)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ProductRow({
  profile,
  busy,
  onCorrect,
  quoteResults,
  expanded,
  onToggle,
}: {
  profile: ProductLogisticsProfile;
  busy: boolean;
  onCorrect: (itemId: string, type: LogisticsTypeCode) => void;
  quoteResults: Map<string, LogisticsEstimateResult>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const variants = profile.variantDecisions ?? [];
  const hasQuote = variants.some((v) => quoteResults.has(v.thirdPlatformSkuId));

  return (
    <div className="rounded-[var(--radius-control)] border border-hairline bg-surface-muted/40 overflow-hidden">
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-surface-muted/60"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="text-[10px] text-ink-subtle w-3 text-center">
            {expanded ? "▾" : "▸"}
          </span>
          <p className="truncate text-xs font-medium text-ink">
            {profile.title || profile.thirdPlatformItemId}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-ink-subtle">
            {profile.totalVariants ?? 0} 规格
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              getDominantStatusBadge(profile)
            )}
          >
            {profile.dominantLogisticsTypeLabel || "未知"}
          </span>
        </div>
      </div>

      {expanded ? (
        <div className="px-3 pb-3 space-y-1 border-t border-hairline/50">
          <div className="pt-2 flex items-center justify-between">
            <span className="text-[10px] text-ink-subtle">物流分类</span>
            <Select
              value={profile.dominantLogisticsType || "GENERAL"}
              disabled={busy}
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

          {variants.map((v) => (
            <VariantRow
              key={v.thirdPlatformSkuId}
              decision={v}
              quoteResult={quoteResults.get(v.thirdPlatformSkuId)}
              showDetails={hasQuote || v.decisionStatus !== "ready_for_quote"}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function VariantRow({
  decision,
  quoteResult,
  showDetails,
}: {
  decision: VariantLogisticsDecision;
  quoteResult?: LogisticsEstimateResult;
  showDetails: boolean;
}) {
  const primaryInfo = getPrimaryInfo(decision, quoteResult);

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 text-[11px] bg-surface/60">
      <span className="min-w-0 flex-1 truncate text-slate-600">
        {decision.optionLabel}
      </span>

      <span className="shrink-0 font-medium">
        {primaryInfo.label}
      </span>

      {primaryInfo.fee ? (
        <span className="shrink-0 text-emerald-600 font-medium">
          {primaryInfo.fee}
        </span>
      ) : null}

      {showDetails && (
        <span className="shrink-0 text-slate-400 text-[10px]">
          {decision.postalLimitLabel}
          {decision.estimatedWeightG ? ` · ${decision.estimatedWeightG}g` : ""}
          {quoteResult?.alternativeLines?.length ? ` · +${quoteResult.alternativeLines.length}备选` : ""}
        </span>
      )}
    </div>
  );
}

function getPrimaryInfo(
  decision: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): { label: string; fee?: string } {
  if (quoteResult) {
    switch (quoteResult.quoteStatus) {
      case "SUCCESS":
        return {
          label: quoteResult.recommendedLine?.lineName || "报价成功",
          fee: quoteResult.recommendedLine
            ? `${quoteResult.recommendedLine.currency}${quoteResult.recommendedLine.estimatedFee}`
            : undefined,
        };
      case "PENDING":
        return { label: "报价中" };
      case "FAILED":
        return { label: "报价失败" };
      default:
        break;
    }
  }

  switch (decision.decisionStatus) {
    case "pending_sku":
      return { label: "待对齐" };
    case "pending_postal_meta":
      return { label: "待补充" };
    case "ready_for_quote":
      return { label: "可报价" };
    case "restricted":
      return { label: "需确认" };
    case "needs_review":
      return { label: "需审核" };
    default:
      return { label: decision.decisionStatus };
  }
}

function getDominantStatusBadge(profile: ProductLogisticsProfile): string {
  const counts = profile.decisionStatusCounts;
  if (!counts) return "bg-slate-100 text-slate-600";

  if (counts.needs_review > 0) return "bg-yellow-50 text-yellow-700";
  if (counts.restricted > 0) return "bg-orange-50 text-orange-700";
  if (counts.pending_postal_meta > 0) return "bg-amber-50 text-amber-700";
  if (counts.pending_sku > 0) return "bg-red-50 text-red-700";
  if (counts.ready_for_quote > 0) return "bg-green-50 text-green-700";
  return "bg-slate-100 text-slate-600";
}

function getStatusBadgeStyle(status: LogisticsDecisionStatus): string {
  switch (status) {
    case "pending_sku":
      return "bg-red-50 text-red-700";
    case "pending_postal_meta":
      return "bg-amber-50 text-amber-700";
    case "ready_for_quote":
      return "bg-green-50 text-green-700";
    case "restricted":
      return "bg-orange-50 text-orange-700";
    case "needs_review":
      return "bg-yellow-50 text-yellow-700";
    default:
      return "bg-slate-50 text-slate-700";
  }
}

function getDecisionLabel(status: LogisticsDecisionStatus): string {
  switch (status) {
    case "pending_sku":
      return "待对齐";
    case "pending_postal_meta":
      return "待补充";
    case "ready_for_quote":
      return "可报价";
    case "restricted":
      return "需确认";
    case "needs_review":
      return "需审核";
    default:
      return status;
  }
}
