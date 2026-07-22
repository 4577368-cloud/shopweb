import type { CommandUIConfig } from "@/lib/agents/shared/command-ui-config";
import type { SkuCommandId } from "./command-schema";

export const SKU_COMMAND_UI_CONFIG: Record<SkuCommandId, CommandUIConfig> = {
  open_filter: {
    id: "open_filter",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  focus_product: {
    id: "focus_product",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  batch_confirm_pending: {
    id: "batch_confirm_pending",
    sensitivity: "high",
    requiresPreview: true,
    renderMode: "generic",
    theme: "violet",
  },
  rerun_auto_align: {
    id: "rerun_auto_align",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  explain_sku_match: {
    id: "explain_sku_match",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  open_sku_detail: {
    id: "open_sku_detail",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
};

export function getSkuCommandUIConfig(intent: string): CommandUIConfig | null {
  return SKU_COMMAND_UI_CONFIG[intent as SkuCommandId] ?? null;
}
