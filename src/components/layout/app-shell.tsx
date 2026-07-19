"use client";

import type { AiPanelContent } from "@/lib/types";
import { StepNav } from "@/components/layout/step-nav";
import { AiAssistant } from "@/components/layout/ai-assistant";

interface AppShellProps {
  children: React.ReactNode;
  /** 默认侧栏内容；若传入 aside 则忽略 */
  ai?: AiPanelContent;
  /** 自定义右侧面板（如选品决策摘要） */
  aside?: React.ReactNode;
  onAlertClick?: (targetId: string) => void;
  onNextAction?: (action: string) => void;
  highlightedAlertId?: string;
}

export function AppShell({
  children,
  ai,
  aside,
  onAlertClick,
  onNextAction,
  highlightedAlertId,
}: AppShellProps) {
  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-slate-100">
      <StepNav />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] px-5 py-4">{children}</div>
      </main>
      {aside ?? (
        <AiAssistant
          content={
            ai ?? {
              title: "",
              summary: "",
              bullets: [],
            }
          }
          onAlertClick={onAlertClick}
          onNextAction={onNextAction}
          highlightedAlertId={highlightedAlertId}
        />
      )}
    </div>
  );
}
