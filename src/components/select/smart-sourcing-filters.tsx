"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Search } from "lucide-react";
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
  /** Icon-only refresh, shown on the same row when filters are collapsed. */
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshing?: boolean;
  className?: string;
}

function FilterRefreshButton({
  onRefresh,
  disabled,
  refreshing,
}: {
  onRefresh?: () => void;
  disabled?: boolean;
  refreshing?: boolean;
}) {
  if (!onRefresh) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onRefresh}
      disabled={disabled || refreshing}
      className="h-7 w-7 shrink-0 px-0"
      title="刷新列表"
      aria-label="刷新列表"
    >
      {refreshing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

/** Compact discover-tab filter strip: categories → controls → right-aligned actions. */
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
    onSaveSearch(saveName.trim() || chips.slice(0, 2).join(" · ") || "当前搜索");
    setSaveName("");
    setShowSave(false);
  };

  if (collapsed) {
    const summaryParts = [
      ...(activeSaved ? [activeSaved.name] : []),
      ...chips,
    ];
    const summaryText = summaryParts.length
      ? summaryParts.join(" · ")
      : "无筛选条件 · 浏览全部商品";
    const savedHint =
      !activeSaved && savedSearches.length > 0
        ? ` · ${savedSearches.length} 个已保存`
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
          {savedHint ? (
            <span className="text-ink-subtle">{savedHint}</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand-strong hover:underline"
        >
          展开筛选
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <FilterRefreshButton
          onRefresh={onRefresh}
          disabled={refreshDisabled}
          refreshing={refreshing}
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
          收起 <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <FilterRefreshButton
          onRefresh={onRefresh}
          disabled={refreshDisabled}
          refreshing={refreshing}
        />
      </div>

      {/* Layer 1: recommended categories first */}
      <RecommendedCategoryChips
        categories={recommendedCategories}
        selectedIds={filters.categoryIds}
        onToggle={toggleCategory}
        onClear={() => patch({ categoryIds: [] })}
      />

      {/* Layer 2: compact controls — fixed widths, actions flush right */}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="w-[200px] max-w-full">
          <label className="mb-1 block text-[10px] font-medium text-ink-subtle">关键词</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
            <Input
              className="h-8 pl-7 text-xs"
              placeholder="标题 / 关键词"
              value={filters.keywords}
              onChange={(e) => patch({ keywords: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") onApply();
              }}
            />
          </div>
        </div>

        <div className="w-[84px]">
          <label className="mb-1 block text-[10px] font-medium text-ink-subtle">最低价</label>
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
          <label className="mb-1 block text-[10px] font-medium text-ink-subtle">最高价</label>
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
          <label className="mb-1 block text-[10px] font-medium text-ink-subtle">排序</label>
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
                placeholder="如：家居低价款"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
              <Button size="sm" variant="secondary" onClick={handleSave}>
                确认
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowSave(false)}>
                取消
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={onApply}>
                应用
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowSave(true)}>
                保存
              </Button>
              <Button size="sm" variant="ghost" onClick={onClear}>
                清空
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
