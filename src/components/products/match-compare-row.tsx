"use client";

import { ThumbImage } from "@/components/ui/thumb-image";
import { useMemo } from "react";
import { ArrowRight } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatchStatusBadge } from "@/components/ui/status-badge";
import {
  HIGH_MATCH_THRESHOLD,
  MEDIUM_MATCH_THRESHOLD,
} from "@/data/mock";
import { isProductResolved } from "@/context/onboarding-context";
import { useT } from "@/i18n/LocaleProvider";
import type { MatchSource, ProductMatch, StockLevel } from "@/lib/types";
import { cn, formatPercent } from "@/lib/utils";

function tier(score: number): "high" | "medium" | "low" {
  if (score >= HIGH_MATCH_THRESHOLD) return "high";
  if (score >= MEDIUM_MATCH_THRESHOLD) return "medium";
  return "low";
}

function stockTone(level: StockLevel) {
  if (level === "in_stock") return "text-emerald-700";
  if (level === "low") return "text-amber-700";
  return "text-red-700";
}

interface MatchCompareRowProps {
  item: ProductMatch;
  focused?: boolean;
  onAction: (id: string, action: string) => void;
}

export function MatchCompareRow({
  item,
  focused,
  onAction,
}: MatchCompareRowProps) {
  const t = useT();
  const matchTier = tier(item.matchScore);
  const resolved =
    isProductResolved(item.status) && item.status !== "flagged";

  const sourceLabel = useMemo(
    (): Record<MatchSource, string> => ({
      image_search: t("matchCompare.sourceImageSearch"),
      title_match: t("matchCompare.sourceTitleMatch"),
      manual: t("matchCompare.sourceManual"),
    }),
    [t]
  );

  const stockText = (level: StockLevel, count?: number, label?: string) => {
    if (label) return label;
    if (level === "in_stock") {
      return count != null
        ? t("matchCompare.stockCount", { count })
        : t("matchCompare.stockInStock");
    }
    if (level === "low") {
      return count != null
        ? t("matchCompare.stockCount", { count })
        : t("matchCompare.stockLow");
    }
    return t("matchCompare.stockOut");
  };

  const statusConfig = useMemo(() => {
    if (item.status === "confirmed") {
      return {
        label: t("matchCompare.statusConfirmed"),
        bg: "bg-emerald-500",
        text: "text-white",
        border: "border-emerald-300",
        bgLight: "bg-emerald-50/30",
      };
    }
    if (item.status === "needs_review") {
      return {
        label: t("matchCompare.statusNeedsReview"),
        bg: "bg-amber-500",
        text: "text-white",
        border: "border-amber-300",
        bgLight: "bg-amber-50/30",
      };
    }
    if (item.status === "deferred") {
      return {
        label: t("matchCompare.statusDeferred"),
        bg: "bg-slate-400",
        text: "text-white",
        border: "border-slate-300",
        bgLight: "bg-slate-50/30",
      };
    }
    if (item.status === "rejected") {
      return {
        label: t("matchCompare.statusRejected"),
        bg: "bg-red-400",
        text: "text-white",
        border: "border-red-300",
        bgLight: "bg-red-50/30",
      };
    }
    if (item.status === "flagged") {
      return {
        label: t("matchCompare.statusFlagged"),
        bg: "bg-violet-500",
        text: "text-white",
        border: "border-violet-300",
        bgLight: "bg-violet-50/30",
      };
    }
    return {
      label: t("matchCompare.statusUnlinked"),
      bg: "bg-slate-400",
      text: "text-white",
      border: "border-slate-300",
      bgLight: "bg-slate-50/30",
    };
  }, [item.status, t]);

  return (
    <article
      id={`product-row-${item.id}`}
      data-focused={focused || undefined}
      className={cn(
        "relative rounded-lg border shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors",
        focused && "border-teal-300 ring-1 ring-teal-200",
        resolved && statusConfig.bgLight,
        statusConfig.border,
        !focused && !resolved && "border-slate-200 bg-white"
      )}
    >
      <div className={cn("absolute -top-2 -left-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", statusConfig.bg, statusConfig.text)}>
        {statusConfig.label}
      </div>
      <div className="grid grid-cols-[1fr_28px_1fr_148px_132px] items-stretch gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            <ThumbImage
              src={item.shopProduct.image}
              alt={item.shopProduct.title}
              fill
              sizes="64px"
              pixelWidth={128}
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {t("matchCompare.shopProduct")}
            </p>
            <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
              {item.shopProduct.title}
            </h3>
            <p className="mt-1 text-[11px] text-slate-400">
              SKU {item.shopProduct.sku}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-slate-900">
                {item.shopProduct.price}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  stockTone(item.shopProduct.stockLevel)
                )}
              >
                {stockText(
                  item.shopProduct.stockLevel,
                  item.shopProduct.stock
                )}
              </span>
              {item.shopProduct.variants > 1 ? (
                <span className="text-[11px] text-slate-500">
                  {item.shopProduct.variants} variants
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {item.specTags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center text-slate-300">
          <ArrowRight className="h-4 w-4" />
          <span className="mt-1 text-[10px] leading-none text-slate-400">
            {t("matchCompare.matchedTo")}
          </span>
        </div>

        <div className="flex min-w-0 gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            <ThumbImage
              src={item.sourceProduct.image}
              alt={item.sourceProduct.title}
              fill
              sizes="64px"
              pixelWidth={128}
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-teal-700/70">
              {t("matchCompare.tangbuyRecommend")}
            </p>
            <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
              {item.sourceProduct.title}
            </h3>
            <p className="mt-1 text-[11px] text-slate-400">
              SKU {item.sourceProduct.sku}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-slate-900">
                {item.sourceProduct.costUsdApprox ?? item.sourceProduct.price}
              </span>
              <span className="text-[11px] text-slate-500">
                {t("matchCompare.cost")} {item.sourceProduct.price}
              </span>
              <span className="text-[11px] text-slate-600">
                MOQ {item.sourceProduct.moq}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  stockTone(item.sourceProduct.stockLevel)
                )}
              >
                {item.sourceProduct.stockLabel}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {item.sourceProduct.warehouse ? (
                <Badge variant="teal">{item.sourceProduct.warehouse}</Badge>
              ) : null}
              <Badge variant="outline">{item.sourceProduct.supplier}</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-2 border-l border-slate-100 pl-3">
          <div>
            <p className="text-[11px] text-slate-400">{t("matchCompare.matchScore")}</p>
            <p
              className={cn(
                "mt-0.5 text-xl font-semibold tracking-tight tabular-nums",
                matchTier === "high" && "text-emerald-700",
                matchTier === "medium" && "text-slate-800",
                matchTier === "low" && "text-amber-700"
              )}
            >
              {formatPercent(item.matchScore)}
            </p>
          </div>
          <Badge variant="outline">{sourceLabel[item.source]}</Badge>
          <div>
            <p className="text-[11px] text-slate-400">{t("matchCompare.marginEstimate")}</p>
            <p className="text-xs font-medium text-slate-800">
              {item.marginEstimate}
            </p>
            <p className="mt-0.5 text-[10px] leading-tight text-slate-400">
              {item.priceGapLabel}
            </p>
          </div>
          <MatchStatusBadge status={item.status} />
        </div>

        <div className="flex flex-col justify-center gap-1.5 border-l border-slate-100 pl-3">
          {resolved ? (
            <p className="text-xs text-slate-400">
              {item.status === "confirmed"
                ? t("matchCompare.adopted")
                : item.status === "deferred"
                  ? t("matchCompare.deferred")
                  : t("matchCompare.rejected")}
            </p>
          ) : matchTier === "high" ? (
            <>
              <Button
                size="sm"
                className="w-full"
                onClick={() => onAction(item.id, "confirm")}
              >
                {t("matchCompare.adoptProduct")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => onAction(item.id, "view")}
              >
                {t("matchCompare.viewDetails")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                onClick={() => onAction(item.id, "swap")}
              >
                {t("matchCompare.swapCandidate")}
              </Button>
            </>
          ) : matchTier === "medium" ? (
            <>
              <Button
                size="sm"
                className="w-full"
                onClick={() => onAction(item.id, "view")}
              >
                {t("matchCompare.viewDetails")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => onAction(item.id, "swap")}
              >
                {t("matchCompare.swapCandidate")}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="w-full"
                onClick={() => onAction(item.id, "search")}
              >
                {t("matchCompare.viewCandidates")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => onAction(item.id, "defer")}
              >
                {t("matchCompare.defer")}
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
