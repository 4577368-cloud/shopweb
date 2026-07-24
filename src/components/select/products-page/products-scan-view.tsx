"use client";

import type { ReactNode } from "react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { HubAwareSidebar } from "@/components/workbench/hub-aware-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail, CopilotCard } from "@/components/workbench/assistant-rail";
import { AiCopilotScanStage } from "@/components/workbench/ai-copilot-scan-stage";
import type { ScanTaskView } from "@/components/workbench/scan-stage";
import type { ScanSummaryStats } from "@/lib/scan/copilot-workflow";
import type { AiPanelContent } from "@/lib/types";
import { useT } from "@/i18n/LocaleProvider";

export interface ProductsScanViewProps {
  breadcrumbs: { label: string; href?: string }[];
  scanCopilot: AiPanelContent;
  scanDone: boolean;
  scanTasks: ScanTaskView[];
  scanStats: ScanSummaryStats;
  scanProgressPercent: number;
  onFinishToResult: () => void | Promise<void>;
  onExitScan: () => void;
  shellProps: {
    assistantOpen: boolean;
    onAssistantOpenChange: (open: boolean) => void;
    assistantDefaultOpen: boolean;
  };
  panelProps: {
    assistantOpen: boolean;
    onAssistantToggle: () => void;
  };
  pricingDrawer: ReactNode;
}

export function ProductsScanView({
  breadcrumbs,
  scanCopilot,
  scanDone,
  scanTasks,
  scanStats,
  scanProgressPercent,
  onFinishToResult,
  onExitScan,
  shellProps,
  panelProps,
  pricingDrawer,
}: ProductsScanViewProps) {
  const t = useT();

  return (
    <WorkbenchShell
      sidebar={<HubAwareSidebar />}
      rail={
        <AssistantRail
          assistantContent={
            <CopilotCard
              content={scanCopilot}
              onNextAction={(a) => {
                if (a === "view" && scanDone) void onFinishToResult();
              }}
            />
          }
        />
      }
      {...shellProps}
    >
      <WorkbenchPanel
        title={scanDone ? t("products.scanDoneTitle") : t("products.scanningTitle")}
        breadcrumbs={breadcrumbs}
        {...panelProps}
      >
        <AiCopilotScanStage
          tasks={scanTasks}
          stats={scanStats}
          progressPercent={scanProgressPercent}
          done={scanDone}
          onViewResult={() => void onFinishToResult()}
          onSkip={onExitScan}
        />
      </WorkbenchPanel>
      {pricingDrawer}
    </WorkbenchShell>
  );
}
