"use client";

import Link from "next/link";
import type { ComponentProps, RefObject } from "react";
import { LogisticsDecisionList } from "@/components/logistics/logistics-decision-list";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import { useT } from "@/i18n/LocaleProvider";

export interface LogisticsDecisionWorkspaceProps
  extends ComponentProps<typeof LogisticsDecisionList> {
  listRef: RefObject<HTMLDivElement | null>;
  skuUnlinkedCount: number;
  pipelineRunning: boolean;
  pipelineProgress: LogisticsPipelineProgress;
}

/** Estimate / confirm: SKU warning, decision list, incremental pipeline overlay. */
export function LogisticsDecisionWorkspace({
  listRef,
  skuUnlinkedCount,
  pipelineRunning,
  pipelineProgress,
  ...listProps
}: LogisticsDecisionWorkspaceProps) {
  const t = useT();

  return (
    <div ref={listRef} className="scroll-mt-4">
      {skuUnlinkedCount > 0 ? (
        <div className="mb-4 rounded-[var(--radius-card)] border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          <Link href="/sku-align" className="font-medium text-amber-700 underline">
            {t("logistics.pendingSkuWarning", { count: skuUnlinkedCount })}
          </Link>
        </div>
      ) : null}
      <div className="relative">
        <LogisticsDecisionList {...listProps} />
        {pipelineRunning && pipelineProgress.productTotal > 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-surface/60 backdrop-blur-[1px]">
            <div className="w-full max-w-xs space-y-3 px-4">
              <div className="text-center text-sm font-medium text-ink">
                {t("logistics.pipelineRunningTitle")}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-[#90AAFF] transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (pipelineProgress.productIndex /
                        pipelineProgress.productTotal) *
                        100
                    )}%`,
                  }}
                />
              </div>
              <div className="text-center text-xs text-ink-subtle">
                {t("logistics.pipelineRunningProgress", {
                  current: pipelineProgress.productIndex,
                  total: pipelineProgress.productTotal,
                  title: pipelineProgress.currentProductTitle ?? "",
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
