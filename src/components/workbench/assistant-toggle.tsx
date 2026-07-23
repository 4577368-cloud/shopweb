"use client";

import { PanelRight, PanelRightClose } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AssistantToggleProps {
  open: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Center-header control for workspace assistant column. Lives in MainHeader actions —
 * not inside the right rail — so position stays fixed when the rail collapses.
 */
export function AssistantToggle({
  open,
  onToggle,
  className,
}: AssistantToggleProps) {
  const label = open ? "收起 AI 助手" : "打开 AI 助手";
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onToggle}
      className={cn("h-7 w-7 px-0", className)}
      title={label}
      aria-label={label}
      aria-pressed={open}
    >
      {open ? (
        <PanelRightClose className="h-3.5 w-3.5" />
      ) : (
        <PanelRight className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
