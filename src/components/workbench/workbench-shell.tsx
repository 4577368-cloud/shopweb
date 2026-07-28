"use client";

import type { ReactNode } from "react";
import { WorkspaceLayout } from "@/components/workbench/workspace-layout";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";

interface WorkbenchShellProps {
  /** Left rail — typically <StepSidebar />. Hidden automatically when embedded. */
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
 *
 * Embedded Admin: drops the in-app step rail (Shopify left nav already lists steps)
 * and hosts account + language in the top chrome.
 */
export function WorkbenchShell({
  sidebar,
  children,
  rail,
  assistantOpen,
  onAssistantOpenChange,
  assistantDefaultOpen = true,
}: WorkbenchShellProps) {
  const { isEmbedded } = useEmbeddedMode();

  return (
    <WorkspaceLayout
      leftSidebar={isEmbedded ? null : sidebar}
      assistantPanel={rail}
      assistantOpen={assistantOpen}
      onAssistantOpenChange={onAssistantOpenChange}
      assistantDefaultOpen={assistantDefaultOpen}
    >
      {children}
    </WorkspaceLayout>
  );
}
