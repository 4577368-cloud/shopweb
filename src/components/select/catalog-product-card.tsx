"use client";

import { ThumbImage } from "@/components/ui/thumb-image";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";
import type { CatalogRecommendation, PublishResult, PublishStatus } from "@/lib/types";

export interface PublishCellState {
  loading: boolean;
  result?: PublishResult;
  error?: string;
}

function money(value?: number | null, currency?: string | null): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

const PUBLISH_BADGE: Record<
  PublishStatus,
  { variant: "warning" | "success" | "danger" | "default"; label: string }
> = {
  PENDING: { variant: "default", label: "待上架" },
  PUBLISHING: { variant: "warning", label: "上架进行中" },
  PUBLISHED: { variant: "success", label: "已上架" },
  FAILED: { variant: "danger", label: "上架失败" },
};

export interface CatalogProductCardProps {
  item: CatalogRecommendation;
  /** Purchase price converted to target currency (usually USD). */
  purchasePriceUsd?: number | null;
  targetCurrency: string;
  state?: PublishCellState;
  onPublish: () => void;
  onLink: () => void;
}

export function CatalogProductCard({
  item,
  purchasePriceUsd,
  targetCurrency,
  state,
  onPublish,
  onLink,
}: CatalogProductCardProps) {
  const result = state?.result;
  const published = result?.publishStatus === "PUBLISHED";
  const publishing = state?.loading || result?.publishStatus === "PUBLISHING";
  const [imgError, setImgError] = useState(false);

  return (
    <article className="flex flex-col rounded-[var(--radius-card)] border border-hairline bg-surface p-3 shadow-card">
      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted">
        {item.imageUrl && !imgError ? (
          <ThumbImage
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes="240px"
            pixelWidth={480}
            className="object-cover"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-subtle">
            {item.imageUrl ? "货源图暂不可用" : "无图"}
          </div>
        )}
        {result ? (
          <div className="absolute left-2 top-2">
            <Badge variant={PUBLISH_BADGE[result.publishStatus].variant}>
              {PUBLISH_BADGE[result.publishStatus].label}
            </Badge>
          </div>
        ) : state?.error ? (
          <div className="absolute left-2 top-2">
            <Badge variant="danger">上架失败</Badge>
          </div>
        ) : null}
      </div>

      <h3 className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-xs font-semibold leading-5 text-ink">
        {item.tangbuyUrl ? (
          <a
            href={item.tangbuyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink hover:text-brand-strong hover:underline"
            title="在 Tangbuy 打开货源"
          >
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </h3>

      <div className="mt-1.5">
        <p className="text-sm font-semibold text-brand-strong">
          建议售价 {money(item.estimatedSalePrice, item.targetCurrency ?? targetCurrency)}
        </p>
        <p className="mt-0.5 text-xs font-medium text-ink">
          采购成本 {money(purchasePriceUsd, targetCurrency)}
        </p>
      </div>

      <div className="mt-auto flex gap-2 pt-3">
        <Button
          size="sm"
          className="min-w-0 flex-1"
          onClick={onPublish}
          disabled={publishing || published}
          variant={published ? "secondary" : "primary"}
        >
          {state?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {published
            ? "已上架"
            : publishing
              ? "上架中…"
              : state?.error
                ? "重试上架"
                : "上架"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="min-w-0 flex-1"
          disabled={publishing || !isMallGatewayConfigured()}
          title={
            !isMallGatewayConfigured()
              ? "商城货源暂不可用"
              : "关联到已有在售商品"
          }
          onClick={onLink}
        >
          关联
        </Button>
      </div>
        {published && result?.shopifyProductId ? (
          <p className="mt-1.5 break-all text-[10px] leading-tight text-ink-subtle">
            {result.shopifyProductId}
          </p>
        ) : null}
        {state?.error ? (
          <p className="mt-1.5 text-[10px] leading-tight text-red-500">{state.error}</p>
        ) : null}
    </article>
  );
}
