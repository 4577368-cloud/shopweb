"use client";

import { Check, Circle, Loader2 } from "@/lib/ui/icons";
import { motion } from "framer-motion";
import type { CeremonyStats } from "@/lib/sync/ceremony-progress";
import { displayStat } from "@/lib/sync/ceremony-progress";
import type { ProgressTask } from "@/lib/sync/launch-summary";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

function TaskIcon({ status }: { status: ProgressTask["status"] }) {
  if (status === "done") {
    return <Check className="h-3.5 w-3.5 text-emerald-600" />;
  }
  if (status === "running") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#325BE6]" />;
  }
  return <Circle className="h-3.5 w-3.5 text-slate-300" />;
}

function StatCell({
  label,
  value,
  total,
  sub,
  compact,
}: {
  label: string;
  value: number | string;
  total?: number;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-hairline/80 bg-surface-muted/30",
        compact ? "px-2.5 py-2" : "px-3 py-2"
      )}
    >
      <p className="text-[10px] text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
        {value}
        {total != null ? (
          <span className="text-xs font-normal text-ink-subtle"> / {total}</span>
        ) : null}
      </p>
      {sub ? <p className="mt-0.5 text-[10px] text-ink-subtle">{sub}</p> : null}
    </div>
  );
}

export function ProgressPanel({
  percent,
  tasks,
  stats,
  showFull,
  layout = "vertical",
  className,
}: {
  percent: number;
  tasks: ProgressTask[];
  stats: CeremonyStats;
  showFull: boolean;
  layout?: "vertical" | "horizontal";
  className?: string;
}) {
  const t = useT();
  const productsShown = displayStat(
    stats.productsInCeremony || stats.productsTotal,
    percent,
    showFull
  );
  const sourcesShown = displayStat(
    stats.sourceLinksConfirmed + stats.sourceLinksPending,
    percent,
    showFull
  );
  const skuShown = displayStat(stats.skuMapped, percent, showFull);
  const quotedShown = displayStat(stats.logisticsQuoted, percent, showFull);
  const confirmedShown = displayStat(stats.logisticsConfirmed, percent, showFull);

  const displayPercent = showFull ? 100 : percent;

  if (layout === "horizontal") {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex min-h-0 flex-col rounded-[var(--radius-card)] border border-hairline bg-surface p-3.5 shadow-card",
          className
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-xs font-medium text-ink-muted">{t("syncCeremony.progressTitle")}</p>
          <p className="text-lg font-semibold tabular-nums text-ink">{displayPercent}%</p>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <motion.div
            className="h-full rounded-full bg-[#90AAFF]"
            animate={{ width: `${displayPercent}%` }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCell
            label={t("syncCeremony.statProducts")}
            value={productsShown}
            total={stats.productsTotal}
            compact
          />
          <StatCell
            label={t("syncCeremony.statSources")}
            value={sourcesShown}
            total={stats.sourceLinksTotal}
            sub={t("syncCeremony.statSourcesConfirmed", {
              count: stats.sourceLinksConfirmed,
            })}
            compact
          />
          <StatCell label={t("syncCeremony.statSku")} value={skuShown} total={stats.skuTotal} compact />
          <StatCell
            label={t("syncCeremony.statLogistics")}
            value={confirmedShown}
            total={stats.logisticsTotal}
            sub={
              stats.logisticsQuoted > 0
                ? t("syncCeremony.statQuoted", { count: quotedShown })
                : undefined
            }
            compact
          />
        </div>

        <ul className="mt-auto flex gap-2 overflow-x-auto border-t border-hairline pt-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex min-w-[9.5rem] shrink-0 items-start gap-1.5 rounded-lg bg-surface-muted/20 px-2 py-1.5"
            >
              <TaskIcon status={task.status} />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[11px] leading-snug",
                    task.status === "running"
                      ? "font-medium text-ink"
                      : "text-ink-muted"
                  )}
                >
                  {task.label}
                </p>
                {task.detail ? (
                  <p className="text-[10px] tabular-nums text-ink-subtle">{task.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </motion.section>
    );
  }

  return (
    <motion.aside
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card"
    >
      <div className="flex items-end justify-between gap-2">
        <p className="text-xs font-medium text-ink-muted">{t("syncCeremony.progressTitle")}</p>
        <p className="text-2xl font-semibold tabular-nums text-ink">{displayPercent}%</p>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          className="h-full rounded-full bg-[#90AAFF]"
          animate={{ width: `${displayPercent}%` }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatCell label={t("syncCeremony.statProducts")} value={productsShown} total={stats.productsTotal} />
        <StatCell
          label={t("syncCeremony.statSources")}
          value={sourcesShown}
          total={stats.sourceLinksTotal}
          sub={t("syncCeremony.statSourcesConfirmed", {
            count: stats.sourceLinksConfirmed,
          })}
        />
        <StatCell label={t("syncCeremony.statSku")} value={skuShown} total={stats.skuTotal} />
        <StatCell
          label={t("syncCeremony.statLogistics")}
          value={confirmedShown}
          total={stats.logisticsTotal}
          sub={
            stats.logisticsQuoted > 0
              ? t("syncCeremony.statQuoted", { count: quotedShown })
              : undefined
          }
        />
      </div>

      <ul className="mt-3 space-y-2 border-t border-hairline pt-3">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-2">
            <TaskIcon status={task.status} />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-xs leading-snug",
                  task.status === "running"
                    ? "font-medium text-ink"
                    : "text-ink-muted"
                )}
              >
                {task.label}
              </p>
              {task.detail ? (
                <p className="text-[11px] tabular-nums text-ink-subtle">{task.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </motion.aside>
  );
}
