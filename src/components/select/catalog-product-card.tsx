"use client";

import { ThumbImage } from "@/components/ui/thumb-image";
import { useMemo, useState } from "react";
import { Loader2 } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";
import { isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";
import type { SourcingSource } from "@/lib/sourcing/types";
import { selectableCardClassName } from "@/lib/ui/selectable-card-styles";
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

export interface CatalogProductCardProps {
  item: CatalogRecommendation;
  /** Purchase price converted to target currency (usually USD). */
  purchasePriceUsd?: number | null;
  sourcingSource?: SourcingSource;
  listIndex?: number;
  /** 1688 offer detail link — not shown as Tangbuy. */
  sourceDetailUrl?: string | null;
  targetCurrency: string;
  state?: PublishCellState;
  onPublish: () => void;
  onLink: () => void;
}

export function CatalogProductCard({
  item,
  purchasePriceUsd,
  sourcingSource,
  listIndex,
  sourceDetailUrl,
  targetCurrency,
  state,
  onPublish,
  onLink,
}: CatalogProductCardProps) {
  const t = useT();
  const publishBadge = useMemo(
    (): Record<
      PublishStatus,
      { variant: "warning" | "success" | "danger" | "default"; label: string }
    > => ({
      PENDING: { variant: "default", label: t("catalogCard.pending") },
      PUBLISHING: { variant: "warning", label: t("catalogCard.publishing") },
      PUBLISHED: { variant: "success", label: t("catalogCard.published") },
      FAILED: { variant: "danger", label: t("catalogCard.failed") },
    }),
    [t]
  );
  const result = state?.result;
  const published = result?.publishStatus === "PUBLISHED";
  const publishing = state?.loading || result?.publishStatus === "PUBLISHING";
  const [imgError, setImgError] = useState(false);

  return (
    <article
      className={selectableCardClassName({
        interactive: true,
        className: "flex flex-col p-3",
      })}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-control)] border border-surface-border bg-muted">
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
            {item.imageUrl ? t("catalogCard.imageUnavailable") : t("syncUi.noImage")}
          </div>
        )}
        {result ? (
          <div className="absolute left-2 top-2">
            <Badge variant={publishBadge[result.publishStatus].variant}>
              {publishBadge[result.publishStatus].label}
            </Badge>
          </div>
        ) : state?.error ? (
          <div className="absolute left-2 top-2">
            <Badge variant="danger">{t("catalogCard.failed")}</Badge>
          </div>
        ) : null}
        {sourcingSource ? (
          <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
            {listIndex != null ? (
              <Badge variant="default" className="text-[10px]">
                #{listIndex}
              </Badge>
            ) : null}
            <Badge
              variant={sourcingSource === "1688" ? "warning" : "success"}
              className="text-[10px]"
            >
              {sourcingSource === "1688"
                ? t("catalogCard.source1688")
                : t("catalogCard.sourceTangbuy")}
            </Badge>
          </div>
        ) : null}
      </div>

      <h3 className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-xs font-semibold leading-5 text-ink">
        {(() => {
          const href =
            sourcingSource === "1688"
              ? sourceDetailUrl?.trim() || null
              : item.tangbuyUrl?.trim() || null;
          if (!href) return item.title;
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink hover:text-link hover:underline"
              title={
                sourcingSource === "1688"
                  ? t("catalogCard.openOn1688")
                  : t("catalogCard.openOnTangbuy")
              }
            >
              {item.title}
            </a>
          );
        })()}
      </h3>

      <div className="mt-1.5">
        <p className="text-sm font-semibold text-brand-strong">
          {t("catalogCard.suggestedPrice", {
            price: money(item.estimatedSalePrice, item.targetCurrency ?? targetCurrency),
          })}
        </p>
        {sourcingSource ? (
          <p className="mt-0.5 text-[10px] text-ink-subtle">
            {sourcingSource === "1688"
              ? t("catalogCard.displayPriceNote1688")
              : t("catalogCard.displayPriceNoteTangbuy")}
          </p>
        ) : null}
        <p className="mt-0.5 text-xs font-medium text-ink">
          {t("catalogCard.purchaseCost", {
            price: money(purchasePriceUsd, targetCurrency),
          })}
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
            ? t("catalogCard.publishedBtn")
            : publishing
              ? t("catalogCard.publishingBtn")
              : state?.error
                ? t("catalogCard.retryPublish")
                : t("catalogCard.publishBtn")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="min-w-0 flex-1"
          disabled={publishing || !isMallGatewayConfigured()}
          title={
            !isMallGatewayConfigured()
              ? t("catalogCard.mallUnavailable")
              : t("catalogCard.linkToLiveTitle")
          }
          onClick={onLink}
        >
          {t("catalogCard.linkBtn")}
        </Button>
      </div>
        {published && result?.shopifyProductId ? (
          <p className="mt-1.5 break-all text-[10px] leading-tight text-ink-subtle">
            {result.shopifyProductId}
          </p>
        ) : null}
        {state?.error ? (
          <p className="mt-1.5 text-[10px] leading-tight text-destructive">{state.error}</p>
        ) : null}
    </article>
  );
}
