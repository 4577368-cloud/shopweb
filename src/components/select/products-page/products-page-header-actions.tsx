"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Search, X } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";

export interface ProductsPageHeaderActionsProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  hasNewProductsToLink: boolean;
  newLinkableCount: number;
  onEnqueueNewArrivalsBatchLink: () => void;
  pageLinkableCount: number;
  onEnqueueUnboundMatch: () => void;
  batchLinkActive: boolean;
  skuAlignHref: string;
  onPrefetchSkuAlign?: () => void;
}

export function ProductsPageHeaderActions({
  searchQuery,
  onSearchQueryChange,
  hasNewProductsToLink,
  newLinkableCount,
  onEnqueueNewArrivalsBatchLink,
  pageLinkableCount,
  onEnqueueUnboundMatch,
  batchLinkActive,
  skuAlignHref,
  onPrefetchSkuAlign,
}: ProductsPageHeaderActionsProps) {
  const t = useT();
  const skuCtaPrimary = !hasNewProductsToLink && pageLinkableCount === 0;

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder={t("products.searchPlaceholder")}
          className="h-7 w-48 rounded-[var(--radius-control)] border border-hairline bg-surface pl-7 pr-8 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchQueryChange("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {hasNewProductsToLink ? (
        <Button
          size="sm"
          onClick={onEnqueueNewArrivalsBatchLink}
          disabled={batchLinkActive}
        >
          {batchLinkActive ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {batchLinkActive
            ? t("productsPage.batchLinkRunning")
            : t("productsPage.batchLinkNewArrivals", { count: newLinkableCount })}
        </Button>
      ) : pageLinkableCount > 0 ? (
        <Button size="sm" onClick={onEnqueueUnboundMatch} disabled={batchLinkActive}>
          {batchLinkActive ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {batchLinkActive
            ? t("productsPage.batchLinkRunning")
            : t("productsPage.batchLink")}
        </Button>
      ) : null}
      <Link
        href={skuAlignHref}
        onMouseEnter={onPrefetchSkuAlign}
        onFocus={onPrefetchSkuAlign}
      >
        <Button size="sm" variant={skuCtaPrimary ? "primary" : "secondary"}>
          {t("productsPage.skuBindingCta")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}
