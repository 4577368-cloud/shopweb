"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  LineChart,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import {
  AssistantRail,
  CopilotCard,
  type AssistantSuggestion,
} from "@/components/workbench/assistant-rail";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useOnboarding } from "@/context/onboarding-context";
import { api } from "@/lib/api";
import { SHOP_STORAGE_KEY, launchShopifyInstall } from "@/lib/shopify-install";
import type { AiPanelContent } from "@/lib/types";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { localeHtmlLang } from "@/i18n/config";
import { cn } from "@/lib/utils";

type Phase = "unbound" | "restoring" | "authorized";
type ProductSyncState = "idle" | "syncing" | "done" | "error";
type TranslateFn = ReturnType<typeof useT>;

/** Synced product display: success with 0 → no products; no data yet → not fetched. */
function formatSyncedProductLabel(
  t: TranslateFn,
  state: ProductSyncState,
  count: number
): string {
  if (state === "syncing") return t("authorize.syncing");
  if (state === "error" || state === "idle") return t("authorize.notFetched");
  return count === 0 ? t("authorize.noProducts") : String(count);
}

function fmtDate(locale: string, iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const htmlLang = localeHtmlLang[locale as keyof typeof localeHtmlLang] ?? locale;
  return d.toLocaleString(htmlLang, { hour12: false });
}

export default function AuthorizePage() {
  const t = useT();
  const locale = useLocale();
  const {
    authStatus,
    shopDomainInput,
    setShopDomainInput,
    shop,
    isAuthorized,
    authSessionReady,
    showToast,
    hydrateAuthorizedShop,
  } = useOnboarding();

  const [refreshing, setRefreshing] = useState(false);
  const [boundCount, setBoundCount] = useState<number | null>(null);
  const [publishedCount, setPublishedCount] = useState<number | null>(null);
  const [editingDomain, setEditingDomain] = useState(false);
  const [savedShop, setSavedShop] = useState<string | null>(null);
  const [productSyncState, setProductSyncState] =
    useState<ProductSyncState>("idle");
  const [mirrorProductCount, setMirrorProductCount] = useState<number | null>(
    null
  );
  const syncAttemptedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSavedShop(window.localStorage.getItem(SHOP_STORAGE_KEY));
  }, [authSessionReady]);

  // Real post-auth stats: 已关联货源 (distinct bound products) + 已刊登 (catalog publishes still on Shopify).
  const loadStats = useCallback(async (shopName: string) => {
    try {
      const [list, published] = await Promise.all([
        api.listImageBindings(shopName),
        api.getPublishedCount(shopName).catch(() => ({ count: 0 })),
      ]);
      const distinct = new Set(
        list
          .filter((b) => b.bound && b.thirdPlatformItemId)
          .map((b) => b.thirdPlatformItemId)
      );
      setBoundCount(distinct.size);
      setPublishedCount(published.count ?? 0);
    } catch {
      setBoundCount(null);
    }
  }, []);

  // Once authorized, read the real "已关联货源数" from the same source /products uses.
  // Re-run whenever the active shop changes (multi-shop switcher).
  useEffect(() => {
    if (!isAuthorized) return;
    setBoundCount(null);
    setPublishedCount(null);
    void loadStats(shop.name);
  }, [isAuthorized, shop.name, loadStats]);

  const pullProductMirror = useCallback(async () => {
    const shopName = shop.name;
    const shopDomain = shop.domain;
    if (!shopName || !shopDomain) return null;

    setProductSyncState("syncing");
    try {
      const synced = await api.syncShopProducts(shopName);
      const status = await api.getShopStatus(shopDomain);
      const list = await api.getShopProducts(shopName).catch(() => []);
      const count = Math.max(
        synced.productCount ?? 0,
        status.productCount ?? 0,
        list.length
      );

      setMirrorProductCount(count);
      hydrateAuthorizedShop({
        name: status.shopName ?? shopName,
        domain: status.shopDomain ?? shopDomain,
        authorizedAt:
          fmtDate(locale, status.authorizedAt) || (shop.authorizedAt ?? ""),
        productCount: count,
      });
      setProductSyncState("done");
      return count;
    } catch {
      setProductSyncState("error");
      return null;
    }
  }, [
    shop.name,
    shop.domain,
    shop.authorizedAt,
    hydrateAuthorizedShop,
  ]);

  // After OAuth, backend auth status often lags product mirror — pull once automatically.
  useEffect(() => {
    if (!isAuthorized || !shop.name || !shop.domain) return;
    if (shop.productCount > 0) {
      setMirrorProductCount(shop.productCount);
      setProductSyncState("done");
      return;
    }
    if (syncAttemptedRef.current) return;
    syncAttemptedRef.current = true;
    void pullProductMirror();
  }, [isAuthorized, shop.name, shop.domain, shop.productCount, pullProductMirror]);

  // Re-check status + bound count so the async post-auth product sync can surface without a reload.
  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const pulled = await pullProductMirror();
      if (pulled == null) {
        const status = await api.getShopStatus(shop.domain);
        if (status.authorized) {
          hydrateAuthorizedShop({
            name: status.shopName ?? shop.name,
            domain: status.shopDomain ?? shop.domain,
            authorizedAt: fmtDate(locale, status.authorizedAt) || (shop.authorizedAt ?? ""),
            productCount: status.productCount ?? 0,
          });
          setMirrorProductCount(status.productCount ?? 0);
          await loadStats(status.shopName ?? shop.name);
        }
        showToast(t("authorize.toastProductCountFailed"));
        return;
      }
      await loadStats(shop.name);
    } catch {
      showToast(t("authorize.toastRefreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [
    refreshing,
    shop.domain,
    shop.name,
    shop.authorizedAt,
    hydrateAuthorizedShop,
    loadStats,
    pullProductMirror,
    showToast,
  ]);

  // Fallback connect on the return-landing page: reuse the shared launcher (validate → remember →
  // full-page navigate to the backend install → Shopify consent). No OAuth logic lives here.
  const startShopifyInstall = (explicitDomain?: string) => {
    const result = launchShopifyInstall(explicitDomain ?? shopDomainInput);
    if (!result.ok) {
      setEditingDomain(true);
      if (result.error) showToast(result.error);
    }
  };

  const authorizing = authStatus === "authorizing";
  const phase: Phase = isAuthorized
    ? "authorized"
    : !authSessionReady
      ? "restoring"
      : "unbound";
  const trimmedDomain = shopDomainInput.trim();
  const hasPrefilledShop = Boolean(savedShop) && !editingDomain && Boolean(trimmedDomain);
  const displayProductCount = mirrorProductCount ?? shop.productCount;
  const syncing = productSyncState === "syncing";
  const syncedProductLabel = formatSyncedProductLabel(
    t,
    productSyncState,
    displayProductCount
  );

  const trustSignals = [
    t("authorize.trustOfficial"),
    t("authorize.trustEncrypted"),
    t("authorize.trustReadOnly"),
    t("authorize.trustNoModify"),
  ];

  const capabilities = [
    { icon: Database, title: t("authorize.capSyncTitle"), desc: t("authorize.capSyncDesc") },
    { icon: LineChart, title: t("authorize.capAnalyzeTitle"), desc: t("authorize.capAnalyzeDesc") },
    { icon: Sparkles, title: t("authorize.capOptimizeTitle"), desc: t("authorize.capOptimizeDesc") },
    { icon: Boxes, title: t("authorize.capSupplyTitle"), desc: t("authorize.capSupplyDesc") },
  ];

  const { copilot, suggestions } = buildAssistant(t, phase, {
    shopName: shop.name,
    shopDomain: shop.domain,
    authorizedAt: shop.authorizedAt,
    productCount: displayProductCount,
    boundCount,
    productSyncState,
    canConnect: Boolean(trimmedDomain) && !authorizing,
    onConnect: () => startShopifyInstall(),
  });

  return (
    <WorkbenchShell
      sidebar={<StepSidebar />}
      rail={
        <AssistantRail
          assistantContent={
            <CopilotCard
              content={copilot}
              suggestions={suggestions}
              suggestionsKey={phase}
              variant="onboarding"
              heading={t("authorize.assistantHeading")}
              onNextAction={(action) => {
                if (action === "connect") startShopifyInstall();
              }}
            />
          }
        />
      }
    >
      <WorkbenchPanel
        title={t("authorize.pageTitle")}
        actions={
          isAuthorized ? (
            <Button
              variant="secondary"
              onClick={() => startShopifyInstall(shop.domain)}
            >
              <RefreshCw className="h-4 w-4" />
              {t("authorize.reauthorize")}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-brand" />
              {t("authorize.securityBadge")}
            </span>
          )
        }
      >
        <div className="space-y-4">
          <section className="rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
            <div className="border-b border-hairline px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  {t("authorize.connectTitle")}
                </h2>
                {phase === "authorized" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void refresh()}
                    disabled={refreshing}
                    className="h-7 w-7 shrink-0 px-0"
                    title={t("authorize.refreshSummary")}
                    aria-label={t("authorize.refreshAria")}
                  >
                    {refreshing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                {t("authorize.connectSubtitle")}
              </p>
            </div>

            <div className="px-5 py-5">
              <TwoStepProgress
                t={t}
                authorizing={authorizing}
                phase={phase}
                syncing={syncing}
              />

              {phase === "authorized" ? (
                <>
                  <ConnectSummary
                    t={t}
                    name={shop.name}
                    domain={shop.domain}
                    authorizedAt={shop.authorizedAt}
                    syncedProductLabel={syncedProductLabel}
                    boundCount={boundCount}
                    publishedCount={publishedCount}
                  />
                  {/* Primary next-step CTA: guide the user into sourcing right under the shop info. */}
                  <Link href={localePath(locale, "/products")} className="mt-3 block">
                    <Button className="w-full">
                      {t("authorize.goProducts")}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </>
              ) : phase === "restoring" ? (
                <RestoringBlock t={t} />
              ) : (
                <div className="mt-5 space-y-3">
                  {/* CTA-first: connecting is the hero action; domain is a secondary, prefilled field. */}
                  <Button
                    className="w-full"
                    onClick={() => startShopifyInstall()}
                    disabled={authorizing}
                  >
                    {authorizing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("authorize.authorizing")}
                      </>
                    ) : (
                      <>
                        <Link2 className="h-4 w-4" />
                        {hasPrefilledShop
                          ? t("authorize.connectDomain", { domain: trimmedDomain })
                          : t("authorize.connectShop")}
                      </>
                    )}
                  </Button>

                  {hasPrefilledShop ? (
                    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface-muted px-3 py-2">
                      <span className="min-w-0 truncate text-xs text-ink-muted">
                        {t("authorize.lastShopHint")}
                        <span className="font-medium text-ink">{trimmedDomain}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingDomain(true)}
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-link hover:text-link-hover hover:underline"
                      >
                        <Pencil className="h-3 w-3" />
                        {t("authorize.changeShop")}
                      </button>
                    </div>
                  ) : (
                    <Field
                      label={t("authorize.shopDomainLabel")}
                      hint={t("authorize.shopDomainHint")}
                    >
                      <div className="relative">
                        <Input
                          value={shopDomainInput}
                          onChange={(e) => setShopDomainInput(e.target.value)}
                          placeholder="your-store.myshopify.com"
                          disabled={authorizing}
                          className="pr-9"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-subtle">
                          <ShieldCheck className="h-4 w-4" />
                        </span>
                      </div>
                    </Field>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline px-5 py-3">
              {trustSignals.map((signal) => (
                <span
                  key={signal}
                  className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                  {signal}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 text-sm font-semibold text-ink">
              {t("authorize.afterConnectTitle")}
            </h3>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {capabilities.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-[var(--radius-card)] border border-hairline bg-surface px-3.5 py-3.5 shadow-card"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-accent">
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="mt-2.5 text-sm font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-hairline bg-surface px-3.5 py-3.5 shadow-card">
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-accent">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">
                  {t("authorize.dataUsageTitle")}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">
                  {t("authorize.dataUsageDesc")}
                </p>
              </div>
            </div>
            <Link
              href="#"
              className="shrink-0 text-xs font-medium text-link hover:text-link-hover hover:underline"
            >
              {t("authorize.learnMore")}
            </Link>
          </section>
        </div>
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

/** Builds the state-driven copilot content + guided suggestions (Phase A: fixed, real answers). */
function buildAssistant(
  t: TranslateFn,
  phase: Phase,
  ctx: {
    shopName: string;
    shopDomain: string;
    authorizedAt?: string;
    productCount: number;
    boundCount: number | null;
    productSyncState: ProductSyncState;
    canConnect: boolean;
    onConnect: () => void;
  }
): { copilot: AiPanelContent; suggestions: AssistantSuggestion[] } {
  const {
    shopName,
    shopDomain,
    authorizedAt,
    productCount,
    boundCount,
    productSyncState,
    canConnect,
  } = ctx;

  if (phase === "authorized") {
    const syncedLabel = formatSyncedProductLabel(t, productSyncState, productCount);
    const boundLabel =
      boundCount != null ? t("authorize.countWithUnit", { count: boundCount }) : t("authorize.loading");
    const syncedExplain =
      productSyncState === "done" && productCount === 0
        ? t("authorize.copilotDoneSyncedExplainEmpty")
        : productSyncState === "error" || productSyncState === "idle"
          ? t("authorize.copilotDoneSyncedExplainPending")
          : t("authorize.copilotDoneSyncedExplainDone");
    return {
      copilot: {
        title: t("authorize.copilotDoneTitle"),
        summary: t("authorize.copilotDoneSummary", { shopName, shopDomain }),
        bullets: [],
        metrics: [
          { label: t("authorize.statAuthorizedAt"), value: authorizedAt || "—" },
          { label: t("authorize.statSyncedProducts"), value: syncedLabel },
          { label: t("authorize.statBoundSources"), value: boundLabel },
          {
            label: t("authorize.statSuggestedNext"),
            value:
              boundCount != null && boundCount > 0
                ? t("authorize.copilotDoneNextOptimize")
                : t("authorize.copilotDoneNextLink"),
          },
        ],
        nextAction: {
          label: t("authorize.copilotDoneNextAction"),
          href: "/products",
          description:
            boundCount != null && boundCount > 0
              ? t("authorize.copilotDoneNextDescLinked", { count: boundCount })
              : t("authorize.copilotDoneNextDescEmpty"),
        },
      },
      suggestions: [
        {
          id: "next",
          q: t("authorize.copilotDoneSuggestNextQ"),
          a:
            boundCount != null && boundCount > 0
              ? t("authorize.copilotDoneSuggestNextAWithBound", { count: boundCount })
              : t("authorize.copilotDoneSuggestNextAEmpty"),
        },
        {
          id: "stats",
          q: t("authorize.copilotDoneSuggestStatsQ"),
          a: t("authorize.copilotDoneSuggestStatsA", {
            synced: syncedLabel,
            syncedExplain,
          }),
        },
        {
          id: "refresh",
          q: t("authorize.copilotDoneSuggestRefreshQ"),
          a: t("authorize.copilotDoneSuggestRefreshA"),
        },
      ],
    };
  }

  if (phase === "restoring") {
    return {
      copilot: {
        title: t("authorize.copilotRestoringTitle"),
        summary: t("authorize.copilotRestoringSummary"),
        bullets: [],
        metrics: [
          { label: t("authorize.copilotRestoringCurrentStep"), value: t("authorize.copilotRestoringStep") },
          { label: t("authorize.copilotRestoringEtaLabel"), value: t("authorize.copilotRestoringEta") },
        ],
      },
      suggestions: [
        {
          id: "doing",
          q: t("authorize.copilotRestoringSuggestDoingQ"),
          a: t("authorize.copilotRestoringSuggestDoingA"),
        },
        {
          id: "wait",
          q: t("authorize.copilotRestoringSuggestWaitQ"),
          a: t("authorize.copilotRestoringSuggestWaitA"),
        },
      ],
    };
  }

  return {
    copilot: {
      title: t("authorize.copilotStartTitle"),
      summary: t("authorize.copilotStartSummary"),
      bullets: [],
      metrics: [
        { label: t("authorize.copilotStartAuthMethodLabel"), value: t("authorize.copilotStartAuthMethod") },
        { label: t("authorize.copilotStartPermissionLabel"), value: t("authorize.copilotStartPermission") },
      ],
      nextAction: {
        label: canConnect ? t("authorize.copilotStartConnect") : t("authorize.copilotStartEnterDomain"),
        action: "connect",
        disabled: !canConnect,
        disabledReason: canConnect ? undefined : t("authorize.copilotStartDisabledReason"),
        description: canConnect ? t("authorize.copilotStartConnectDesc") : undefined,
      },
    },
    suggestions: [
      {
        id: "how",
        q: t("authorize.copilotStartSuggestHowQ"),
        a: t("authorize.copilotStartSuggestHowA"),
      },
      {
        id: "data",
        q: t("authorize.copilotStartSuggestDataQ"),
        a: t("authorize.copilotStartSuggestDataA"),
      },
      {
        id: "time",
        q: t("authorize.copilotStartSuggestTimeQ"),
        a: t("authorize.copilotStartSuggestTimeA"),
      },
    ],
  };
}

function TwoStepProgress({
  t,
  authorizing,
  phase,
  syncing,
}: {
  t: TranslateFn;
  authorizing: boolean;
  phase: Phase;
  syncing?: boolean;
}) {
  const connecting = authorizing || phase === "restoring";
  const authorized = phase === "authorized";
  const step1Done = authorized || connecting;
  const step2Active = connecting;
  const step2Done = authorized;

  return (
    <div className="flex items-center gap-3">
      <StepPill index={1} label={t("authorize.stepSelectShop")} done={step1Done} active={!step1Done} />
      {/* When authorized, the connector carries the "授权成功" status badge (centered over the line). */}
      <div className="relative flex flex-1 items-center">
        <span
          className={cn(
            "h-px w-full",
            authorized ? "bg-brand" : step1Done ? "bg-brand/40" : "bg-hairline"
          )}
        />
        {authorized ? (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex max-w-[80%] flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-full border border-[#D0E7D6] bg-[#E6F7EA] px-3 py-1 text-center text-xs font-medium leading-tight text-[#008849] shadow-card">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>{t("authorize.authSuccess")}</span>
            {syncing ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("authorize.authSuccessSyncing")}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      <StepPill
        index={2}
        label={t("authorize.stepAuthorize")}
        done={step2Done}
        active={step2Active}
        loading={connecting}
      />
    </div>
  );
}

function StepPill({
  index,
  label,
  done,
  active,
  loading,
}: {
  index: number;
  label: string;
  done: boolean;
  active: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
          done || active
            ? "bg-brand-accent text-white"
            : "border border-hairline-strong text-ink-subtle"
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          index
        )}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-xs font-medium",
          done || active ? "text-ink" : "text-ink-subtle"
        )}
        title={label}
      >
        {label}
      </span>
    </div>
  );
}

/** Post-redirect "接入中" state: real status restore, no fake scanning. */
function RestoringBlock({ t }: { t: TranslateFn }) {
  return (
    <div className="mt-5 rounded-[var(--radius-control)] border border-hairline bg-surface-muted px-4 py-4">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <Loader2 className="h-4 w-4 animate-spin text-[#325BE6]" />
        {t("authorize.restoringTitle")}
      </div>
      <ul className="mt-2.5 space-y-1.5 text-xs text-ink-muted">
        <li>· {t("authorize.restoringStep1")}</li>
        <li>· {t("authorize.restoringStep2")}</li>
        <li>· {t("authorize.restoringStep3")}</li>
      </ul>
    </div>
  );
}

/** Authorized state: real fields only (no orders / revenue, which have no reliable source yet). */
function ConnectSummary({
  t,
  name,
  domain,
  authorizedAt,
  syncedProductLabel,
  boundCount,
  publishedCount,
}: {
  t: TranslateFn;
  name: string;
  domain: string;
  authorizedAt?: string;
  syncedProductLabel: string;
  boundCount: number | null;
  publishedCount: number | null;
}) {
  return (
    <div className="mt-4 rounded-[var(--radius-control)] border border-hairline/80 bg-surface-muted/50 p-2.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SummaryStat label={t("authorize.statShop")} value={name} />
        <SummaryStat label={t("authorize.statDomain")} value={domain} />
        <SummaryStat label={t("authorize.statAuthorizedAt")} value={authorizedAt || "—"} />
        <SummaryStat label={t("authorize.statSyncedProducts")} value={syncedProductLabel} />
        <SummaryStat
          label={t("authorize.statBoundSources")}
          value={boundCount == null ? t("authorize.loading") : String(boundCount)}
        />
        <SummaryStat
          label={t("authorize.statPublished")}
          value={publishedCount == null ? t("authorize.loading") : String(publishedCount)}
        />
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-ink-subtle">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-ink">{value}</p>
    </div>
  );
}
