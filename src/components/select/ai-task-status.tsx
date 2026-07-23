"use client";

import { CheckCircle2, Loader2, RefreshCw } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";

/**
 * Top "AI task status" card for /products. Answers "AI 帮我做了什么、还剩什么".
 * Primary CTA lives only in the page header; refresh sits next to this card's title.
 */
export interface AiTaskStatusProps {
  ready: boolean;
  analyzed: number;
  /** bound = pending + confirmed (products AI has matched a source for) */
  matched: number;
  pending: number;
  confirmed: number;
  unbound: number;
  /** Re-run analysis (sync + auto-match). Rendered as icon-only next to the title. */
  onRefresh?: () => void;
}

export function AiTaskStatus({
  ready,
  analyzed,
  matched,
  pending,
  confirmed,
  unbound,
  onRefresh,
}: AiTaskStatusProps) {
  const t = useT();
  const pct = analyzed > 0 ? Math.round((matched / analyzed) * 100) : 0;
  const allDone = ready && analyzed > 0 && pending === 0 && unbound === 0;

  return (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
            {ready ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </span>
          <h2 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-ink transition-opacity duration-200">
            {ready ? t("productsAiTask.titleReady") : t("productsAiTask.titleRunning")}
          </h2>
          {onRefresh ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              className="h-8 w-8 shrink-0 px-0"
              title={t("productsAiTask.refreshTitle")}
              aria-label={t("productsAiTask.refreshAria")}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>

        <p className="mt-1.5 text-sm text-ink-muted transition-opacity duration-200">
          {ready ? (
            t("productsAiTask.summaryReady", { analyzed, matched, pending })
          ) : (
            t("productsAiTask.summaryRunning")
          )}
        </p>
      </div>

      <div className="mt-3.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500"
            style={{ width: `${ready ? pct : 0}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-subtle transition-opacity duration-200">
          <span>
            {ready
              ? t("productsAiTask.pctMatched", { pct })
              : t("productsAiTask.reading")}
            {allDone ? t("productsAiTask.sourcesReady") : ""}
          </span>
          <span>
            {t("productsAiTask.confirmed", { count: ready ? confirmed : "—" })}
          </span>
          <span>
            {t("productsAiTask.unbound", { count: ready ? unbound : "—" })}
          </span>
        </div>
      </div>
    </section>
  );
}
