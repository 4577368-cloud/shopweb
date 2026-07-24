import type { CommandUIConfig } from "@/lib/agents/shared/command-ui-config";
import type { LogisticsCommandId } from "./command-schema";

export const LOGISTICS_COMMAND_UI_CONFIG: Record<
  LogisticsCommandId,
  CommandUIConfig
> = {
  accept_all_ready: {
    id: "accept_all_ready",
    sensitivity: "high",
    requiresPreview: true,
    renderMode: "generic",
    theme: "violet",
  },
  fetch_quotes: {
    id: "fetch_quotes",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  start_estimate: {
    id: "start_estimate",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  open_template: {
    id: "open_template",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  focus_issues: {
    id: "focus_issues",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  focus_status: {
    id: "focus_status",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  apply_template: {
    id: "apply_template",
    sensitivity: "high",
    requiresPreview: false,
    renderMode: "generic",
  },
};

export function getLogisticsCommandUIConfig(
  intent: string
): CommandUIConfig | null {
  return LOGISTICS_COMMAND_UI_CONFIG[intent as LogisticsCommandId] ?? null;
}
