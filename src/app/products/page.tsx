"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/layout/metric-card";
import { MatchCompareRow } from "@/components/products/match-compare-row";
import {
  ProductsDecisionPanel,
  type DecisionTodoItem,
} from "@/components/products/products-decision-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  HIGH_MATCH_THRESHOLD,
  MEDIUM_MATCH_THRESHOLD,
} from "@/data/mock";
import {
  isProductResolved,
  useOnboarding,
} from "@/context/onboarding-context";

export default function ProductsPage() {
  const {
    productMatches,
    overview,
    updateProductStatus,
    batchConfirmHighMatches,
    productsReadyForNext,
    isAuthorized,
    showToast,
  } = useOnboarding();

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [highlightedTodoId, setHighlightedTodoId] = useState<string | undefined>();

  const stats = useMemo(() => {
    const confirmed = productMatches.filter(
      (p) => p.status === "confirmed"
    ).length;
    const pending = productMatches.filter(
      (p) => !isProductResolved(p.status)
    ).length;
    const low = productMatches.filter(
      (p) =>
        p.matchScore < MEDIUM_MATCH_THRESHOLD || p.status === "needs_review"
    ).length;
    const highPending = productMatches.filter(
      (p) =>
        p.matchScore >= HIGH_MATCH_THRESHOLD && !isProductResolved(p.status)
    ).length;
    return { confirmed, pending, low, highPending };
  }, [productMatches]);

  const decision = useMemo(() => {
    if (!isAuthorized) {
      return {
        conclusion: "尚未连接店铺，请先完成授权。",
        statusLabel: "待授权",
        statusTone: "warning" as const,
        todos: [] as DecisionTodoItem[],
        nextLabel: "去授权店铺",
        nextHref: "/authorize",
      };
    }

    if (productsReadyForNext) {
      return {
        conclusion: "已满足进入 SKU 对齐条件，可继续下一步。",
        statusLabel: "可继续",
        statusTone: "success" as const,
        todos: buildTodos(productMatches).slice(0, 3),
        nextLabel: "进入 SKU 对齐",
        nextHref: "/sku-align",
      };
    }

    if (stats.highPending > 0) {
      return {
        conclusion: `还有 ${stats.highPending} 个高匹配待采用，建议先批量确认。`,
        statusLabel: "待确认",
        statusTone: "warning" as const,
        todos: buildTodos(productMatches).slice(0, 3),
        nextLabel: "批量确认高匹配商品",
        nextAction: "batch-confirm",
      };
    }

    if (stats.pending > 0) {
      return {
        conclusion: `当前还有 ${stats.pending} 个待决策商品，建议先处理异常项。`,
        statusLabel: "待决策",
        statusTone: "warning" as const,
        todos: buildTodos(productMatches).slice(0, 3),
        nextLabel: "批量确认高匹配商品",
        nextAction: "batch-confirm",
        nextDisabled: stats.highPending === 0,
      };
    }

    return {
      conclusion: "高匹配商品已采用，可进入后续规格确认。",
      statusLabel: "已完成",
      statusTone: "success" as const,
      todos: [] as DecisionTodoItem[],
      nextLabel: "进入 SKU 对齐",
      nextHref: "/sku-align",
    };
  }, [
    isAuthorized,
    productMatches,
    productsReadyForNext,
    stats.highPending,
    stats.pending,
  ]);

  const focusRow = (targetId: string, todoId?: string) => {
    setFocusedId(targetId);
    if (todoId) setHighlightedTodoId(todoId);
    document
      .getElementById(`product-row-${targetId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleRowAction = (id: string, action: string) => {
    if (action === "confirm") updateProductStatus(id, "confirmed");
    if (action === "defer") updateProductStatus(id, "deferred");
    if (action === "flag") updateProductStatus(id, "flagged");
    if (action === "view") {
      setFocusedId(id);
      showToast("查看详情（演示占位，二期接对照详情抽屉）");
    }
    if (action === "swap") {
      setFocusedId(id);
      showToast("更换候选（演示占位，二期接货源候选列表）");
    }
    if (action === "search") {
      setFocusedId(id);
      showToast("查看候选（演示占位，二期接搜索/候选）");
    }
  };

  const handleTodoAction = (item: DecisionTodoItem) => {
    focusRow(item.targetId, item.id);
    if (item.actionKey === "locate") return;
    if (item.actionKey === "view") {
      showToast("查看详情（演示占位）");
      return;
    }
    if (item.actionKey === "search") {
      showToast("查看候选（演示占位）");
    }
  };

  const decisionAside = (
    <ProductsDecisionPanel
      conclusion={decision.conclusion}
      statusLabel={decision.statusLabel}
      statusTone={decision.statusTone}
      todos={decision.todos}
      nextLabel={decision.nextLabel}
      nextHref={decision.nextHref}
      nextAction={decision.nextAction}
      nextDisabled={decision.nextDisabled}
      highlightedTodoId={highlightedTodoId}
      onTodoAction={handleTodoAction}
      onNextAction={(action) => {
        if (action === "batch-confirm") batchConfirmHighMatches();
      }}
    />
  );

  if (!isAuthorized) {
    return (
      <AppShell aside={decisionAside}>
        <PageHeader
          title="智能选品"
          description="请先完成店铺授权，系统才会加载商品匹配结果。"
          breadcrumbs={[
            { label: "授权店铺", href: "/authorize" },
            { label: "智能选品" },
          ]}
          actions={
            <Link href="/authorize">
              <Button>去授权店铺</Button>
            </Link>
          }
        />
        <Card>
          <CardContent className="py-10 text-sm text-slate-500">
            授权完成后，此处将展示店铺商品与推荐货源的对照决策列表。
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell aside={decisionAside}>
      <PageHeader
        title="智能选品"
        description="判断是否采用 Tangbuy 推荐货源。对照售价、成本、起订量、库存与匹配度后做决定。"
        breadcrumbs={[
          { label: "工作台", href: "/" },
          { label: "智能选品" },
        ]}
        actions={
          productsReadyForNext ? (
            <Link href="/sku-align">
              <Button>
                进入 SKU 对齐
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Button
              onClick={batchConfirmHighMatches}
              disabled={stats.highPending === 0 && !productsReadyForNext}
            >
              批量确认高匹配商品
            </Button>
          )
        }
      />

      <div className="mb-3 grid grid-cols-4 gap-3">
        <MetricCard
          label="已分析商品"
          value={overview.analyzedProducts}
          tone="teal"
        />
        <MetricCard label="已采用" value={stats.confirmed} tone="success" />
        <MetricCard label="待决策" value={stats.pending} tone="warning" />
        <MetricCard label="低置信度" value={stats.low} tone="warning" />
      </div>

      <div className="mb-3 flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-600">
        <span>
          已采用 <strong className="text-slate-900">{stats.confirmed}</strong> 条
        </span>
        <span className="text-slate-300">|</span>
        <span>
          待决策 <strong className="text-slate-900">{stats.pending}</strong> 条
        </span>
        <span className="text-slate-300">|</span>
        <span>
          高匹配待确认{" "}
          <strong className="text-slate-900">{stats.highPending}</strong> 条
        </span>
        {productsReadyForNext ? (
          <span className="ml-auto text-teal-700">
            已达进入下一步条件，可进入 SKU 对齐
          </span>
        ) : (
          <span className="ml-auto text-slate-400">
            至少采用半数高匹配商品后，可进入 SKU 对齐
          </span>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            商品对照列表
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            左：店铺商品 · 右：推荐货源 · 中间为匹配关系
          </p>
        </div>
        <Badge variant="outline">{productMatches.length} 条对照</Badge>
      </div>

      <div className="space-y-2.5">
        {productMatches.map((item) => (
          <MatchCompareRow
            key={item.id}
            item={item}
            focused={focusedId === item.id}
            onAction={handleRowAction}
          />
        ))}
      </div>
    </AppShell>
  );
}

function buildTodos(
  matches: ReturnType<typeof useOnboarding>["productMatches"]
): DecisionTodoItem[] {
  const todos: DecisionTodoItem[] = [];

  const tote = matches.find((m) => m.id === "pm5" && !isProductResolved(m.status));
  if (tote) {
    todos.push({
      id: "todo-pm5",
      targetId: "pm5",
      productName: tote.shopProduct.title,
      issueType: "图样不一致",
      suggestion: "建议查看候选",
      actionLabel: "查看候选",
      actionKey: "search",
    });
  }

  const calendar = matches.find(
    (m) => m.id === "pm7" && !isProductResolved(m.status)
  );
  if (calendar) {
    todos.push({
      id: "todo-pm7",
      targetId: "pm7",
      productName: calendar.shopProduct.title,
      issueType: "年份不一致",
      suggestion: "暂不直接采用",
      actionLabel: "查看候选",
      actionKey: "search",
    });
  }

  const bamboo = matches.find(
    (m) => m.id === "pm4" && !isProductResolved(m.status)
  );
  if (bamboo) {
    todos.push({
      id: "todo-pm4",
      targetId: "pm4",
      productName: bamboo.shopProduct.title,
      issueType: "库存偏低",
      suggestion: "建议先查看详情",
      actionLabel: "查看详情",
      actionKey: "view",
    });
  }

  return todos;
}
