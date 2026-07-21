"use client";

import Image from "next/image";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatchStatusBadge } from "@/components/ui/status-badge";
import {
  HIGH_MATCH_THRESHOLD,
  MEDIUM_MATCH_THRESHOLD,
} from "@/data/mock";
import { isProductResolved } from "@/context/onboarding-context";
import type { MatchSource, ProductMatch, StockLevel } from "@/lib/types";
import { cn, formatPercent } from "@/lib/utils";

const sourceLabel: Record<MatchSource, string> = {
  image_search: "图搜",
  title_match: "标题匹配",
  manual: "属性匹配",
};

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

function stockText(level: StockLevel, count?: number, label?: string) {
  if (label) return label;
  if (level === "in_stock") return count != null ? `库存 ${count}` : "现货充足";
  if (level === "low") return count != null ? `偏低 ${count}` : "库存偏低";
  return "缺货";
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
  const t = tier(item.matchScore);
  const resolved =
    isProductResolved(item.status) && item.status !== "flagged";

  const statusConfig = useMemo(() => {
    if (item.status === "confirmed") {
      return {
        label: "已确认",
        bg: "bg-emerald-500",
        text: "text-white",
        border: "border-emerald-300",
        bgLight: "bg-emerald-50/30",
      };
    }
    if (item.status === "needs_review") {
      return {
        label: "待确认",
        bg: "bg-amber-500",
        text: "text-white",
        border: "border-amber-300",
        bgLight: "bg-amber-50/30",
      };
    }
    if (item.status === "deferred") {
      return {
        label: "暂不处理",
        bg: "bg-slate-400",
        text: "text-white",
        border: "border-slate-300",
        bgLight: "bg-slate-50/30",
      };
    }
    if (item.status === "rejected") {
      return {
        label: "已排除",
        bg: "bg-red-400",
        text: "text-white",
        border: "border-red-300",
        bgLight: "bg-red-50/30",
      };
    }
    if (item.status === "flagged") {
      return {
        label: "已标记",
        bg: "bg-violet-500",
        text: "text-white",
        border: "border-violet-300",
        bgLight: "bg-violet-50/30",
      };
    }
    return {
      label: "未关联",
      bg: "bg-slate-400",
      text: "text-white",
      border: "border-slate-300",
      bgLight: "bg-slate-50/30",
    };
  }, [item.status]);

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
        {/* 左：店铺商品 */}
        <div className="flex min-w-0 gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            <Image
              src={item.shopProduct.image}
              alt={item.shopProduct.title}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              店铺商品
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

        {/* 中：映射关系 */}
        <div className="flex flex-col items-center justify-center text-slate-300">
          <ArrowRight className="h-4 w-4" />
          <span className="mt-1 text-[10px] leading-none text-slate-400">
            匹配到
          </span>
        </div>

        {/* 右：推荐货源 */}
        <div className="flex min-w-0 gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            <Image
              src={item.sourceProduct.image}
              alt={item.sourceProduct.title}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-teal-700/70">
              Tangbuy 推荐
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
                成本 {item.sourceProduct.price}
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

        {/* 决策指标 */}
        <div className="flex flex-col justify-center gap-2 border-l border-slate-100 pl-3">
          <div>
            <p className="text-[11px] text-slate-400">匹配度</p>
            <p
              className={cn(
                "mt-0.5 text-xl font-semibold tracking-tight tabular-nums",
                t === "high" && "text-emerald-700",
                t === "medium" && "text-slate-800",
                t === "low" && "text-amber-700"
              )}
            >
              {formatPercent(item.matchScore)}
            </p>
          </div>
          <Badge variant="outline">{sourceLabel[item.source]}</Badge>
          <div>
            <p className="text-[11px] text-slate-400">预估毛利</p>
            <p className="text-xs font-medium text-slate-800">
              {item.marginEstimate}
            </p>
            <p className="mt-0.5 text-[10px] leading-tight text-slate-400">
              {item.priceGapLabel}
            </p>
          </div>
          <MatchStatusBadge status={item.status} />
        </div>

        {/* 动作区 */}
        <div className="flex flex-col justify-center gap-1.5 border-l border-slate-100 pl-3">
          {resolved ? (
            <p className="text-xs text-slate-400">
              {item.status === "confirmed"
                ? "已采用此货源"
                : item.status === "deferred"
                  ? "已暂不处理"
                  : "已排除"}
            </p>
          ) : t === "high" ? (
            <>
              <Button
                size="sm"
                className="w-full"
                onClick={() => onAction(item.id, "confirm")}
              >
                采用此商品
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => onAction(item.id, "view")}
              >
                查看详情
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                onClick={() => onAction(item.id, "swap")}
              >
                更换候选
              </Button>
            </>
          ) : t === "medium" ? (
            <>
              <Button
                size="sm"
                className="w-full"
                onClick={() => onAction(item.id, "view")}
              >
                查看详情
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => onAction(item.id, "swap")}
              >
                更换候选
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="w-full"
                onClick={() => onAction(item.id, "search")}
              >
                查看候选
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                onClick={() => onAction(item.id, "defer")}
              >
                暂不处理
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
