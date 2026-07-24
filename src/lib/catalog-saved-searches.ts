import type {
  CatalogFilterState,
  SavedCatalogSearch,
} from "@/lib/catalog-sourcing-types";
import { DEFAULT_CATALOG_FILTERS } from "@/lib/catalog-sourcing-types";

const STORAGE_PREFIX = "tangbuy.catalog.savedSearches.v1:";
const COLLAPSE_PREFIX = "tangbuy.catalog.filtersCollapsed.v1:";

function storageKey(shopName: string): string {
  return `${STORAGE_PREFIX}${shopName}`;
}

function collapseKey(shopName: string): string {
  return `${COLLAPSE_PREFIX}${shopName}`;
}

export function loadSavedSearches(shopName: string): SavedCatalogSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(shopName));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedCatalogSearch[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) => ({
      ...s,
      filters: normalizeCatalogFilters(s.filters),
    }));
  } catch {
    return [];
  }
}

/** Backfill new filter fields for saved searches created before dual-source. */
export function normalizeCatalogFilters(
  filters: Partial<CatalogFilterState> | null | undefined
): CatalogFilterState {
  return {
    ...DEFAULT_CATALOG_FILTERS,
    ...filters,
    sourceFilter: filters?.sourceFilter ?? DEFAULT_CATALOG_FILTERS.sourceFilter,
  };
}

export function persistSavedSearches(
  shopName: string,
  searches: SavedCatalogSearch[]
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(shopName), JSON.stringify(searches));
}

export function loadFiltersCollapsed(shopName: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(collapseKey(shopName)) === "1";
}

export function persistFiltersCollapsed(shopName: string, collapsed: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(collapseKey(shopName), collapsed ? "1" : "0");
}

export function createSavedSearch(
  name: string,
  filters: CatalogFilterState
): SavedCatalogSearch {
  return {
    id: `ss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || "未命名搜索",
    filters: { ...filters },
    createdAt: new Date().toISOString(),
  };
}

export function summarizeFilters(
  filters: CatalogFilterState,
  categoryNames: Record<string, string>
): string[] {
  const chips: string[] = [];
  if (filters.keywords.trim()) chips.push(filters.keywords.trim());
  for (const id of filters.categoryIds) {
    chips.push(categoryNames[id] ?? id);
  }
  const min = filters.priceMinUsd.trim();
  const max = filters.priceMaxUsd.trim();
  if (min || max) {
    chips.push(`${min || "0"}-${max || "∞"} USD`);
  }
  if (filters.sort !== "recommended") {
    const labels: Record<string, string> = {
      price_asc: "价格升序",
      price_desc: "价格降序",
      newest: "最新",
    };
    chips.push(labels[filters.sort] ?? filters.sort);
  }
  if (filters.sourceFilter && filters.sourceFilter !== "all") {
    chips.push(filters.sourceFilter === "1688" ? "1688" : "Tangbuy");
  }
  return chips;
}

export function filtersEqual(a: CatalogFilterState, b: CatalogFilterState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export { DEFAULT_CATALOG_FILTERS };
