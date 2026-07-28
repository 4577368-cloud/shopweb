"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { EmbeddedTopChrome } from "@/host/embedded/embedded-top-chrome";
import { cn } from "@/lib/utils";

export type WorkspaceMode = "with-assistant" | "focus";

export interface WorkspaceLayoutProps {
  /** Left process / nav column. Pass null/undefined to hide (embedded Admin). */
  leftSidebar?: ReactNode | null;
  /**
   * Center work surface — typically {@link WorkbenchPanel} (header + scroll body).
   * Owns its own scrolling; this shell only allocates the column.
   */
  children: ReactNode;
  /** Right AI assistant column. Omitted / empty → always focus (two-column) mode. */
  assistantPanel?: ReactNode;
  /**
   * Controlled open state. When omitted, uses internal state seeded by
   * {@link assistantDefaultOpen}. Prefer controlling via {@link useWorkspaceAssistant}.
   */
  assistantOpen?: boolean;
  onAssistantOpenChange?: (open: boolean) => void;
  /** Uncontrolled initial open when {@link assistantOpen} is not provided. Default true. */
  assistantDefaultOpen?: boolean;
  className?: string;
}

/**
 * Shared Tangbuy AI Copilot workspace frame: left nav + main + optional assistant.
 *
 * Modes:
 * - {@code with-assistant}: three columns (sidebar | main | rail)
 * - {@code focus}: two columns (sidebar | main) — assistant collapsed so main can widen
 *
 * Embedded Admin: no left rail (Shopify app nav owns steps); height fills the
 * iframe (`h-full`) instead of `h-screen` to avoid clipping under Admin chrome.
 */
export function WorkspaceLayout({
  leftSidebar,
  children,
  assistantPanel,
  assistantOpen: assistantOpenProp,
  assistantDefaultOpen = true,
  className,
}: WorkspaceLayoutProps) {
  const { isEmbedded } = useEmbeddedMode();
  const [uncontrolledOpen] = useState(assistantDefaultOpen);
  const isControlled = assistantOpenProp !== undefined;
  const assistantOpen = isControlled ? assistantOpenProp : uncontrolledOpen;

  const hasLeft = Boolean(leftSidebar);
  const hasAssistant = Boolean(assistantPanel);
  const mode: WorkspaceMode =
    hasAssistant && assistantOpen ? "with-assistant" : "focus";
  const showAssistant = mode === "with-assistant";

  let gridTemplateColumns: string;
  if (showAssistant && hasLeft) {
    gridTemplateColumns = "var(--wb-sidebar-w) minmax(0, 1fr) var(--wb-rail-w)";
  } else if (showAssistant) {
    gridTemplateColumns = "minmax(0, 1fr) var(--wb-rail-w)";
  } else if (hasLeft) {
    gridTemplateColumns = "var(--wb-sidebar-w) minmax(0, 1fr)";
  } else {
    gridTemplateColumns = "minmax(0, 1fr)";
  }

  return (
    <div
      className={cn(
        "grid min-h-0 overflow-hidden bg-canvas text-ink",
        // iframe: fill parent (Admin sizes the frame). 100vh overflows and clips.
        isEmbedded ? "h-full max-h-full" : "h-screen",
        className
      )}
      data-workspace-mode={mode}
      data-embedded={isEmbedded ? "1" : undefined}
      style={{ gridTemplateColumns }}
    >
      {hasLeft ? (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          {leftSidebar}
        </div>
      ) : null}
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {isEmbedded ? <EmbeddedTopChrome /> : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </main>
      {showAssistant ? (
        <div className="min-h-0 min-w-0 overflow-hidden">{assistantPanel}</div>
      ) : null}
    </div>
  );
}
