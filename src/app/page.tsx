"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  PackageSearch,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/layout/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StepStatusBadge } from "@/components/ui/status-badge";
import { mockActivities } from "@/data/mock";
import { useOnboarding } from "@/context/onboarding-context";
import type { AiPanelContent } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

const levelDot = {
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

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
  } = useOnboarding();

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
    ? "去授权店铺"
    : !productsReadyForNext
      ? "继续：智能选品"
      : !skuReadyForNext
        ? "继续：SKU 对齐"
        : !logisticsCompleted
          ? "继续：确认物流"
          : syncPhase !== "completed"
            ? "继续：同步到店铺"
            : "查看同步结果";

  const ai: AiPanelContent = useMemo(() => {
    if (!isAuthorized) {
      return {
        title: "尚未授权",
        summary: "工作台入口是店铺授权。连接 Shopify 后才会同步商品与订单数据。",
        bullets: [
          "授权后自动同步商品与订单基础数据",
          "无需手动导入 CSV",
          "授权通常 1 分钟内完成",
        ],
        nextAction: { label: "去授权店铺", href: "/authorize" },
      };
    }
    return {
      title: "当前进度",
      summary: syncCompleted
        ? "开店流程已完成。可继续处理跳过项与异常项，或开始接单。"
        : "店铺已授权。按左侧流程完成选品确认、SKU 对齐、物流配置后执行同步。",
      bullets: [
        `已分析 ${overview.analyzedProducts} 个商品 · 匹配候选 ${overview.matchedProducts}`,
        productsReadyForNext
          ? "选品：高匹配已达进入下一步条件"
          : "选品：请批量确认高匹配商品",
        skuReadyForNext
          ? "SKU：待确认与冲突已处理达标"
          : "SKU：仍有待确认或冲突项",
        logisticsCompleted ? "物流：已保存" : "物流：待确认",
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
  ]);

  return (
    <AppShell ai={ai}>
      <PageHeader
        title="开店工作台"
        breadcrumbs={[{ label: "工作台" }]}
        actions={
          <Link href={nextHref === "/" ? "/sync" : nextHref}>
            <Button>
              {nextLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-4 gap-3">
        <MetricCard
          label="店铺授权"
          value={isAuthorized ? "已授权" : "待授权"}
          hint={
            isAuthorized
              ? shop.authorizedAt
                ? `授权于 ${shop.authorizedAt}`
                : "已连接"
              : "入口：/authorize"
          }
          tone={isAuthorized ? "success" : "warning"}
        />
        <MetricCard
          label="已分析商品"
          value={isAuthorized ? formatNumber(overview.analyzedProducts) : "—"}
          hint={isAuthorized ? `店铺共 ${shop.productCount} 个商品` : "授权后可见"}
          tone="teal"
        />
        <MetricCard
          label="已匹配商品"
          value={isAuthorized ? formatNumber(overview.matchedProducts) : "—"}
          hint="含高匹配与中匹配候选"
        />
        <MetricCard
          label="待确认商品"
          value={
            isAuthorized ? formatNumber(overview.pendingConfirmProducts) : "—"
          }
          hint={`${overview.needsConfirmSkus} 个 SKU 待核对`}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>流程进度</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                状态与左侧导航一致：进行中 / 待确认 / 已完成 / 异常
              </p>
            </div>
            <Badge variant="teal">
              {steps.filter((s) => s.status === "completed").length}/
              {steps.length} 步完成
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {steps.map((step) => (
              <Link
                key={step.id}
                href={step.href}
                className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2.5 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-50 text-xs font-semibold text-slate-600">
                    {step.order}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {step.title}
                    </p>
                    <p className="text-xs text-slate-500">{step.description}</p>
                  </div>
                </div>
                <StepStatusBadge status={step.status} />
              </Link>
            ))}
            <Link
              href="/sync"
              className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2.5 hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-50 text-xs font-semibold text-slate-600">
                  5
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    同步到店铺
                  </p>
                  <p className="text-xs text-slate-500">
                    写入映射与履约配置
                  </p>
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

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>系统已完成的工作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="flex items-start gap-2.5 text-xs text-slate-600">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-teal-700" />
                <span>
                  {isAuthorized
                    ? "已同步商品与订单权限，建立店铺连接。"
                    : "等待授权后同步商品与订单权限。"}
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-600">
                <PackageSearch className="mt-0.5 h-4 w-4 text-teal-700" />
                <span>
                  {isAuthorized
                    ? `已完成图搜与标题匹配，生成 ${overview.matchedProducts} 个货源候选。`
                    : "授权后自动执行图搜与标题匹配。"}
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-600">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-teal-700" />
                <span>
                  已预对齐 {overview.autoAlignedSkus} 个 SKU，
                  {overview.needsConfirmSkus} 个待确认。
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-600">
                <Clock3 className="mt-0.5 h-4 w-4 text-teal-700" />
                <span>
                  {logisticsCompleted
                    ? "物流配置已保存。"
                    : "已预计算 3 套物流方案，待确认偏好。"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>最近处理记录</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {(isAuthorized ? mockActivities : mockActivities.slice(0, 1)).map(
                (item) => (
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
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
