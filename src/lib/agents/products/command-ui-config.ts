import type { CommandUIConfig as SharedCommandUIConfig } from "@/lib/agents/shared/command-ui-config";
import type { ProductCommandId, CommandSensitivity } from "./command-schema";
import type { ComponentType } from "react";

export type { CommandSensitivity };

export interface CommandUIConfig extends SharedCommandUIConfig {
  id: ProductCommandId;
  headerLabel?: string;
  confirmLabel?: string;
  executingLabel?: string;
  CustomConfirmCard?: ComponentType<{
    plan: unknown;
    shopName: string;
    executing?: boolean;
    onConfirm: (payload: Record<string, unknown>) => void;
    onCancel: () => void;
  }>;
}

export const COMMAND_UI_CONFIG: Record<string, CommandUIConfig> = {
  // ── 低敏感 · 直接执行（L1，无卡片）──
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
  rerun_candidate_search: {
    id: "rerun_candidate_search",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  explain_product_match: {
    id: "explain_product_match",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  open_pricing_editor: {
    id: "open_pricing_editor",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },

  // ── 高敏感 · 写入 Shopify（L2，必须人工确认数值和范围）──
  update_listing_price: {
    id: "update_listing_price",
    sensitivity: "high",
    requiresPreview: true,
    renderMode: "custom",
  },

  // ── 低敏感 · 写入 Shopify（L2，快速自动执行）──
  update_product_copy: {
    id: "update_product_copy",
    sensitivity: "low",
    requiresPreview: true,
    renderMode: "generic",
    theme: "sky",
    headerLabel: "文案修改预览",
    confirmLabel: "确认应用",
    executingLabel: "写入中…",
  },
  batch_update_product_copy: {
    id: "batch_update_product_copy",
    sensitivity: "low",
    requiresPreview: true,
    renderMode: "generic",
    theme: "violet",
    headerLabel: "批量文案修改预览",
    confirmLabel: "开始批量执行",
    executingLabel: "批量执行中…",
  },
  batch_update_listing_price: {
    id: "batch_update_listing_price",
    sensitivity: "high",
    requiresPreview: true,
    renderMode: "generic",
    theme: "amber",
    headerLabel: "批量售价修改预览",
    confirmLabel: "开始批量执行",
    executingLabel: "批量执行中…",
  },
  draft_product: {
    id: "draft_product",
    sensitivity: "high",
    requiresPreview: true,
    renderMode: "generic",
    theme: "amber",
    headerLabel: "放到草稿预览",
    confirmLabel: "确认放到草稿",
    executingLabel: "同步中…",
  },
  archive_product: {
    id: "archive_product",
    sensitivity: "high",
    requiresPreview: true,
    renderMode: "generic",
    theme: "amber",
    headerLabel: "下架归档预览",
    confirmLabel: "确认下架",
    executingLabel: "同步中…",
  },
  batch_draft_products: {
    id: "batch_draft_products",
    sensitivity: "high",
    requiresPreview: true,
    renderMode: "generic",
    theme: "amber",
    headerLabel: "批量放到草稿预览",
    confirmLabel: "开始批量执行",
    executingLabel: "批量执行中…",
  },
  batch_archive_products: {
    id: "batch_archive_products",
    sensitivity: "high",
    requiresPreview: true,
    renderMode: "generic",
    theme: "amber",
    headerLabel: "批量下架预览",
    confirmLabel: "开始批量下架",
    executingLabel: "批量执行中…",
  },
  search_sourcing: {
    id: "search_sourcing",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  set_sourcing_filters: {
    id: "set_sourcing_filters",
    sensitivity: "low",
    requiresPreview: false,
    renderMode: "generic",
    direct: true,
  },
  publish_sourcing_item: {
    id: "publish_sourcing_item",
    sensitivity: "high",
    requiresPreview: true,
    renderMode: "generic",
    theme: "sky",
    headerLabel: "上架货源确认",
    confirmLabel: "确认上架",
    executingLabel: "上架中…",
  },
};

export function getCommandUIConfig(intent: string): CommandUIConfig | null {
  return COMMAND_UI_CONFIG[intent] ?? null;
}
