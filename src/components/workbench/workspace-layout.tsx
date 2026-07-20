"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type WorkspaceMode = "with-assistant" | "focus";

export interface WorkspaceLayoutProps {
  /** Left process / nav column. */
  leftSidebar: ReactNode;
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
 * Page composition: use {@link useWorkbenchPage} / {@link WorkbenchPageFrame} for toggle wiring,
 * and {@link AssistantRail} slots (`assistantContent` / `strategyCards`) for rail content.
 * Toggle belongs in the center header ({@link AssistantToggle}), not inside the rail.
 */
export function WorkspaceLayout({
  leftSidebar,
  children,
  assistantPanel,
  assistantOpen: assistantOpenProp,
  assistantDefaultOpen = true,
  className,
}: WorkspaceLayoutProps) {
  const [uncontrolledOpen] = useState(assistantDefaultOpen);
  const isControlled = assistantOpenProp !== undefined;
  const assistantOpen = isControlled ? assistantOpenProp : uncontrolledOpen;

  const hasAssistant = Boolean(assistantPanel);
  const mode: WorkspaceMode =
    hasAssistant && assistantOpen ? "with-assistant" : "focus";
  const showAssistant = mode === "with-assistant";

  return (
    <div
      className={cn(
        "grid h-screen min-h-0 overflow-hidden bg-canvas text-ink",
        className
      )}
      data-workspace-mode={mode}
      style={{
        gridTemplateColumns: showAssistant
          ? "var(--wb-sidebar-w) minmax(0, 1fr) var(--wb-rail-w)"
          : "var(--wb-sidebar-w) minmax(0, 1fr)",
      }}
    >
      <div className="min-h-0 min-w-0 overflow-hidden">{leftSidebar}</div>
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {children}
      </main>
      {showAssistant ? (
        <div className="min-h-0 min-w-0 overflow-hidden">{assistantPanel}</div>
      ) : null}
    </div>
  );
}
