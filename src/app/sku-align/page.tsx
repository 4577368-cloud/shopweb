"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/layout/metric-card";
import {
  SkuDecisionPanel,
  type SkuTodoItem,
} from "@/components/sku-align/sku-decision-panel";
import {
  SkuHandleBadge,
  SkuJudgmentBadge,
  SkuRowActions,
} from "@/components/sku-align/sku-row-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  isSkuResolved,
  useOnboarding,
} from "@/context/onboarding-context";
import type { SkuAlignment } from "@/lib/types";
import { cn } from "@/lib/utils";

type FilterKey =
  | "all"
  | "acceptable"
  | "needs_review"
  | "conflict"
  | "handled";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "acceptable", label: "可直接接受" },
  { key: "needs_review", label: "需核对" },
  { key: "conflict", label: "有冲突" },
  { key: "handled", label: "已处理" },
];

function matchesFilter(row: SkuAlignment, filter: FilterKey) {
  if (filter === "all") return true;
  if (filter === "handled") return isSkuResolved(row);
  if (filter === "acceptable") {
    return row.judgment === "acceptable" && row.handleStatus === "unhandled";
  }
  if (filter === "needs_review") {
    return (
      (row.judgment === "needs_review" || row.judgment === "blocked") &&
      !isSkuResolved(row)
    );
  }
  if (filter === "conflict") {
    return row.judgment === "conflict" && !isSkuResolved(row);
  }
  return true;
}

export default function SkuAlignPage() {
  const {
    skuAlignments,
    updateSkuStatus,
    swapSkuPlaceholder,
    batchConfirmReadySkus,
    skuReadyForNext,
    isAuthorized,
    productsReadyForNext,
    showToast,
  } = useOnboarding();

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [diffId, setDiffId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [highlightedTodoId, setHighlightedTodoId] = useState<string | undefined>();

  const stats = useMemo(() => {
    const acceptable = skuAlignments.filter(
      (s) => s.judgment === "acceptable" && s.handleStatus === "unhandled"
    ).length;
    const needs = skuAlignments.filter(
      (s) =>
        (s.judgment === "needs_review" || s.judgment === "blocked") &&
        !isSkuResolved(s)
    ).length;
    const conflict = skuAlignments.filter(
      (s) => s.judgment === "conflict" && !isSkuResolved(s)
    ).length;
    const handled = skuAlignments.filter((s) => isSkuResolved(s)).length;
    const unhandled = skuAlignments.filter((s) => !isSkuResolved(s)).length;
    return { acceptable, needs, conflict, handled, unhandled };
  }, [skuAlignments]);

  const filteredRows = useMemo(
    () => skuAlignments.filter((row) => matchesFilter(row, filter)),
    [skuAlignments, filter]
  );

  const handleAction = (id: string, action: string) => {
    if (action === "accept") updateSkuStatus(id, "confirmed");
    if (action === "skip") updateSkuStatus(id, "skipped");
    if (action === "flag") updateSkuStatus(id, "flagged");
    if (action === "swap") swapSkuPlaceholder(id);
    if (action === "edit") {
      setFocusedId(id);
      showToast("修改映射（演示占位，二期接映射编辑器）");
      updateSkuStatus(id, "needs_confirm");
    }
    if (action === "diff") {
      setDiffId(id);
      setFocusedId(id);
    }
  };

  const focusRow = (targetId: string, todoId?: string) => {
    setFocusedId(targetId);
    if (todoId) setHighlightedTodoId(todoId);
    document
      .getElementById(`sku-row-${targetId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const todos: SkuTodoItem[] = useMemo(() => {
    const items: SkuTodoItem[] = [];
    const conflict = skuAlignments.find(
      (s) => s.id === "sku7" && !isSkuResolved(s)
    );
    if (conflict) {
      items.push({
        id: "todo-sku7",
        targetId: "sku7",
        title: conflict.shopVariant.title,
        issueType: "容量偏差 9ml",
        suggestion: "建议查看差异",
        actionLabel: "查看差异",
        actionKey: "diff",
      });
    }
    const color = skuAlignments.find(
      (s) => s.id === "sku4" && !isSkuResolved(s)
    );
    if (color) {
      items.push({
        id: "todo-sku4",
        targetId: "sku4",
        title: color.shopVariant.title,
        issueType: "颜色映射不一致",
        suggestion: "建议修改映射",
        actionLabel: "查看差异",
        actionKey: "diff",
      });
    }
    const size = skuAlignments.find(
      (s) => s.id === "sku3" && !isSkuResolved(s)
    );
    if (size) {
      items.push({
        id: "todo-sku3",
        targetId: "sku3",
        title: size.shopVariant.title,
        issueType: "尺寸已换算",
        suggestion: "确认后接受",
        actionLabel: "查看差异",
        actionKey: "diff",
      });
    }
    return items.slice(0, 3);
  }, [skuAlignments]);

  const decision = useMemo(() => {
    if (!isAuthorized) {
      return {
        conclusion: "尚未连接店铺。",
        statusLabel: "待授权",
        statusTone: "warning" as const,
        nextLabel: "去授权店铺",
        nextHref: "/authorize",
      };
    }
    if (skuReadyForNext) {
      return {
        conclusion: "冲突与核对项已处理，可进入物流确认。",
        statusLabel: "可继续",
        statusTone: "success" as const,
        nextLabel: "进入物流确认",
        nextHref: "/logistics",
      };
    }
    if (stats.conflict > 0) {
      return {
        conclusion: `仍有 ${stats.unhandled} 项未处理，其中 ${stats.conflict} 项冲突须先处置。`,
        statusLabel: "有冲突",
        statusTone: "warning" as const,
        nextLabel: "批量接受可直接接受项",
        nextAction: "batch-confirm",
        nextHint:
          stats.acceptable > 0
            ? `可先批量接受 ${stats.acceptable} 条「可直接接受」，但有冲突时仍不能进入下一步。`
            : "请先处理冲突项。",
        nextDisabled: stats.acceptable === 0,
      };
    }
    return {
      conclusion: `仍有 ${stats.unhandled} 项未处理，暂不能进入物流确认。`,
      statusLabel: "待处理",
      statusTone: "warning" as const,
      nextLabel:
        stats.acceptable > 0
          ? "批量接受可直接接受项"
          : "处理完核对项后进入物流确认",
      nextAction: stats.acceptable > 0 ? "batch-confirm" : undefined,
      nextDisabled: stats.acceptable === 0,
      nextHint:
        stats.acceptable > 0
          ? `仅处理「可直接接受」共 ${stats.acceptable} 条；需核对项请逐条处置。`
          : undefined,
    };
  }, [isAuthorized, skuReadyForNext, stats]);

  const primaryHeader = skuReadyForNext ? (
    <Link href="/logistics">
      <Button>
        进入物流确认
        <ArrowRight className="h-4 w-4" />
      </Button>
    </Link>
  ) : (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={batchConfirmReadySkus}
        disabled={stats.acceptable === 0}
      >
        批量接受可直接接受项
      </Button>
      {stats.conflict > 0 && stats.acceptable > 0 ? (
        <p className="max-w-[240px] text-right text-[11px] text-slate-400">
          可批量接受 {stats.acceptable} 条，但仍有冲突，不能进入下一步
        </p>
      ) : stats.acceptable > 0 ? (
        <p className="text-[11px] text-slate-400">
          仅影响「可直接接受 · 未处理」行
        </p>
      ) : null}
    </div>
  );

  const aside = (
    <SkuDecisionPanel
      conclusion={decision.conclusion}
      statusLabel={decision.statusLabel}
      statusTone={decision.statusTone}
      todos={todos}
      nextLabel={decision.nextLabel}
      nextHref={decision.nextHref}
      nextAction={decision.nextAction}
      nextDisabled={decision.nextDisabled}
      nextHint={decision.nextHint}
      highlightedTodoId={highlightedTodoId}
      onTodoAction={(item) => {
        if (item.actionKey === "locate" || item.actionKey === "diff") {
          focusRow(item.targetId, item.id);
          if (item.actionKey === "diff") setDiffId(item.targetId);
          return;
        }
        if (item.actionKey === "swap") {
          swapSkuPlaceholder(item.targetId);
          focusRow(item.targetId, item.id);
        }
      }}
      onNextAction={(action) => {
        if (action === "batch-confirm") batchConfirmReadySkus();
      }}
    />
  );

  if (!isAuthorized) {
    return (
      <AppShell aside={aside}>
        <PageHeader
          title="SKU 对齐确认"
          description="请先完成店铺授权。"
          actions={
            <Link href="/authorize">
              <Button>去授权店铺</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell aside={aside}>
      <PageHeader
        title="SKU 对齐确认"
        description="先处理冲突与需核对项，再批量接受可直接接受的映射。完成后进入物流确认。"
        breadcrumbs={[
          { label: "工作台", href: "/" },
          { label: "智能选品", href: "/products" },
          { label: "SKU 对齐" },
        ]}
        actions={primaryHeader}
      />

      {!productsReadyForNext ? (
        <div className="mb-3 rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-600">
          选品尚未达标。可继续处理本页已解锁 SKU，或返回
          <Link href="/products" className="mx-1 font-medium text-teal-700 underline">
            智能选品
          </Link>
          。
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-4 gap-3">
        {(
          [
            {
              key: "acceptable" as FilterKey,
              label: "可直接接受",
              value: stats.acceptable,
              tone: "teal" as const,
            },
            {
              key: "needs_review" as FilterKey,
              label: "需核对",
              value: stats.needs,
              tone: "warning" as const,
            },
            {
              key: "conflict" as FilterKey,
              label: "有冲突",
              value: stats.conflict,
              tone: "warning" as const,
            },
            {
              key: "handled" as FilterKey,
              label: "已处理",
              value: stats.handled,
              tone: "success" as const,
            },
          ] as const
        ).map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setFilter(card.key)}
            className={cn(
              "rounded-lg text-left transition-shadow",
              filter === card.key && "ring-2 ring-teal-600 ring-offset-1"
            )}
          >
            <MetricCard
              label={card.label}
              value={card.value}
              tone={card.tone}
              hint="点击筛选"
            />
          </button>
        ))}
      </div>

      {diffId ? (
        <Card className="mb-3 border-slate-300">
          <CardHeader>
            <CardTitle>差异对照</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setDiffId(null)}>
              关闭
            </Button>
          </CardHeader>
          <CardContent className="text-xs text-slate-600">
            {(() => {
              const row = skuAlignments.find((s) => s.id === diffId);
              if (!row) return null;
              return (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium text-slate-800">店铺 Variant</p>
                    <p className="mt-1">{row.shopVariant.title}</p>
                    <p className="text-slate-400">{row.shopVariant.options}</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">货源 SKU</p>
                    <p className="mt-1">{row.sourceSku.title}</p>
                    <p className="text-slate-400">{row.sourceSku.options}</p>
                  </div>
                  <p className="col-span-2 font-medium text-slate-800">
                    {row.diffSummary ?? "—"}
                  </p>
                  {row.systemHint ? (
                    <p className="col-span-2 text-[11px] text-slate-400">
                      {row.systemHint}
                    </p>
                  ) : null}
                  <div className="col-span-2 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        updateSkuStatus(row.id, "confirmed");
                        setDiffId(null);
                      }}
                    >
                      接受此映射
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        swapSkuPlaceholder(row.id);
                        setDiffId(null);
                      }}
                    >
                      更换 SKU
                    </Button>
                    {row.judgment === "conflict" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          updateSkuStatus(row.id, "flagged");
                          setDiffId(null);
                        }}
                      >
                        标记异常
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-400">
          显示 {filteredRows.length} / {skuAlignments.length}
        </span>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>规格映射表</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              判定结果 = 系统判断 · 处理状态 = 你是否已处置
            </p>
          </div>
          <Badge variant="outline">{filteredRows.length} 条</Badge>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[15%]">店铺商品</TableHead>
                <TableHead className="w-[16%]">Shopify Variant</TableHead>
                <TableHead className="w-[16%]">货源 SKU</TableHead>
                <TableHead>判定结果</TableHead>
                <TableHead>处理状态</TableHead>
                <TableHead className="w-[18%]">差异摘要</TableHead>
                <TableHead className="w-[140px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow
                  key={row.id}
                  id={`sku-row-${row.id}`}
                  data-focused={focusedId === row.id}
                  className={cn(
                    row.judgment === "acceptable" &&
                      row.handleStatus === "unhandled" &&
                      "bg-slate-50/50",
                    (row.judgment === "needs_review" ||
                      row.judgment === "conflict") &&
                      row.handleStatus === "unhandled" &&
                      "bg-amber-50/20"
                  )}
                >
                  <TableCell>
                    <p className="text-xs font-medium text-slate-800">
                      {row.shopProductTitle}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-medium text-slate-800">
                      {row.shopVariant.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {row.shopVariant.sku}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-medium text-slate-800">
                      {row.sourceSku.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {row.sourceSku.sku}
                    </p>
                  </TableCell>
                  <TableCell>
                    <SkuJudgmentBadge judgment={row.judgment} />
                    {row.systemHint && row.handleStatus === "unhandled" ? (
                      <p className="mt-1 max-w-[120px] text-[10px] leading-tight text-slate-400">
                        {row.systemHint}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <SkuHandleBadge handle={row.handleStatus} />
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-medium text-slate-700">
                      {row.diffSummary ?? "—"}
                    </p>
                    {row.judgment === "conflict" ||
                    row.judgment === "needs_review" ? (
                      <button
                        type="button"
                        className="mt-0.5 text-[11px] text-teal-700 underline-offset-2 hover:underline"
                        onClick={() => handleAction(row.id, "diff")}
                      >
                        查看差异
                      </button>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <SkuRowActions row={row} onAction={handleAction} />
                  </TableCell>
                </TableRow>
              ))}
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-xs text-slate-400"
                  >
                    当前筛选下无记录
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
