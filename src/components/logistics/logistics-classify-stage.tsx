"use client";

import {
  CheckCircle2,
  Circle,
  Loader2,
  Package,
  Scale,
  Sparkles,
  Truck,
} from "@/lib/ui/icons";
import { useT } from "@/i18n/LocaleProvider";
import type { LogisticsTranslate } from "@/lib/logistics/display";
import { cn } from "@/lib/utils";

type StageTaskStatus = "pending" | "running" | "done";

interface StageTask {
  id: string;
  label: string;
  status: StageTaskStatus;
  icon: typeof Package;
}

function TaskIcon({ status }: { status: StageTaskStatus }) {
  if (status === "running") {
    return <Loader2 className="h-4 w-4 animate-spin text-brand" />;
  }
  if (status === "done") {
    return <CheckCircle2 className="h-4 w-4 text-brand-strong" />;
  }
  return <Circle className="h-4 w-4 text-ink-subtle" />;
}

function deriveTasks(
  t: LogisticsTranslate,
  phase: "loading" | "classifying"
): StageTask[] {
  const bind: StageTaskStatus =
    phase === "loading" ? "running" : "done";
  const classify: StageTaskStatus =
    phase === "loading" ? "pending" : "running";
  const postal: StageTaskStatus = "pending";
  const plan: StageTaskStatus = "pending";

  if (phase === "classifying") {
    return [
      { id: "bind", label: t("logisticsClassify.taskBind"), status: "done", icon: Package },
      { id: "classify", label: t("logisticsClassify.taskClassify"), status: "running", icon: Sparkles },
      { id: "postal", label: t("logisticsClassify.taskPostal"), status: postal, icon: Scale },
      { id: "plan", label: t("logisticsClassify.taskPlan"), status: plan, icon: Truck },
    ];
  }

  return [
    { id: "bind", label: t("logisticsClassify.taskBind"), status: bind, icon: Package },
    { id: "classify", label: t("logisticsClassify.taskClassify"), status: classify, icon: Sparkles },
    { id: "postal", label: t("logisticsClassify.taskPostal"), status: postal, icon: Scale },
    { id: "plan", label: t("logisticsClassify.taskPlan"), status: plan, icon: Truck },
  ];
}

export function LogisticsClassifyStage({
  phase,
  productCount,
}: {
  phase: "loading" | "classifying";
  productCount?: number;
}) {
  const t = useT();
  const tasks = deriveTasks(t, phase);
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const pct = Math.round((doneCount / tasks.length) * 100);
  const runningTask = tasks.find((t) => t.status === "running");

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
        <div className="border-b border-hairline/80 bg-gradient-to-r from-brand-soft/60 via-white to-emerald-50/40 px-5 py-5">
          <div className="flex items-start gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-brand/15 bg-gradient-to-br from-brand-soft to-white shadow-sm">
              {!tasks.every((task) => task.status === "done") ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-2xl bg-brand/15" />
              ) : null}
              <Sparkles className="relative h-6 w-6 text-brand-strong" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-ink">
                {runningTask
                  ? t("logisticsClassify.stepInProgress", { step: runningTask.label })
                  : t("logisticsClassify.heading")}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-subtle">
                {t("logisticsClassify.description")}
                {productCount != null && productCount > 0
                  ? t("logisticsClassify.productCountSuffix", { count: productCount })
                  : ""}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="text-ink-subtle">{t("logisticsClassify.progressLabel")}</span>
              <span className="font-medium tabular-nums text-brand-strong">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-emerald-500 transition-all duration-500"
                style={{ width: `${Math.max(8, pct)}%` }}
              />
            </div>
          </div>
        </div>

        <ul className="divide-y divide-hairline/80 px-5 py-2">
          {tasks.map((task) => {
            const Icon = task.icon;
            return (
              <li
                key={task.id}
                className={cn(
                  "flex items-center gap-3 py-3 text-sm",
                  task.status === "running" && "text-ink",
                  task.status === "done" && "text-ink-subtle",
                  task.status === "pending" && "text-ink-subtle/70"
                )}
              >
                <TaskIcon status={task.status} />
                <Icon className="h-4 w-4 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1">{task.label}</span>
                {task.status === "running" ? (
                  <span className="shrink-0 text-[10px] font-medium text-brand-strong">
                    {t("logisticsClassify.inProgress")}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-center text-[11px] text-ink-subtle">
        {t("logisticsClassify.footnote")}
      </p>
    </div>
  );
}

/** Shown when user dismisses the stage but data is still loading in background. */
export function LogisticsClassifyStageCompact({
  phase,
}: {
  phase: "loading" | "classifying";
}) {
  const t = useT();

  return (
    <div className="flex items-center justify-center gap-2 rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-8 text-sm text-ink-subtle">
      <Loader2 className="h-4 w-4 animate-spin text-brand" />
      {phase === "classifying"
        ? t("logisticsClassify.compactClassifying")
        : t("logisticsClassify.compactLoading")}
    </div>
  );
}
