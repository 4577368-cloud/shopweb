"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  countAutoVsManual,
  DECISION_LABELS,
} from "@/lib/logistics/display";
import type { LogisticsDecisionStatus, LogisticsTypeCode } from "@/lib/types";

const QUEUE_ORDER: LogisticsDecisionStatus[] = [
  "pending_sku",
  "pending_postal_meta",
  "needs_review",
  "restricted",
];

const RISK_LABELS: Partial<Record<LogisticsTypeCode, string>> = {
  BATTERY_MAGNETIC: "带电/带磁",
  FOOD: "食品",
  BLADE: "刀具",
};

export function LogisticsAiPanel({
  decisionStatusCounts,
  highRiskTypes,
  skuReadyForNext,
  quoting,
  accepting,
  saving,
  onFocusStatus,
  onAcceptAllReady,
  onFetchQuotes,
  onSaveSync,
}: {
  decisionStatusCounts?: Record<LogisticsDecisionStatus, number>;
  highRiskTypes?: LogisticsTypeCode[];
  skuReadyForNext: boolean;
  quoting: boolean;
  accepting: boolean;
  saving: boolean;
  onFocusStatus: (status: LogisticsDecisionStatus) => void;
  onAcceptAllReady: () => void;
  onFetchQuotes: () => void;
  onSaveSync: () => void;
}) {
  const { auto, manual } = countAutoVsManual(decisionStatusCounts);
  const readyCount = decisionStatusCounts?.ready_for_quote ?? 0;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
        <h3 className="text-xs font-semibold text-ink">物流决策</h3>
        <p className="mt-2 text-xs text-ink">
          <span className="font-semibold tabular-nums">{auto}</span> 可自动
          <span className="mx-1 text-ink-subtle">·</span>
          <span className="font-semibold tabular-nums">{manual}</span> 需你处理
        </p>
      </section>

      <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
        <h3 className="text-xs font-semibold text-ink">问题队列</h3>
        <ul className="mt-2 space-y-1">
          {QUEUE_ORDER.map((status) => {
            const count = decisionStatusCounts?.[status] ?? 0;
            if (count <= 0) return null;
            return (
              <li key={status}>
                <button
                  type="button"
                  onClick={() => onFocusStatus(status)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-surface-muted"
                >
                  <span className="text-ink-muted">{DECISION_LABELS[status]}</span>
                  <span className="font-semibold tabular-nums text-ink">{count}</span>
                </button>
              </li>
            );
          })}
          {manual === 0 ? (
            <li className="px-2 py-1 text-xs text-ink-subtle">无待处理项</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
        <h3 className="text-xs font-semibold text-ink">批量动作</h3>
        <div className="mt-2 flex flex-col gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 justify-start text-xs"
            disabled={readyCount === 0 || accepting}
            onClick={onAcceptAllReady}
          >
            {accepting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            接受全部可报价 ({readyCount})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 justify-start text-xs"
            disabled={readyCount === 0 || quoting}
            onClick={onFetchQuotes}
          >
            {quoting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            拉取可报价线路 ({readyCount})
          </Button>
        </div>
      </section>

      {(highRiskTypes?.length ?? 0) > 0 || !skuReadyForNext ? (
        <section className="rounded-[var(--radius-card)] border border-amber-100 bg-amber-50/50 p-3">
          <h3 className="text-xs font-semibold text-amber-900">风险</h3>
          <ul className="mt-1.5 space-y-1 text-[11px] text-amber-900/90">
            {!skuReadyForNext ? (
              <li>部分商品 SKU 未齐，待SKU 项需先对齐</li>
            ) : null}
            {(highRiskTypes ?? []).map((t) => (
              <li key={t}>高风险类型: {RISK_LABELS[t] ?? t}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <Button
        size="sm"
        className={cn("h-9 w-full")}
        disabled={saving}
        onClick={onSaveSync}
      >
        {saving ? "保存中…" : "保存并进入同步"}
      </Button>
    </div>
  );
}
