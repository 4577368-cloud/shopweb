"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
} from "@/lib/ui/icons";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/layout/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StepStatusBadge } from "@/components/ui/status-badge";
import { useOnboarding } from "@/context/onboarding-context";
import type { AiPanelContent } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

const levelDot = {
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

/** Map a workflow step id to its localized title/description key. */
function stepKeyFor(id: string): string {
  return id === "sku-align" ? "sku" : id;
}

export default function HomePage() {
  const {
    overview,
    steps,
    shop,
    syncCompleted,
    isAuthorized,
    logisticsCompleted,
    syncPhase,
    productsReadyForNext,
    skuReadyForNext,
    workflowBinding,
    shopStatusSummary,
    dashboardActivities,
  } = useOnboarding();
  const t = useT();
  const locale = useLocale();

  const nextHref = !isAuthorized
    ? "/authorize"
    : !productsReadyForNext
      ? "/products"
      : !skuReadyForNext
        ? "/sku-align"
        : !logisticsCompleted
          ? "/logistics"
          : syncPhase !== "completed"
            ? "/sync"
            : "/";

  const nextLabel = !isAuthorized
    ? t("home.nextAuthorize")
    : !productsReadyForNext
      ? t("home.nextProducts")
      : !skuReadyForNext
        ? t("home.nextSku")
        : !logisticsCompleted
          ? t("home.nextLogistics")
          : syncPhase !== "completed"
            ? t("home.nextSync")
            : t("home.nextResult");

  const ai: AiPanelContent = useMemo(() => {
    if (!isAuthorized) {
      return {
        title: t("home.aiUnauthorizedTitle"),
        summary: t("home.aiUnauthorizedSummary"),
        bullets: [
          t("home.aiBulletSync"),
          t("home.aiBulletNoCsv"),
          t("home.aiBulletFast"),
        ],
        nextAction: { label: t("home.nextAuthorize"), href: "/authorize" },
      };
    }
    return {
      title: t("home.aiAuthorizedTitle"),
      summary: syncCompleted
        ? t("home.aiAuthorizedSummaryDone")
        : t("home.aiAuthorizedSummaryPending"),
      bullets: [
        t("home.aiAnalyzedBullet", {
          analyzed: overview.analyzedProducts,
          matched: overview.matchedProducts,
        }),
        productsReadyForNext
          ? t("home.aiBulletProductsReady")
          : t("home.aiBulletProductsNotReady"),
        skuReadyForNext
          ? t("home.aiBulletSkuReady")
          : t("home.aiBulletSkuNotReady"),
        logisticsCompleted ? t("home.aiBulletLogisticsDone") : t("home.aiBulletLogisticsNotDone"),
      ],
      nextAction: {
        label: nextLabel,
        href: nextHref === "/" ? "/sync" : nextHref,
      },
    };
  }, [
    isAuthorized,
    logisticsCompleted,
    nextHref,
    nextLabel,
    overview,
    productsReadyForNext,
    skuReadyForNext,
    syncCompleted,
    t,
  ]);

  return (
    <AppShell ai={ai}>
      <PageHeader
        title={t("home.title")}
        breadcrumbs={[{ label: t("nav.workbench"), href: localePath(locale, "/") }]}
        actions={
          <Link href={localePath(locale, nextHref === "/" ? "/sync" : nextHref)}>
            <Button>
              {nextLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-4 gap-3">
        <MetricCard
          label={t("home.metricShopAuth")}
          value={isAuthorized ? t("home.metricAuthorized") : t("home.metricUnauthorized")}
          hint={
            isAuthorized
              ? shop.authorizedAt
                ? t("home.authorizedOn", { date: shop.authorizedAt })
                : t("home.hintAuthorized")
              : t("home.hintUnauthorized")
          }
          tone={isAuthorized ? "success" : "warning"}
        />
        <MetricCard
          label={t("home.metricAnalyzed")}
          value={isAuthorized ? formatNumber(overview.analyzedProducts) : "—"}
          hint={
            isAuthorized
              ? shopStatusSummary
                ? t("home.shopStatusHint", {
                    hint: shopStatusSummary.hint,
                    count: shop.productCount,
                  })
                : t("home.hintAnalyzed", { count: shop.productCount })
              : t("home.visibleAfterAuth")
          }
          tone="teal"
        />
        <MetricCard
          label={t("home.metricMatched")}
          value={isAuthorized ? formatNumber(overview.matchedProducts) : "—"}
          hint={
            isAuthorized && workflowBinding
              ? workflowBinding.unbound > 0 || workflowBinding.pending > 0
                ? t("home.matchedPendingHint", {
                    unbound: workflowBinding.unbound,
                    pending: workflowBinding.pending,
                  })
                : t("home.matchedHandled")
              : t("home.hintMatched")
          }
        />
        <MetricCard
          label={t("home.metricPending")}
          value={
            isAuthorized ? formatNumber(overview.pendingConfirmProducts) : "—"
          }
          hint={t("home.skuReviewHint", { count: overview.needsConfirmSkus })}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("home.flowProgressTitle")}</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("home.flowProgressHint")}
              </p>
            </div>
            <Badge variant="teal">
              {t("home.stepsDone", {
                done: steps.filter((s) => s.status === "completed").length,
                total: steps.length,
              })}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {steps.map((step) => (
              <Link
                key={step.id}
                href={localePath(locale, step.href)}
                className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2.5 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-50 text-xs font-semibold text-slate-600">
                    {step.order}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {t(`steps.${stepKeyFor(step.id)}.title`)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t(`steps.${stepKeyFor(step.id)}.desc`)}
                    </p>
                  </div>
                </div>
                <StepStatusBadge status={step.status} />
              </Link>
            ))}
            <Link
              href={localePath(locale, "/sync")}
              className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2.5 hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-50 text-xs font-semibold text-slate-600">
                  {steps.length + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {t("steps.sync.title")}
                  </p>
                  <p className="text-xs text-slate-500">{t("steps.sync.desc")}</p>
                </div>
              </div>
              <StepStatusBadge
                status={
                  syncCompleted
                    ? "completed"
                    : syncPhase === "ready" || syncPhase === "syncing"
                      ? "pending_confirm"
                      : "not_started"
                }
              />
            </Link>
          </CardContent>
        </Card>

        {dashboardActivities.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("home.activityTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {dashboardActivities.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 border-b border-slate-50 py-2.5 last:border-0"
                >
                  <div className="mt-1.5">
                    <span
                      className={`block h-1.5 w-1.5 rounded-full ${levelDot[item.level]}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-800">
                        {item.title}
                      </p>
                      <span className="text-[11px] text-slate-400">
                        {item.time}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
