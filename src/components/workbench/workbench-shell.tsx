"use client";

import type { ReactNode } from "react";
import { WorkspaceLayout } from "@/components/workbench/workspace-layout";

interface WorkbenchShellProps {
  /** Left rail — typically <StepSidebar />. */
  sidebar: ReactNode;
  /** Center column — typically <WorkbenchPanel /> (owns its own header/scroll/footer). */
  children: ReactNode;
  /** Right rail — typically <AssistantRail />. Omit to hide the rail entirely. */
  rail?: ReactNode;
  /**
   * Whether the assistant column is visible. When omitted with a {@link rail},
   * defaults to open (backward compatible). Pair with {@link onAssistantOpenChange}
   * or {@link useWorkspaceAssistant} for collapse/expand.
   */
  assistantOpen?: boolean;
  onAssistantOpenChange?: (open: boolean) => void;
  /** Uncontrolled initial open when {@link assistantOpen} is not passed. */
  assistantDefaultOpen?: boolean;
}

/**
 * Canonical workbench frame adapter over {@link WorkspaceLayout}.
 * Existing pages keep `{ sidebar, children, rail }`; pages that need collapse pass
 * {@code assistantOpen} / {@code onAssistantOpenChange}.
 */
export function WorkbenchShell({
  sidebar,
  children,
  rail,
  assistantOpen,
  onAssistantOpenChange,
  assistantDefaultOpen = true,
}: WorkbenchShellProps) {
  return (
    <WorkspaceLayout
      leftSidebar={sidebar}
      assistantPanel={rail}
      assistantOpen={assistantOpen}
      onAssistantOpenChange={onAssistantOpenChange}
      assistantDefaultOpen={assistantDefaultOpen}
    >
      {children}
    </WorkspaceLayout>
  );
}
