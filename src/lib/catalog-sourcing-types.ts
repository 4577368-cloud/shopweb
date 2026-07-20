/** Shared types for Tangbuy catalog smart-sourcing (path B) filters & saved searches. */

export type CatalogSort =
  | "recommended"
  | "price_asc"
  | "price_desc"
  | "newest";

export interface RecommendedCategory {
  id: string;
  name: string;
  /** Share of shop products attributed to this category, 0–1. */
  share: number;
  count: number;
}

export interface CatalogFilterState {
  keywords: string;
  /** Purchase-price band in USD (after FX). Empty string = unset. */
  priceMinUsd: string;
  priceMaxUsd: string;
  /** Selected recommended / catalog category ids. */
  categoryIds: string[];
  /** Reserved for Tangbuy labelIdList when backend is wired. */
  labelIds: string[];
  sort: CatalogSort;
}

export interface SavedCatalogSearch {
  id: string;
  name: string;
  filters: CatalogFilterState;
  createdAt: string;
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilterState = {
  keywords: "",
  priceMinUsd: "",
  priceMaxUsd: "",
  categoryIds: [],
  labelIds: [],
  sort: "recommended",
};

export const CURRENCY_OPTIONS = ["CNY", "USD", "EUR", "GBP"] as const;

export const CATALOG_SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: "recommended", label: "推荐优先" },
  { value: "price_asc", label: "价格升序" },
  { value: "price_desc", label: "价格降序" },
  { value: "newest", label: "最新" },
];
