"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CatalogProductGrid } from "@/components/select/catalog-product-grid";
import { CatalogLinkDrawer } from "@/components/select/catalog-link-drawer";
import type { PublishCellState } from "@/components/select/catalog-product-card";
import { SmartSourcingFilters } from "@/components/select/smart-sourcing-filters";
import { useOnboarding } from "@/context/onboarding-context";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { api, readableError } from "@/lib/api";
import { resolveListingPricingContext } from "@/lib/listing-pricing";
import { sourcingProcurementDisplay } from "@/lib/sourcing/display-pricing";
import { hitsToCatalogRecommendations } from "@/lib/sourcing/map-catalog";
import { publishSourcingHit } from "@/lib/sourcing/publish-sourcing-hit";
import { searchSourcingHits } from "@/lib/sourcing/search";
import { setSourcingSession } from "@/lib/sourcing/session";
import type { SourcingSearchHit } from "@/lib/sourcing/types";
import {
  createSavedSearch,
  loadFiltersCollapsed,
  loadSavedSearches,
  normalizeCatalogFilters,
  persistFiltersCollapsed,
  persistSavedSearches,
  summarizeFilters,
  DEFAULT_CATALOG_FILTERS,
} from "@/lib/catalog-saved-searches";
import type {
  CatalogFilterState,
  RecommendedCategory,
  SavedCatalogSearch,
} from "@/lib/catalog-sourcing-types";
import { markCatalogPublished } from "@/lib/batch-link/publish-source";
import { queuePublishReveal } from "@/lib/batch-link/publish-reveal";
import type { CatalogRecommendation, PricingTemplate } from "@/lib/types";

const PAGE_SIZE = 30;

function money(value?: number | null, currency?: string | null): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

export function CatalogPublishPanel({
  onActivity,
  recommendedCategories = [],
  /** When set, filters render into this host (Discover top context slot above tabs). */
  filtersMountEl = null,
  /** Page-level pricing template; when saved upstream, local list reprices. */
  sharedTemplate = null,
  /** Report applied filter chips for PageContext / agents. */
  onAppliedFilterSummaryChange,
  /** Agent one-click preset: apply recommended category by name */
  filterPresetRequest = null,
  onFilterPresetConsumed,
  onBindingLinked,
  /** Fired after a catalog item is published to Shopify (for mirror refresh + reveal animation). */
  onPublished,
}: {
  onActivity?: () => void;
  recommendedCategories?: RecommendedCategory[];
  filtersMountEl?: HTMLElement | null;
  sharedTemplate?: PricingTemplate | null;
  onAppliedFilterSummaryChange?: (chips: string[]) => void;
  filterPresetRequest?: {
    categoryName?: string;
    keywords?: string;
    sourceFilter?: "all" | "tangbuy" | "1688";
    priceMaxUsd?: number;
  } | null;
  onFilterPresetConsumed?: () => void;
  /** Called after catalog item is linked to an existing shop product. */
  onBindingLinked?: (thirdPlatformItemId: string) => void;
  onPublished?: (thirdPlatformItemId: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const { shop, showToast } = useOnboarding();
  const shopName = shop.name;

  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [template, setTemplate] = useState<PricingTemplate | null>(null);
  const [recommendations, setRecommendations] = useState<CatalogRecommendation[]>(
    []
  );
  const [page, setPage] = useState(1);
  const [pageTurning, setPageTurning] = useState(false);
  const [publishState, setPublishState] = useState<Record<string, PublishCellState>>(
    {}
  );
  const [linkItem, setLinkItem] = useState<CatalogRecommendation | null>(null);
  const [sourcingHits, setSourcingHits] = useState<SourcingSearchHit[]>([]);

  const [filters, setFilters] = useState<CatalogFilterState>(DEFAULT_CATALOG_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<CatalogFilterState>(DEFAULT_CATALOG_FILTERS);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedCatalogSearch[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const templateRef = useRef<PricingTemplate | null>(null);
  templateRef.current = template;
  const appliedRef = useRef(appliedFilters);
  appliedRef.current = appliedFilters;
  const categoriesRef = useRef(recommendedCategories);
  categoriesRef.current = recommendedCategories;

  const hasNextPage = recommendations.length >= PAGE_SIZE;

  const loadPage = useCallback(
    async (pageNum: number, tpl?: PricingTemplate | null, f?: CatalogFilterState) => {
      const effectiveTemplate = tpl ?? templateRef.current;
      if (!effectiveTemplate) return;
      const filterState = f ?? appliedRef.current;
      const hits = await searchSourcingHits({
        shopName,
        limit: PAGE_SIZE,
        offset: (pageNum - 1) * PAGE_SIZE,
        template: effectiveTemplate,
        filters: filterState,
        categories: categoriesRef.current,
        localeCountry: locale === "zh" ? "cn" : locale,
      });
      setSourcingHits(hits);
      setSourcingSession(shopName, hits);
      setRecommendations(
        hitsToCatalogRecommendations(hits, effectiveTemplate)
      );
      setPage(pageNum);
    },
    [shopName, locale]
  );

  const loadAll = useCallback(
    async (opts?: { showSkeleton?: boolean; filters?: CatalogFilterState }) => {
      const showSkeleton = opts?.showSkeleton ?? templateRef.current === null;
      if (showSkeleton) setPageLoading(true);
      setPageError(null);
      try {
        const tpl = await api.getPricingTemplate(shopName);
        templateRef.current = tpl;
        setTemplate(tpl);
        const f = opts?.filters ?? appliedRef.current;
        await loadPage(1, tpl, f);
      } catch (err) {
        setPageError(readableError(err, t));
      } finally {
        if (showSkeleton) setPageLoading(false);
      }
    },
    [shopName, loadPage, t]
  );

  // Hydrate saved searches; seed Top-1 recommended category on first enter.
  useEffect(() => {
    const saved = loadSavedSearches(shopName);
    setSavedSearches(saved);
    const collapsed = loadFiltersCollapsed(shopName);
    setFiltersCollapsed(collapsed);

    const top = recommendedCategories[0];
    const initial: CatalogFilterState = top
      ? { ...DEFAULT_CATALOG_FILTERS, categoryIds: [top.id] }
      : { ...DEFAULT_CATALOG_FILTERS };
    setFilters(initial);
    setAppliedFilters(initial);
    appliedRef.current = initial;
    setActiveSavedId(null);
    setBootstrapped(true);
    void loadAll({ showSkeleton: true, filters: initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per shop
  }, [shopName]);

  // Sync when page-level drawer saves a template.
  useEffect(() => {
    if (!sharedTemplate) return;
    setTemplate(sharedTemplate);
    templateRef.current = sharedTemplate;
    if (sourcingHits.length > 0) {
      setRecommendations(
        hitsToCatalogRecommendations(sourcingHits, sharedTemplate)
      );
    }
  }, [sharedTemplate, sourcingHits]);

  // Surface applied filters to page-level PageContext / agents.
  useEffect(() => {
    if (!onAppliedFilterSummaryChange) return;
    const names: Record<string, string> = {};
    for (const c of recommendedCategories) names[c.id] = c.name;
    onAppliedFilterSummaryChange(summarizeFilters(appliedFilters, names));
  }, [appliedFilters, recommendedCategories, onAppliedFilterSummaryChange]);

  // If categories arrive after first paint (shop products loaded late), seed Top-1 once.
  useEffect(() => {
    if (!bootstrapped) return;
    const top = recommendedCategories[0];
    if (!top) return;
    setFilters((prev) => {
      if (prev.categoryIds.length > 0 || prev.keywords.trim()) return prev;
      return { ...prev, categoryIds: [top.id] };
    });
    setAppliedFilters((prev) => {
      if (prev.categoryIds.length > 0 || prev.keywords.trim()) return prev;
      const next = { ...prev, categoryIds: [top.id] };
      appliedRef.current = next;
      void loadPage(1, templateRef.current, next);
      return next;
    });
  }, [recommendedCategories, bootstrapped, loadPage]);

  // Agent / rail filter preset → apply real category id (no fabricated results).
  useEffect(() => {
    if (!filterPresetRequest || !bootstrapped) return;
    const name = filterPresetRequest.categoryName?.trim();
    const match = name
      ? recommendedCategories.find((c) => c.name === name)
      : undefined;
    const next: CatalogFilterState = {
      ...DEFAULT_CATALOG_FILTERS,
      categoryIds: match ? [match.id] : [],
      keywords: filterPresetRequest.keywords?.trim() ?? "",
      sourceFilter: filterPresetRequest.sourceFilter ?? "all",
      priceMaxUsd:
        filterPresetRequest.priceMaxUsd != null
          ? String(filterPresetRequest.priceMaxUsd)
          : "",
    };
    setFilters(next);
    setAppliedFilters(next);
    appliedRef.current = next;
    setActiveSavedId(null);
    void loadPage(1, templateRef.current, next).finally(() => {
      onFilterPresetConsumed?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPresetRequest]);

  const goToPage = useCallback(
    async (nextPage: number) => {
      if (nextPage < 1 || pageTurning) return;
      if (nextPage > page && !hasNextPage) return;
      setPageTurning(true);
      try {
        await loadPage(nextPage);
      } catch (err) {
        showToast(readableError(err, t));
      } finally {
        setPageTurning(false);
      }
    },
    [hasNextPage, loadPage, page, pageTurning, showToast, t]
  );

  const applyFilters = useCallback(async () => {
    setAppliedFilters(filters);
    setActiveSavedId(null);
    setPageTurning(true);
    try {
      await loadPage(1, templateRef.current, filters);
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setPageTurning(false);
    }
  }, [filters, loadPage, showToast, t]);

  const clearFilters = useCallback(async () => {
    const next = { ...DEFAULT_CATALOG_FILTERS };
    setFilters(next);
    setAppliedFilters(next);
    setActiveSavedId(null);
    setPageTurning(true);
    try {
      await loadPage(1, templateRef.current, next);
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setPageTurning(false);
    }
  }, [loadPage, showToast, t]);

  const handleSaveSearch = useCallback(
    (name: string) => {
      const entry = createSavedSearch(name, filters);
      const next = [entry, ...savedSearches].slice(0, 12);
      setSavedSearches(next);
      persistSavedSearches(shopName, next);
      setActiveSavedId(entry.id);
      setAppliedFilters(filters);
      setFiltersCollapsed(true);
      persistFiltersCollapsed(shopName, true);
      showToast(t("catalogPublish.toastSearchSaved", { name: entry.name }));
      void loadPage(1, templateRef.current, filters);
    },
    [filters, savedSearches, shopName, showToast, loadPage, t]
  );

  const handleSelectSaved = useCallback(
    async (search: SavedCatalogSearch) => {
      const normalized = normalizeCatalogFilters(search.filters);
      setFilters(normalized);
      setAppliedFilters(normalized);
      appliedRef.current = normalized;
      setActiveSavedId(search.id);
      setFiltersCollapsed(true);
      persistFiltersCollapsed(shopName, true);
      setPageTurning(true);
      try {
        await loadPage(1, templateRef.current, normalized);
      } catch (err) {
        showToast(readableError(err, t));
      } finally {
        setPageTurning(false);
      }
    },
    [loadPage, shopName, showToast, t]
  );

  const handleRemoveSaved = useCallback(
    (id: string) => {
      const next = savedSearches.filter((s) => s.id !== id);
      setSavedSearches(next);
      persistSavedSearches(shopName, next);
      if (activeSavedId === id) setActiveSavedId(null);
    },
    [savedSearches, shopName, activeSavedId]
  );

  const handlePublish = async (item: CatalogRecommendation) => {
    const current = publishState[item.candidateId];
    if (current?.loading) return;

    const hit = sourcingHits.find((h) => {
      const row = hitsToCatalogRecommendations([h], template)[0];
      return row.candidateId === item.candidateId;
    });

    if (
      !window.confirm(
        t("catalogPublish.confirmPublish", {
          title: item.title,
          price: money(item.estimatedSalePrice, item.targetCurrency),
          shopName: shopName,
        })
      )
    ) {
      return;
    }

    setPublishState((prev) => ({
      ...prev,
      [item.candidateId]: { loading: true },
    }));

    try {
      const publishHit: SourcingSearchHit =
        hit ??
        ({
          hitId: `tangbuy:${item.candidateId}`,
          source: item.offerId1688 && !item.tangbuyUrl ? "1688" : "tangbuy",
          title: item.title,
          imageUrl: item.imageUrl,
          imageUrls: item.imageUrls,
          costCny: item.price,
          currency: item.currency,
          candidateId: item.candidateId,
          tangbuyUrl: item.tangbuyUrl,
          offerId1688: item.offerId1688,
          displayMultiplier: item.offerId1688 ? 1.2 : 1,
        } satisfies SourcingSearchHit);

      const outcome = await publishSourcingHit({
        hit: publishHit,
        shopName,
        template,
      });

      if (!outcome.ok || !outcome.result) {
        throw new Error(outcome.error ?? t("catalogPublish.publishFailed"));
      }

      const result = outcome.result;
      setPublishState((prev) => ({
        ...prev,
        [item.candidateId]: { loading: false, result },
      }));
      onActivity?.();
      if (result.publishStatus === "PUBLISHED") {
        if (result.shopifyProductId?.trim()) {
          const productId = result.shopifyProductId.trim();
          markCatalogPublished(shopName, productId);
          queuePublishReveal(shopName, productId, item);
          onPublished?.(productId);
        }
        showToast(t("catalogPublish.publishSuccess"));
      } else if (result.publishStatus === "PUBLISHING") {
        showToast(t("catalogPublish.publishInProgress"));
      } else {
        showToast(
          t("catalogPublish.publishIncomplete", {
            message: result.message ?? result.publishStatus,
          })
        );
      }
    } catch (err) {
      setPublishState((prev) => ({
        ...prev,
        [item.candidateId]: {
          loading: false,
          error: readableError(err, t),
        },
      }));
      showToast(readableError(err, t) || t("catalogPublish.publishFailed"));
    }
  };

  const purchasePriceById = useMemo(() => {
    const map: Record<string, number | null> = {};
    if (!template) return map;
    for (const hit of sourcingHits) {
      const row = hitsToCatalogRecommendations([hit], template)[0];
      map[row.candidateId] = sourcingProcurementDisplay(hit.costCny, template);
    }
    return map;
  }, [sourcingHits, template]);

  const sourcingMetaById = useMemo(() => {
    const map: Record<
      string,
      {
        source: SourcingSearchHit["source"];
        detailUrl?: string | null;
      }
    > = {};
    for (const hit of sourcingHits) {
      const row = hitsToCatalogRecommendations([hit], template)[0];
      map[row.candidateId] = {
        source: hit.source,
        detailUrl:
          hit.source === "1688" ? hit.detailUrl1688 ?? null : hit.tangbuyUrl,
      };
    }
    return map;
  }, [sourcingHits, template]);

  const listingCtx = resolveListingPricingContext(template);
  const targetCurrency = listingCtx?.targetCurrency ?? "USD";

  const filtersNode = (
    <SmartSourcingFilters
      filters={filters}
      collapsed={filtersCollapsed}
      recommendedCategories={recommendedCategories}
      savedSearches={savedSearches}
      activeSavedId={activeSavedId}
      onChange={setFilters}
      onApply={() => void applyFilters()}
      onClear={() => void clearFilters()}
      onToggleCollapsed={() => {
        const next = !filtersCollapsed;
        setFiltersCollapsed(next);
        persistFiltersCollapsed(shopName, next);
      }}
      onSaveSearch={handleSaveSearch}
      onSelectSaved={(s) => void handleSelectSaved(s)}
      onRemoveSaved={handleRemoveSaved}
      onRefresh={() => void loadAll({ showSkeleton: false })}
      refreshDisabled={pageLoading || pageTurning}
      refreshing={pageLoading}
    />
  );

  return (
    <div className="space-y-3">
      {filtersMountEl?.isConnected
        ? createPortal(filtersNode, filtersMountEl)
        : filtersNode}

      {pageError ? (
        <Card className="border-red-200">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-red-700">
            <span>{t("catalogPublish.loadFailed", { error: pageError })}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void loadAll({ showSkeleton: true })}
            >
              {t("catalogPublish.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <CatalogProductGrid
        items={recommendations}
        page={page}
        pageSize={PAGE_SIZE}
        pageLoading={pageLoading}
        pageTurning={pageTurning}
        hasNextPage={hasNextPage}
        purchasePriceById={purchasePriceById}
        sourcingMetaById={sourcingMetaById}
        targetCurrency={targetCurrency}
        publishState={publishState}
        onPublish={(item) => void handlePublish(item)}
        onLink={(item) => setLinkItem(item)}
        onPrevPage={() => void goToPage(page - 1)}
        onNextPage={() => void goToPage(page + 1)}
      />

      <CatalogLinkDrawer
        open={linkItem != null}
        catalogItem={linkItem}
        shopName={shopName}
        onClose={() => setLinkItem(null)}
        showToast={showToast}
        onLinked={(thirdPlatformItemId) => {
          setLinkItem(null);
          onActivity?.();
          onBindingLinked?.(thirdPlatformItemId);
        }}
      />
    </div>
  );
}
