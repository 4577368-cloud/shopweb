"use client";

import type { ReactNode } from "react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkspaceAssistant } from "@/hooks/use-workspace-assistant";

/**
 * Page-owned workbench composition (not layout primitives).
 *
 * | Slot | Owner | Typical use |
 * | --- | --- | --- |
 * | leftSidebar | shell default `StepSidebar` | workflow steps |
 * | mainHeader | `WorkbenchPanel` | title, CTA, **AssistantToggle** |
 * | topContext | page | summary / filters / status under header |
 * | mainContent | page | primary work surface |
 * | assistantContent | page → `AssistantRail` | context / advisor |
 * | strategyCards | page → `AssistantRail` | pricing / logistics / rules |
 *
 * Shell only owns columns + `assistantOpen`. Tabs, pricing, SKU tables stay page-private.
 */

export function useWorkbenchPage(pageKey: string, assistantDefaultOpen = true) {
  const { assistantOpen, setAssistantOpen, toggleAssistant } =
    useWorkspaceAssistant(pageKey, assistantDefaultOpen);

  return {
    assistantOpen,
    setAssistantOpen,
    toggleAssistant,
    /** Spread onto {@link WorkbenchShell}. */
    shellProps: {
      assistantOpen,
      onAssistantOpenChange: (open: boolean) => setAssistantOpen(open),
      assistantDefaultOpen,
    },
    /** Spread onto {@link WorkbenchPanel} when a right rail is present. */
    panelProps: {
      assistantOpen,
      onAssistantToggle: toggleAssistant,
    },
  };
}

export interface WorkbenchPageFrameProps {
  /** Persistence key for assistant open state (per page). */
  pageKey: string;
  /** Right rail — usually `<AssistantRail assistantContent={…} strategyCards={…} />`. */
  rail?: ReactNode;
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  assistantDefaultOpen?: boolean;
  /** Optional strip under the header (filters, metrics). Page-owned. */
  topContext?: ReactNode;
  children: ReactNode;
}

/**
 * Standard workbench page frame: StepSidebar + toggle-aware shell/panel.
 * Prefer this for new/simple pages; multi-phase pages can use {@link useWorkbenchPage} directly.
 */
export function WorkbenchPageFrame({
  pageKey,
  rail,
  title,
  description,
  breadcrumbs,
  actions,
  footer,
  maxWidth,
  assistantDefaultOpen = true,
  topContext,
  children,
}: WorkbenchPageFrameProps) {
  const wb = useWorkbenchPage(pageKey, assistantDefaultOpen);
  const hasRail = rail != null;

  return (
    <WorkbenchShell
      sidebar={<StepSidebar />}
      rail={rail}
      {...(hasRail ? wb.shellProps : {})}
    >
      <WorkbenchPanel
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        actions={actions}
        footer={footer}
        maxWidth={maxWidth}
        {...(hasRail ? wb.panelProps : {})}
      >
        {topContext ? <div className="mb-3">{topContext}</div> : null}
        {children}
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}
