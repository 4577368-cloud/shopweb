"use client";

import type { AiPanelContent } from "@/lib/types";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { AssistantRail, CopilotCard } from "@/components/workbench/assistant-rail";

interface AppShellProps {
  children: React.ReactNode;
  /** Default copilot content; ignored when {@link aside} is provided. */
  ai?: AiPanelContent;
  /** Custom right rail (overrides the default copilot rail). */
  aside?: React.ReactNode;
  onAlertClick?: (targetId: string) => void;
  onNextAction?: (action: string) => void;
  highlightedAlertId?: string;
}

/**
 * Backward-compatible adapter over the Step-3 workbench primitives. Existing pages keep calling
 * {@code <AppShell ai={...}>...} unchanged; internally it composes {@link WorkbenchShell} +
 * {@link StepSidebar} + {@link AssistantRail}/{@link CopilotCard}, so the whole app picks up the new
 * shell without per-page edits. Pages migrated in steps 4–6 use the primitives directly (with header,
 * sticky footer and custom rail cards) via {@code WorkbenchPanel}.
 */
export function AppShell({
  children,
  ai,
  aside,
  onAlertClick,
  onNextAction,
  highlightedAlertId,
}: AppShellProps) {
  return (
    <WorkbenchShell
      sidebar={<StepSidebar />}
      rail={
        aside ?? (
          <AssistantRail>
            <CopilotCard
              content={ai ?? { title: "", summary: "", bullets: [] }}
              onAlertClick={onAlertClick}
              onNextAction={onNextAction}
              highlightedAlertId={highlightedAlertId}
            />
          </AssistantRail>
        )
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--wb-gutter)] py-4">
        <div className="mx-auto w-full max-w-[1080px]">{children}</div>
      </div>
    </WorkbenchShell>
  );
}
