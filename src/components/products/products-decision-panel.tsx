"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Crosshair } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export interface DecisionTodoItem {
  id: string;
  targetId: string;
  productName: string;
  issueType: string;
  suggestion: string;
  actionLabel: string;
  actionKey: "locate" | "search" | "view";
}

interface ProductsDecisionPanelProps {
  conclusion: string;
  statusLabel: string;
  statusTone?: "success" | "warning" | "info";
  todos: DecisionTodoItem[];
  nextLabel: string;
  nextHref?: string;
  nextAction?: string;
  nextDisabled?: boolean;
  highlightedTodoId?: string;
  onTodoAction: (item: DecisionTodoItem) => void;
  onNextAction?: (action: string) => void;
  onShowRule?: (kind: "match" | "judge") => void;
}

const statusVariant = {
  success: "success" as const,
  warning: "warning" as const,
  info: "info" as const,
};

export function ProductsDecisionPanel({
  conclusion,
  statusLabel,
  statusTone = "info",
  todos,
  nextLabel,
  nextHref,
  nextAction,
  nextDisabled,
  highlightedTodoId,
  onTodoAction,
  onNextAction,
  onShowRule,
}: ProductsDecisionPanelProps) {
  const t = useT();
  const [ruleOpen, setRuleOpen] = useState<"match" | "judge" | null>(null);

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-slate-200 bg-slate-50/80">
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        <section className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-slate-400">
              {t("productsDecision.currentConclusion")}
            </p>
            <Badge variant={statusVariant[statusTone]}>{statusLabel}</Badge>
          </div>
          <p className="mt-1.5 text-sm font-medium leading-5 text-slate-900">
            {conclusion}
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-medium text-slate-400">
              {t("productsDecision.todosTitle")}
            </p>
            <span className="text-[11px] text-slate-400">
              {t("productsDecision.todoCount", { count: todos.length })}
            </span>
          </div>
          {todos.length === 0 ? (
            <p className="text-xs text-slate-500">{t("productsDecision.noTodos")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {todos.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "py-2 first:pt-0 last:pb-0",
                    highlightedTodoId === item.id && "-mx-1 rounded px-1 bg-teal-50"
                  )}
                >
                  <p className="truncate text-xs font-medium text-slate-800">
                    {item.productName}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                    <span className="text-slate-600">{item.issueType}</span>
                    {" · "}
                    {item.suggestion}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onTodoAction({
                          ...item,
                          actionKey: "locate",
                          actionLabel: t("productsDecision.actionLocate"),
                        })
                      }
                      className="inline-flex h-6 items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
                    >
                      <Crosshair className="h-3 w-3" />
                      {t("productsDecision.locate")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onTodoAction(item)}
                      className="inline-flex h-6 items-center rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
                    >
                      {item.actionLabel}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-teal-200 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="text-[11px] font-medium text-slate-400">
            {t("productsDecision.nextStep")}
          </p>
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
                {!nextDisabled ? <ArrowRight className="h-4 w-4" /> : null}
              </Button>
            )}
          </div>
        </section>

        <div className="mt-auto space-y-1 px-0.5 pt-1">
          <button
            type="button"
            onClick={() => {
              setRuleOpen(ruleOpen === "match" ? null : "match");
              onShowRule?.("match");
            }}
            className="block text-[11px] text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            {t("productsDecision.viewMatchRules")}
          </button>
          <button
            type="button"
            onClick={() => {
              setRuleOpen(ruleOpen === "judge" ? null : "judge");
              onShowRule?.("judge");
            }}
            className="block text-[11px] text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            {t("productsDecision.viewJudgeRules")}
          </button>
          {ruleOpen === "match" ? (
            <p className="rounded border border-slate-100 bg-white px-2 py-1.5 text-[11px] leading-4 text-slate-500">
              {t("productsDecision.matchRuleHint")}
            </p>
          ) : null}
          {ruleOpen === "judge" ? (
            <p className="rounded border border-slate-100 bg-white px-2 py-1.5 text-[11px] leading-4 text-slate-500">
              {t("productsDecision.judgeRuleHint")}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
