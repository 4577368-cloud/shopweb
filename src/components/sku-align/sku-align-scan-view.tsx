"use client";

import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchSidebar } from "@/components/workbench/workbench-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail, CopilotCard } from "@/components/workbench/assistant-rail";
import { AccountManagerRailFooter } from "@/components/account-manager/account-manager-contact-cta";
import { InfoCard } from "@/components/workbench/info-card";
import { ScanStage, type ScanTaskView } from "@/components/workbench/scan-stage";
import { SkuLogisticsEntryGate } from "@/components/sku-align/sku-logistics-entry-gate";
import type { AiPanelContent } from "@/lib/types";
import { useT } from "@/i18n/LocaleProvider";

export interface SkuAlignScanViewProps {
  breadcrumbs: { label: string; href?: string }[];
  scanCopilot: AiPanelContent;
  scanTasks: ScanTaskView[];
  scanRecent: string[];
  scanDone: boolean;
  onFinishToResult: () => void;
  shellProps: {
    assistantOpen: boolean;
    onAssistantOpenChange: (open: boolean) => void;
    assistantDefaultOpen: boolean;
  };
  panelProps: {
    assistantOpen: boolean;
    onAssistantToggle: () => void;
  };
}

export function SkuAlignScanView({
  breadcrumbs,
  scanCopilot,
  scanTasks,
  scanRecent,
  scanDone,
  onFinishToResult,
  shellProps,
  panelProps,
}: SkuAlignScanViewProps) {
  const t = useT();

  return (
    <WorkbenchShell
      sidebar={<WorkbenchSidebar />}
      rail={
        <AssistantRail
          assistantContent={
            <>
              <CopilotCard
                content={scanCopilot}
                onNextAction={(a) => {
                  if (a === "view") void onFinishToResult();
                }}
              />
              <InfoCard title={t("sku.scanInfoTitle")}>
                <ul className="space-y-1.5">
                  <li>{t("sku.scanInfo1")}</li>
                  <li>{t("sku.scanInfo2")}</li>
                  <li>{t("sku.scanInfo3")}</li>
                </ul>
              </InfoCard>
            </>
          }
          railFooter={<AccountManagerRailFooter context="sku" />}
        />
      }
      {...shellProps}
    >
      <WorkbenchPanel
        title={t("sku.title")}
        breadcrumbs={breadcrumbs}
        actions={scanDone ? <SkuLogisticsEntryGate /> : undefined}
        {...panelProps}
      >
        <ScanStage
          heading={t("sku.scanStageHeading")}
          description={t("sku.scanStageDesc")}
          tasks={scanTasks}
          recent={scanRecent}
          done={scanDone}
          onViewResult={() => void onFinishToResult()}
          className="pt-14 sm:pt-20"
        />
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}
