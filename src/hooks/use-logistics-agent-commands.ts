"use client";

import { useMemo, type MutableRefObject } from "react";
import type { LogisticsCommandPlan } from "@/lib/agents/logistics/command-schema";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface UseLogisticsAgentCommandsParams {
  batchAcceptCount: number;
  handleAcceptAllReady: (opts?: {
    onProgress?: (
      current: number,
      total: number,
      success: number,
      failed: number
    ) => void;
    isCancelled?: () => boolean;
  }) => Promise<void>;
  batchAcceptCancelRef: MutableRefObject<boolean>;
  t: TranslateFn;
}

export function useLogisticsAgentCommands({
  batchAcceptCount,
  handleAcceptAllReady,
  batchAcceptCancelRef,
  t,
}: UseLogisticsAgentCommandsParams) {
  const previewGenerators = useMemo(
    () => ({
      accept_all_ready: async (_plan: LogisticsCommandPlan) => {
        const total = batchAcceptCount;
        if (total === 0) {
          throw new Error(t("logistics.previewNoPending"));
        }
        return {
          sections: [
            {
              title: t("logistics.previewTitle", { total }),
              rows: [
                {
                  label: t("logistics.previewLabel"),
                  before: t("logistics.previewBefore"),
                  after: t("logistics.previewAfter"),
                },
              ],
            },
          ],
          impact: {
            scope: t("logistics.previewScope", { total }),
            durationHint: t("sku.confirmDuration", {
              seconds: Math.max(5, total * 2),
            }),
            reversible: false,
          },
          payload: { totalCount: total },
        };
      },
    }),
    [batchAcceptCount, t]
  );

  const commandExecutors = useMemo(
    () => ({
      accept_all_ready: async (payload: Record<string, unknown>) => {
        batchAcceptCancelRef.current = false;
        const onProgress = payload.onProgress as
          | ((
              current: number,
              total: number,
              success: number,
              failed: number
            ) => void)
          | undefined;
        await handleAcceptAllReady({
          onProgress,
          isCancelled: () => batchAcceptCancelRef.current,
        });
      },
    }),
    [batchAcceptCancelRef, handleAcceptAllReady]
  );

  return { previewGenerators, commandExecutors };
}
