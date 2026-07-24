"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "@/lib/ui/icons";
import { motion } from "framer-motion";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { HubAwareSidebar } from "@/components/workbench/hub-aware-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { CompletionScreen } from "@/components/sync/completion-screen";
import { FollowUpList } from "@/components/sync/follow-up-list";
import { LaunchMetricsGrid } from "@/components/sync/launch-metrics-grid";
import { ProductFlipCard } from "@/components/sync/product-flip-card";
import { LaunchReportStream } from "@/components/sync/launch-report-stream";
import { ProgressPanel } from "@/components/sync/progress-panel";
import { SyncPageSkeleton } from "@/components/sync/sync-page-skeleton";
import { useOnboarding } from "@/context/onboarding-context";
import { productsMirrorShopKey } from "@/lib/products/mirror-cache";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";
import {
  assembleLaunchSummaryFast,
  assembleLaunchSummaryFastFromMirror,
  assembleLaunchSummaryFull,
} from "@/lib/sync/assemble-launch-summary";
import {
  peekLaunchSummaryCache,
  setLaunchSummaryCache,
} from "@/lib/sync/launch-summary-cache";
import {
  buildCeremonyTasks,
  ceremonyProductIndex,
  displayStat,
  resolveCeremonyDurations,
  SYNC_CEREMONY_DONE_KEY,
  SYNC_CEREMONY_SUMMARY_VIEWED_KEY,
} from "@/lib/sync/ceremony-progress";
import { composeLaunchReport } from "@/lib/sync/compose-launch-report";
import { getLaunchSummary, type LaunchSummary } from "@/lib/sync/launch-summary";
import { Button } from "@/components/ui/button";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { cn } from "@/lib/utils";

type CeremonyPhase = "loading" | "running" | "holding" | "complete" | "summary";

function readSummaryViewed(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SYNC_CEREMONY_SUMMARY_VIEWED_KEY) === "1";
}

function readCeremonyCelebrated(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SYNC_CEREMONY_DONE_KEY) === "1";
}

function isFullSummary(summary: LaunchSummary): boolean {
  return summary.meta.loadTier === "full" || summary.meta.loadTier === undefined;
}

export default function SyncPage() {
  const { shop, isAuthorized, completeSyncCeremony } = useOnboarding();
  const shopName = resolveShopApiName(shop);
  const shopMirrorKey = useMemo(
    () => productsMirrorShopKey(shop.name, shop.domain),
    [shop.name, shop.domain]
  );
  const t = useT();
  const locale = useLocale();
  const revisitRef = useRef(readSummaryViewed());
  const phaseRef = useRef<CeremonyPhase>("loading");
  const [replayEpoch, setReplayEpoch] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [reportInstant, setReportInstant] = useState(
    () => readSummaryViewed() || readCeremonyCelebrated()
  );

  const [summary, setSummary] = useState<LaunchSummary | null>(null);
  const [phase, setPhase] = useState<CeremonyPhase>("loading");
  const [ceremonyPercent, setCeremonyPercent] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshingSummary, setRefreshingSummary] = useState(false);
  const [fullSummaryReady, setFullSummaryReady] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const skeletonTierMessages = useMemo(
    () => [t("sync.summarizingTier1"), t("sync.summarizingTier2")] as const,
    [t]
  );

  const showFull = phase === "holding" || phase === "summary";
  const summaryIsPartial = summary != null && summary.meta.loadTier === "fast";

  const applyPostFetchPhase = useCallback(() => {
    if (revisitRef.current || readSummaryViewed()) {
      setCeremonyPercent(100);
      setPhase("summary");
    } else if (readCeremonyCelebrated()) {
      setCeremonyPercent(100);
      setPhase("complete");
    } else {
      setCeremonyPercent(0);
      setPhase("running");
    }
  }, []);

  const finishCeremonyToComplete = useCallback(() => {
    completeSyncCeremony();
    sessionStorage.setItem(SYNC_CEREMONY_DONE_KEY, "1");
    setCeremonyPercent(100);
    setPhase("complete");
  }, [completeSyncCeremony]);

  const loadSummary = useCallback(
    async (opts?: { background?: boolean; cancelled?: () => boolean }) => {
      const isCancelled = () => opts?.cancelled?.() ?? false;

      if (opts?.background) {
        setRefreshingSummary(true);
        try {
          const data =
            isAuthorized && shopName
              ? await assembleLaunchSummaryFull(shopName, t, shop.domain)
              : getLaunchSummary();
          if (isCancelled()) return;
          setSummary(data);
          setLaunchSummaryCache(shopMirrorKey, data);
          setFullSummaryReady(true);
        } catch {
          // Keep stale cache on background failure.
        } finally {
          setRefreshingSummary(false);
        }
        return;
      }

      setLoadError(null);
      setFullSummaryReady(false);

      const cached = shopName ? peekLaunchSummaryCache(shopMirrorKey) : undefined;
      if (cached) {
        setSummary(cached);
        setFullSummaryReady(isFullSummary(cached));
        applyPostFetchPhase();
        if (isAuthorized && shopName && !isFullSummary(cached)) {
          void loadSummary({ background: true, cancelled: opts?.cancelled });
        } else if (isAuthorized && shopName) {
          void loadSummary({ background: true, cancelled: opts?.cancelled });
        }
        return;
      }

      let hydrated = false;
      if (isAuthorized && shopName) {
        const mirrorFast = assembleLaunchSummaryFastFromMirror(
          shopMirrorKey,
          shopName,
          shop.domain,
          t
        );
        if (mirrorFast) {
          setSummary(mirrorFast);
          hydrated = true;
          applyPostFetchPhase();
        }
      }

      if (!hydrated) {
        setPhase("loading");
      }

      try {
        if (isAuthorized && shopName && !hydrated) {
          const fast = await assembleLaunchSummaryFast(shopName, t, shop.domain);
          if (isCancelled()) return;
          setSummary(fast);
          applyPostFetchPhase();
        }

        const data =
          isAuthorized && shopName
            ? await assembleLaunchSummaryFull(shopName, t, shop.domain)
            : getLaunchSummary();
        if (isCancelled()) return;
        setSummary(data);
        if (shopName) setLaunchSummaryCache(shopMirrorKey, data);
        setFullSummaryReady(true);

        if (phaseRef.current === "running" && !readSummaryViewed() && !readCeremonyCelebrated()) {
          finishCeremonyToComplete();
        }
      } catch {
        if (isCancelled()) return;
        if (isAuthorized && shopName) {
          setSummary((prev) => {
            if (prev) {
              setLoadError(null);
              return prev;
            }
            setLoadError(t("sync.loadError"));
            setPhase("loading");
            return null;
          });
        } else {
          setSummary(getLaunchSummary());
          setFullSummaryReady(true);
          setCeremonyPercent(0);
          setPhase("running");
        }
      }
    },
    [
      applyPostFetchPhase,
      finishCeremonyToComplete,
      isAuthorized,
      shop.domain,
      shopMirrorKey,
      shopName,
      t,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    void loadSummary({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [loadSummary]);

  const ceremonyRevisit =
    revisitRef.current || readSummaryViewed() || readCeremonyCelebrated();

  useEffect(() => {
    if (!fullSummaryReady) return;
    if (phase !== "running") return;
    if (ceremonyRevisit) return;
    finishCeremonyToComplete();
  }, [fullSummaryReady, phase, ceremonyRevisit, finishCeremonyToComplete]);

  useEffect(() => {
    if (phase !== "running" || !summary) return;

    const { progressMs, holdMs } = resolveCeremonyDurations(ceremonyRevisit);
    const startedAt = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const next = Math.min(100, Math.round((elapsed / progressMs) * 100));
      setCeremonyPercent(next);

      if (next >= 100) {
        if (holdMs <= 0) {
          completeSyncCeremony();
          sessionStorage.setItem(SYNC_CEREMONY_DONE_KEY, "1");
          setPhase(ceremonyRevisit ? "summary" : "complete");
          if (ceremonyRevisit) {
            sessionStorage.setItem(SYNC_CEREMONY_SUMMARY_VIEWED_KEY, "1");
            setReportInstant(true);
          }
        } else {
          setPhase("holding");
        }
        return;
      }
      requestAnimationFrame(tick);
    };

    const frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, summary, ceremonyRevisit, completeSyncCeremony]);

  useEffect(() => {
    if (phase !== "holding") return;

    const { holdMs } = resolveCeremonyDurations(ceremonyRevisit);
    setCeremonyPercent(100);
    const timer = window.setTimeout(() => {
      completeSyncCeremony();
      sessionStorage.setItem(SYNC_CEREMONY_DONE_KEY, "1");
      setPhase("complete");
    }, holdMs);

    return () => window.clearTimeout(timer);
  }, [phase, completeSyncCeremony, ceremonyRevisit]);

  const ceremonyTasks = useMemo(
    () =>
      summary ? buildCeremonyTasks(t, summary.stats, ceremonyPercent, showFull) : [],
    [summary, ceremonyPercent, showFull, t]
  );

  const activeProductIndex = summary
    ? ceremonyProductIndex(ceremonyPercent, summary.products.length)
    : 0;

  const processedProducts = summary
    ? displayStat(
        summary.stats.productsInCeremony || summary.stats.productsTotal,
        ceremonyPercent,
        showFull
      )
    : 0;

  const launchReportText = useMemo(
    () => (summary ? composeLaunchReport(summary, t) : ""),
    [summary, t]
  );

  const handleExportReport = () => {
    window.alert(t("sync.exportSoon"));
  };

  useEffect(() => {
    if (phase === "summary") {
      setReportInstant(true);
    }
  }, [phase]);

  const handleViewSummary = () => {
    setReportInstant(true);
    sessionStorage.setItem(SYNC_CEREMONY_SUMMARY_VIEWED_KEY, "1");
    setCeremonyPercent(100);
    setPhase("summary");
  };

  const skipCeremonyAnimation = useCallback(() => {
    completeSyncCeremony();
    sessionStorage.setItem(SYNC_CEREMONY_DONE_KEY, "1");
    setCeremonyPercent(100);
    if (fullSummaryReady) {
      setPhase("complete");
      return;
    }
    sessionStorage.setItem(SYNC_CEREMONY_SUMMARY_VIEWED_KEY, "1");
    setReportInstant(true);
    setPhase("summary");
  }, [completeSyncCeremony, fullSummaryReady]);

  const replayCeremony = useCallback(async () => {
    if (replaying) return;
    setReplaying(true);
    setLoadError(null);
    setFullSummaryReady(false);
    sessionStorage.removeItem(SYNC_CEREMONY_DONE_KEY);
    sessionStorage.removeItem(SYNC_CEREMONY_SUMMARY_VIEWED_KEY);
    revisitRef.current = false;
    setReportInstant(false);
    setCeremonyPercent(0);
    setReplayEpoch((n) => n + 1);
    try {
      const data =
        isAuthorized && shopName
          ? await assembleLaunchSummaryFull(shopName, t, shop.domain)
          : getLaunchSummary();
      setSummary(data);
      if (shopName) setLaunchSummaryCache(shopMirrorKey, data);
      setFullSummaryReady(true);
      setPhase("running");
    } catch {
      if (isAuthorized && shopName) {
        setLoadError(t("sync.loadError"));
        setPhase("loading");
      } else {
        setSummary(getLaunchSummary());
        setFullSummaryReady(true);
        setPhase("running");
      }
    } finally {
      setReplaying(false);
    }
  }, [isAuthorized, shop.domain, shopMirrorKey, shopName, replaying, t]);

  const replayAction = (
    <div className="flex items-center gap-2">
      {refreshingSummary ? (
        <span className="hidden text-xs text-ink-muted sm:inline">{t("sync.refreshingSummary")}</span>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 w-7 px-0"
        onClick={() => void replayCeremony()}
        disabled={replaying || (phase === "loading" && !summary)}
        title={t("sync.replayCeremonyTitle")}
        aria-label={t("sync.replayCeremonyAria")}
      >
        {replaying ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );

  if (phase === "complete" && summary) {
    return (
      <WorkbenchShell sidebar={<HubAwareSidebar />}>
        <div className="relative flex min-h-[calc(100vh-48px)] items-center justify-center px-[var(--wb-gutter)] py-8">
          <div className="absolute right-[var(--wb-gutter)] top-6 z-10">{replayAction}</div>
          <CompletionScreen
            shopDomain={summary.meta.shopDomain || summary.meta.shopName}
            onExportReport={handleExportReport}
            onViewSummary={handleViewSummary}
          />
        </div>
      </WorkbenchShell>
    );
  }

  if (!summary && (phase === "loading" || loadError)) {
    return (
      <WorkbenchShell sidebar={<HubAwareSidebar />}>
        <WorkbenchPanel
          title={t("sync.title")}
          breadcrumbs={[
            { label: t("nav.workbench"), href: localePath(locale, "/") },
            { label: t("sync.title") },
          ]}
          maxWidth={1080}
          actions={loadError ? undefined : replayAction}
        >
          {loadError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-ink-muted">
              <p>{loadError}</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void loadSummary()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            <SyncPageSkeleton tierMessages={skeletonTierMessages} />
          )}
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <WorkbenchShell sidebar={<HubAwareSidebar />}>
      <WorkbenchPanel
        title={t("sync.title")}
        description={phase === "summary" ? undefined : t("sync.reviewing")}
        breadcrumbs={[
          { label: t("nav.workbench"), href: localePath(locale, "/") },
          { label: t("sync.title") },
        ]}
        maxWidth={1080}
        actions={replayAction}
      >
        <motion.div
          key={replayEpoch}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {phase === "running" ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={skipCeremonyAnimation}
                title={t("sync.skipCeremonyTitle")}
              >
                {t("sync.skipCeremonyLabel")}
              </Button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
            <div className="flex min-h-0 flex-col gap-3">
              {summary.products.length > 0 ? (
                <ProductFlipCard
                  products={summary.products}
                  activeIndex={activeProductIndex}
                  processedCount={processedProducts}
                  totalCount={summary.stats.productsTotal}
                  carouselCount={summary.products.length}
                  autoRotate={phase === "summary"}
                />
              ) : (
                <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-6 text-center text-sm text-ink-muted shadow-card">
                  {summary.stats.productsTotal > 0
                    ? t("sync.noPreview")
                    : t("sync.noProducts")}
                  <Link href={localePath(locale, "/products")} className="mt-2 block">
                    <Button size="sm" variant="secondary">
                      {t("sync.goProducts")}
                    </Button>
                  </Link>
                </div>
              )}
              <ProgressPanel
                layout="horizontal"
                className="min-h-0 flex-1"
                percent={ceremonyPercent}
                tasks={ceremonyTasks}
                stats={summary.stats}
                showFull={showFull}
              />
            </div>

            <LaunchReportStream
              key={replayEpoch}
              text={launchReportText}
              percent={ceremonyPercent}
              showFull={showFull}
              layout="vertical"
              instant={reportInstant}
              className="h-full min-h-[320px] lg:min-h-0"
            />
          </div>

          <div
            className={cn(
              "space-y-4 transition-opacity duration-300",
              summaryIsPartial && "opacity-90"
            )}
          >
            {summaryIsPartial ? (
              <p className="flex items-center gap-2 text-xs text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-accent" />
                {t("sync.loadingTier2Hint")}
              </p>
            ) : null}
            <LaunchMetricsGrid
              shopify={summary.shopifyWrites}
              fulfillment={summary.fulfillmentPrep}
              strategy={summary.strategy}
            />
            <FollowUpList items={summary.followUps} />
          </div>
        </motion.div>
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}
