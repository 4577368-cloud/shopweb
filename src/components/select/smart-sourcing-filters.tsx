"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Search } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RecommendedCategoryChips } from "@/components/select/recommended-category-chips";
import { SavedSearchChips } from "@/components/select/saved-search-chips";
import {
  CATALOG_SORT_OPTIONS,
  type CatalogFilterState,
  type RecommendedCategory,
  type SavedCatalogSearch,
} from "@/lib/catalog-sourcing-types";
import { summarizeFilters } from "@/lib/catalog-saved-searches";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export interface SmartSourcingFiltersProps {
  filters: CatalogFilterState;
  collapsed: boolean;
  recommendedCategories: RecommendedCategory[];
  savedSearches: SavedCatalogSearch[];
  activeSavedId?: string | null;
  onChange: (next: CatalogFilterState) => void;
  onApply: () => void;
  onClear: () => void;
  onToggleCollapsed: () => void;
  onSaveSearch: (name: string) => void;
  onSelectSaved: (search: SavedCatalogSearch) => void;
  onRemoveSaved: (id: string) => void;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshing?: boolean;
  className?: string;
}

function FilterRefreshButton({
  onRefresh,
  disabled,
  refreshing,
  refreshLabel,
}: {
  onRefresh?: () => void;
  disabled?: boolean;
  refreshing?: boolean;
  refreshLabel: string;
}) {
  if (!onRefresh) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onRefresh}
      disabled={disabled || refreshing}
      className="h-7 w-7 shrink-0 px-0"
      title={refreshLabel}
      aria-label={refreshLabel}
    >
      {refreshing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

export function SmartSourcingFilters({
  filters,
  collapsed,
  recommendedCategories,
  savedSearches,
  activeSavedId,
  onChange,
  onApply,
  onClear,
  onToggleCollapsed,
  onSaveSearch,
  onSelectSaved,
  onRemoveSaved,
  onRefresh,
  refreshDisabled,
  refreshing,
  className,
}: SmartSourcingFiltersProps) {
  const t = useT();
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);

  const categoryNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of recommendedCategories) map[c.id] = c.name;
    return map;
  }, [recommendedCategories]);

  const chips = summarizeFilters(filters, categoryNames);
  const activeSaved = savedSearches.find((s) => s.id === activeSavedId);

  const patch = (p: Partial<CatalogFilterState>) => onChange({ ...filters, ...p });

  const toggleCategory = (id: string) => {
    const next = filters.categoryIds.includes(id)
      ? filters.categoryIds.filter((x) => x !== id)
      : [...filters.categoryIds, id];
    patch({ categoryIds: next });
  };

  const handleSave = () => {
    onSaveSearch(
      saveName.trim() || chips.slice(0, 2).join(" · ") || t("sourcing.currentSearch")
    );
    setSaveName("");
    setShowSave(false);
  };

  if (collapsed) {
    const summaryParts = [...(activeSaved ? [activeSaved.name] : []), ...chips];
    const summaryText = summaryParts.length
      ? summaryParts.join(" · ")
      : t("sourcing.noFilters");
    const savedHint =
      !activeSaved && savedSearches.length > 0
        ? t("sourcing.savedCount", { count: savedSearches.length })
        : "";

    return (
      <section
        className={cn(
          "flex items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface/80 px-3 py-1.5",
          className
        )}
      >
        <p
          className="min-w-0 flex-1 truncate text-xs text-ink-muted"
          title={summaryText + savedHint}
        >
          <span className="text-ink">{summaryText}</span>
          {savedHint ? <span className="text-ink-subtle">{savedHint}</span> : null}
        </p>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-link hover:text-link-hover hover:underline"
        >
          {t("sourcing.expandFilters")}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <FilterRefreshButton
          onRefresh={onRefresh}
          disabled={refreshDisabled}
          refreshing={refreshing}
          refreshLabel={t("sourcing.filterRefresh")}
        />
      </section>
    );
  }

  return (
    <section
      className={cn(
        "rounded-[var(--radius-control)] border border-hairline bg-surface/80 px-3 py-2",
        className
      )}
    >
      <div className="mb-1.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink"
        >
          {t("sourcing.collapseFilters")} <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <FilterRefreshButton
          onRefresh={onRefresh}
          disabled={refreshDisabled}
          refreshing={refreshing}
          refreshLabel={t("sourcing.filterRefresh")}
        />
      </div>

      <RecommendedCategoryChips
        categories={recommendedCategories}
        selectedIds={filters.categoryIds}
        onToggle={toggleCategory}
        onClear={() => patch({ categoryIds: [] })}
      />

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="w-[200px] max-w-full">
          <label className="mb-1 block text-[10px] font-medium text-ink-subtle">
            {t("sourcing.keyword")}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
            <Input
              className="h-8 pl-7 text-xs"
              placeholder={t("sourcing.keywordPlaceholder")}
              value={filters.keywords}
              onChange={(e) => patch({ keywords: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") onApply();
              }}
            />
          </div>
        </div>

        <div className="w-[84px]">
          <label className="mb-1 block text-[10px] font-medium text-ink-subtle">
            {t("sourcing.priceMin")}
          </label>
          <Input
            className="h-8 text-xs"
            type="number"
            inputMode="decimal"
            placeholder="USD"
            value={filters.priceMinUsd}
            onChange={(e) => patch({ priceMinUsd: e.target.value })}
          />
        </div>
        <div className="w-[84px]">
          <label className="mb-1 block text-[10px] font-medium text-ink-subtle">
            {t("sourcing.priceMax")}
          </label>
          <Input
            className="h-8 text-xs"
            type="number"
            inputMode="decimal"
            placeholder="USD"
            value={filters.priceMaxUsd}
            onChange={(e) => patch({ priceMaxUsd: e.target.value })}
          />
        </div>

        <div className="w-[112px]">
          <label className="mb-1 block text-[10px] font-medium text-ink-subtle">
            {t("sourcing.sort")}
          </label>
          <Select
            className="h-8 text-xs"
            value={filters.sort}
            onChange={(e) =>
              patch({ sort: e.target.value as CatalogFilterState["sort"] })
            }
          >
            {CATALOG_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 pb-0.5">
          {showSave ? (
            <>
              <Input
                className="h-8 w-32 text-xs"
                placeholder={t("sourcing.saveSearchPlaceholder")}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
              <Button size="sm" variant="secondary" onClick={handleSave}>
                {t("common.confirm")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowSave(false)}>
                {t("common.cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={onApply}>
                {t("sourcing.apply")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowSave(true)}>
                {t("sourcing.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClear}>
                {t("sourcing.clear")}
              </Button>
            </>
          )}
        </div>
      </div>

      {savedSearches.length > 0 ? (
        <SavedSearchChips
          className="mt-1.5"
          searches={savedSearches}
          activeId={activeSavedId}
          onSelect={onSelectSaved}
          onRemove={onRemoveSaved}
        />
      ) : null}
    </section>
  );
}
