"use client";

import Link from "next/link";
import { ArrowRight, Crosshair } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SkuTodoItem {
  id: string;
  targetId: string;
  title: string;
  issueType: string;
  suggestion: string;
  actionLabel: "定位" | "查看差异" | "更换 SKU";
  actionKey: "locate" | "diff" | "swap";
}

interface SkuDecisionPanelProps {
  conclusion: string;
  statusLabel: string;
  statusTone?: "success" | "warning" | "info";
  todos: SkuTodoItem[];
  nextLabel: string;
  nextHref?: string;
  nextAction?: string;
  nextDisabled?: boolean;
  nextHint?: string;
  highlightedTodoId?: string;
  onTodoAction: (item: SkuTodoItem) => void;
  onNextAction?: (action: string) => void;
}

export function SkuDecisionPanel({
  conclusion,
  statusLabel,
  statusTone = "info",
  todos,
  nextLabel,
  nextHref,
  nextAction,
  nextDisabled,
  nextHint,
  highlightedTodoId,
  onTodoAction,
  onNextAction,
}: SkuDecisionPanelProps) {
  const tone =
    statusTone === "success"
      ? "success"
      : statusTone === "warning"
        ? "warning"
        : "info";

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-slate-200 bg-slate-50/80">
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        <section className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-slate-400">当前结论</p>
            <Badge variant={tone}>{statusLabel}</Badge>
          </div>
          <p className="mt-1.5 text-sm font-medium leading-5 text-slate-900">
            {conclusion}
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-400">优先处理项</p>
            <span className="text-[11px] text-slate-400">{todos.length} 项</span>
          </div>
          {todos.length === 0 ? (
            <p className="text-xs text-slate-500">暂无阻塞项。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {todos.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "py-2 first:pt-0 last:pb-0",
                    highlightedTodoId === item.id &&
                      "-mx-1 rounded bg-teal-50 px-1"
                  )}
                >
                  <p className="truncate text-xs font-medium text-slate-800">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                    <span className="text-slate-600">{item.issueType}</span>
                    {" · "}
                    {item.suggestion}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onTodoAction({
                          ...item,
                          actionKey: "locate",
                          actionLabel: "定位",
                        })
                      }
                      className="inline-flex h-6 items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
                    >
                      <Crosshair className="h-3 w-3" />
                      定位
                    </button>
                    {item.actionKey !== "locate" ? (
                      <button
                        type="button"
                        onClick={() => onTodoAction(item)}
                        className="inline-flex h-6 items-center rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
                      >
                        {item.actionLabel}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-teal-200 bg-white px-3 py-3">
          <p className="text-[11px] font-medium text-slate-400">下一步</p>
          {nextHint ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">{nextHint}</p>
          ) : null}
          <p className="mt-1 text-sm font-semibold text-slate-900">{nextLabel}</p>
          <div className="mt-2.5">
            {nextHref && !nextDisabled ? (
              <Link href={nextHref} className="block">
                <Button className="w-full">
                  {nextLabel}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Button
                className="w-full"
                disabled={nextDisabled || !nextAction}
                onClick={() => nextAction && onNextAction?.(nextAction)}
              >
                {nextLabel}
              </Button>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
