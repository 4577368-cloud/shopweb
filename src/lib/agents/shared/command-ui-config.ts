import type { ConfirmCardTheme } from "@/components/select/command-confirm-card";
import type { CommandSensitivity } from "./command-plan";

export interface CommandUIConfig {
  id: string;
  sensitivity: CommandSensitivity;
  requiresPreview: boolean;
  renderMode: "generic" | "custom";
  direct?: boolean;
  theme?: ConfirmCardTheme;
}

export function getCommandUIConfig(
  configs: Record<string, CommandUIConfig>,
  intent: string
): CommandUIConfig | null {
  return configs[intent] ?? null;
}
