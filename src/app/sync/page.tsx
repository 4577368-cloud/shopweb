"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  CheckCircle2,
  CircleDot,
  Loader2,
  PackageCheck,
  SkipForward,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/layout/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SyncKindBadge } from "@/components/ui/status-badge";
import { mockSyncSummary } from "@/data/mock";
import { useOnboarding } from "@/context/onboarding-context";
import type { AiPanelContent } from "@/lib/types";

export default function SyncPage() {
  const {
    syncPhase,
    logisticsCompleted,
    startSync,
    shop,
    isAuthorized,
    skuReadyForNext,
  } = useOnboarding();

  const summary = mockSyncSummary;
  const phase =
    syncPhase === "completed"
      ? "completed"
      : syncPhase === "syncing"
        ? "syncing"
        : logisticsCompleted
          ? "ready"
          : "blocked";

  const ai: AiPanelContent = useMemo(() => {
    if (!isAuthorized) {
      return {
        title: "需先授权",
        summary: "请先完成店铺授权。",
        bullets: [],
        nextAction: { label: "去授权店铺", href: "/authorize" },
      };
    }
    if (phase === "blocked") {
      return {
        title: "前置未完成",
        summary: "物流配置尚未保存，无法执行同步。请先确认物流偏好。",
        bullets: [
          skuReadyForNext
            ? "SKU 对齐已达门槛"
            : "SKU 对齐仍有待处理项（可稍后补齐）",
          "缺少：物流方案与履约偏好",
        ],
        nextAction: { label: "去确认物流", href: "/logistics" },
        alerts: [
          {
            id: "need-logistics",
            text: "请先在确认物流页保存方案，再回到本页执行同步。",
          },
        ],
      };
    }
    if (phase === "ready" || phase === "syncing") {
      return {
        title: "准备同步",
        summary:
          "前置条件已满足。执行同步后，SKU 映射与物流配置将写入店铺。",
        bullets: [
          "将写入已确认的商品与 SKU 映射",
          "将启用已保存的默认物流方案",
          "同步过程约数秒（原型模拟）",
        ],
        nextAction: {
          label:
            phase === "syncing" ? "同步中…" : "开始同步到店铺",
          action: "sync",
          disabled: phase === "syncing",
          disabledReason: "正在写入店铺配置，请稍候。",
        },
      };
    }
    return {
      title: "同步已完成",
      summary:
        "映射与履约规则已生效。新订单将进入待采购队列；异常项可稍后单独处理。",
      bullets: [
        `${summary.linkedProducts} 个商品已关联`,
        `${summary.skippedProducts} 个跳过 · ${summary.exceptionCount} 个待处理异常`,
        "可返回工作台查看进度，或继续处理未确认商品",
      ],
      nextAction: { label: "返回工作台", href: "/" },
      alerts:
        summary.exceptionCount > 0
          ? [
              {
                id: "ex1",
                text: "Organic Cotton Tote Bag 印花色号仍标记异常，可回选品页处理。",
                targetId: undefined,
              },
            ]
          : undefined,
    };
  }, [isAuthorized, phase, skuReadyForNext, summary]);

  const primaryCta = () => {
    if (!isAuthorized) {
      return (
        <Link href="/authorize">
          <Button>去授权店铺</Button>
        </Link>
      );
    }
    if (phase === "blocked") {
      return (
        <Link href="/logistics">
          <Button>去确认物流</Button>
        </Link>
      );
    }
    if (phase === "ready") {
      return <Button onClick={startSync}>开始同步到店铺</Button>;
    }
    if (phase === "syncing") {
      return (
        <Button disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
          同步中…
        </Button>
      );
    }
    return (
      <Link href="/">
        <Button>返回工作台</Button>
      </Link>
    );
  };

  return (
    <AppShell
      ai={ai}
      onNextAction={(action) => {
        if (action === "sync") startSync();
      }}
    >
      <PageHeader
        title="同步到店铺"
        description={
          phase === "completed"
            ? "同步结果如下。成功项已生效；跳过与异常项需单独处理。"
            : phase === "ready" || phase === "syncing"
              ? "前置条件已满足，可以执行同步。"
              : "请先完成物流确认等前置步骤，再执行同步。"
        }
        breadcrumbs={[
          { label: "工作台", href: "/" },
          { label: "同步到店铺" },
        ]}
        actions={primaryCta()}
      />

      {phase === "blocked" ? (
        <Card className="mb-3 border-amber-200 bg-amber-50/40">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <CircleDot className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900">
                  前置未完成
                </h2>
                <Badge variant="warning">待确认</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                尚未保存物流配置。请先完成「确认物流」，再回到本页执行同步。
              </p>
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                <li>· 物流方案：未保存</li>
                <li>
                  · SKU 对齐：
                  {skuReadyForNext ? "已达门槛" : "仍有待处理项"}
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {phase === "ready" || phase === "syncing" ? (
        <Card className="mb-3 border-teal-200 bg-teal-50/40">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-800">
              {phase === "syncing" ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <PackageCheck className="h-7 w-7" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900">
                  {phase === "syncing" ? "正在同步" : "准备同步"}
                </h2>
                <Badge variant={phase === "syncing" ? "info" : "teal"}>
                  {phase === "syncing" ? "进行中" : "待执行"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {shop.name} 的商品映射与物流配置已就绪。点击「开始同步到店铺」写入配置。
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {phase === "completed" ? (
        <>
          <Card className="mb-3 border-emerald-200 bg-emerald-50/50">
            <CardContent className="flex items-center gap-4 py-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-900">
                    已完成同步
                  </h2>
                  <Badge variant="success">已完成</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {shop.name} 已于 {summary.completedAt}{" "}
                  完成映射同步。后续订单将自动进入待采购队列。
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="mb-3 grid grid-cols-4 gap-3">
            <MetricCard
              label="成功关联商品"
              value={summary.linkedProducts}
              tone="success"
            />
            <MetricCard
              label="成功上架同步"
              value={summary.listedProducts}
              tone="teal"
            />
            <MetricCard
              label="跳过"
              value={summary.skippedProducts}
              tone="warning"
            />
            <MetricCard
              label="待处理异常"
              value={summary.exceptionCount}
              tone="warning"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(
              [
                {
                  kind: "success" as const,
                  title: "已成功同步",
                  icon: PackageCheck,
                  items: summary.items.filter((i) => i.kind === "success"),
                },
                {
                  kind: "skipped" as const,
                  title: "跳过",
                  icon: SkipForward,
                  items: summary.items.filter((i) => i.kind === "skipped"),
                },
                {
                  kind: "exception" as const,
                  title: "待处理异常",
                  icon: AlertTriangle,
                  items: summary.items.filter((i) => i.kind === "exception"),
                },
              ] as const
            ).map((group) => (
              <Card key={group.kind}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <group.icon className="h-4 w-4 text-slate-500" />
                    <CardTitle>{group.title}</CardTitle>
                  </div>
                  <SyncKindBadge kind={group.kind} />
                </CardHeader>
                <CardContent className="space-y-2">
                  {group.items.length === 0 ? (
                    <p className="text-xs text-slate-400">无</p>
                  ) : (
                    group.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-md border border-slate-100 px-2.5 py-2"
                      >
                        <p className="text-xs font-medium text-slate-800">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {item.detail}
                        </p>
                        {group.kind === "exception" ? (
                          <Link href="/products" className="mt-1.5 inline-block">
                            <Button size="sm" variant="secondary">
                              去选品页处理
                            </Button>
                          </Link>
                        ) : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : null}

      {phase !== "completed" ? (
        <Card>
          <CardHeader>
            <CardTitle>同步将写入的内容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-600">
            <p>· 已确认的商品货源关联与 SKU 映射</p>
            <p>· 默认物流方案与轨迹回传开关</p>
            <p>· 新订单自动进入待采购队列的履约规则</p>
            <p className="text-slate-400">
              完成同步前，不会在本页展示「已生效」结果。
            </p>
          </CardContent>
        </Card>
      ) : null}
    </AppShell>
  );
}
