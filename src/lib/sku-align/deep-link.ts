import type { SkuFilterMode } from "@/lib/sku-align/display";

export const SKU_ALIGN_FILTER_PARAM = "filter";
export const SKU_ALIGN_PRODUCT_PARAM = "product";
export const SKU_ALIGN_TAB_PARAM = "tab";
export const SKU_ALIGN_VARIANT_PARAM = "variant";

export type SkuAlignFilterParam = SkuFilterMode;

export type SkuAlignHrefOptions = {
  filter?: SkuAlignFilterParam;
  productId?: string;
};

export type SkuAlignProductHrefOptions = {
  tab?: import("@/lib/sku-align/drawer-helpers").DrawerPhase;
  variantId?: string;
};

export function skuAlignProductWorkbenchHref(
  productId: string,
  opts?: SkuAlignProductHrefOptions
): string {
  const params = new URLSearchParams();
  params.set(SKU_ALIGN_PRODUCT_PARAM, productId.trim());
  if (opts?.tab && opts.tab !== "primary") {
    params.set(SKU_ALIGN_TAB_PARAM, opts.tab);
  }
  if (opts?.variantId?.trim()) {
    params.set(SKU_ALIGN_VARIANT_PARAM, opts.variantId.trim());
  }
  return `/sku-align/product?${params.toString()}`;
}

export function skuAlignHref(
  filterOrOpts?: SkuAlignFilterParam | SkuAlignHrefOptions
): string {
  let filter: SkuAlignFilterParam | undefined;
  let productId: string | undefined;
  if (typeof filterOrOpts === "string") {
    filter = filterOrOpts;
  } else if (filterOrOpts) {
    filter = filterOrOpts.filter;
    productId = filterOrOpts.productId;
  }

  const params = new URLSearchParams();
  if (filter && filter !== "all") {
    params.set(SKU_ALIGN_FILTER_PARAM, filter);
  }
  if (productId?.trim()) {
    params.set(SKU_ALIGN_PRODUCT_PARAM, productId.trim());
  }
  const q = params.toString();
  return q ? `/sku-align?${q}` : "/sku-align";
}

export function skuAlignProductHref(productId: string): string {
  return skuAlignProductWorkbenchHref(productId, { tab: "primary" });
}

export function parseSkuAlignTabParam(
  value: string | null
): import("@/lib/sku-align/drawer-helpers").DrawerPhase {
  if (value === "replace" || value === "supplement" || value === "primary") {
    return value;
  }
  return "primary";
}

/** Read workbench tab from the current location query (popstate / manual URL). */
export function readSkuAlignProductTabFromLocation(): import("@/lib/sku-align/drawer-helpers").DrawerPhase {
  if (typeof window === "undefined") return "primary";
  return parseSkuAlignTabParam(
    new URLSearchParams(window.location.search).get(SKU_ALIGN_TAB_PARAM)
  );
}

/**
 * Sync workbench tab into the URL without a Next.js navigation (no remount).
 * Keeps deep links / refresh working while tab switches stay client-side.
 */
export function syncSkuAlignProductTabInUrl(
  locale: string,
  productId: string,
  opts?: {
    tab?: import("@/lib/sku-align/drawer-helpers").DrawerPhase;
    variantId?: string | null;
  }
): void {
  if (typeof window === "undefined" || !productId.trim()) return;

  const href = skuAlignProductWorkbenchHref(productId, {
    tab: opts?.tab,
    variantId: opts?.variantId?.trim() || undefined,
  });
  const path = href.startsWith("/") ? `/${locale}${href}` : href;
  const next = `${path}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === next) return;

  window.history.replaceState(window.history.state, "", next);
}

export function parseSkuAlignFilterParam(
  value: string | null
): SkuAlignFilterParam | null {
  if (value === "all" || value === "fully_linked" || value === "partially_linked") {
    return value;
  }
  return null;
}

export function scrollToFirstSkuIssueProduct(): void {
  requestAnimationFrame(() => {
    document
      .querySelector("[data-sku-issue-product]")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export function scrollToSkuProduct(productId: string): void {
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-sku-issue-product="${CSS.escape(productId)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
