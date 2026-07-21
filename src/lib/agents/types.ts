/**
 * Shared agent response shapes (rule-owned actions + copy fields).
 */

export type AgentId =
  | "pricing_strategist"
  | "sourcing_advisor"
  | "orchestrator"
  | "logistics_advisor"
  | "sync_concierge";

export type SuggestedActionKind =
  | "open_pricing_drawer"
  | "set_tab"
  | "set_shop_filter"
  | "focus_product"
  | "open_candidate_search"
  | "rematch_unbound"
  | "apply_filter_preset"
  | "none";

export interface AgentFilterPreset {
  categoryId?: string;
  categoryName?: string;
  keywords?: string;
  label: string;
}

export interface AgentSuggestedAction {
  kind: SuggestedActionKind;
  tab?: "shop" | "catalog";
  shopFilter?: "all" | "pending" | "confirmed" | "unbound" | "new_arrivals";
  /** Shopify mirror item id (thirdPlatformItemId) */
  productId?: string;
  filterPreset?: AgentFilterPreset;
  label?: string;
}

/**
 * Uniform agent response — deterministic action fields + copy fields.
 */
export interface AgentResponse {
  agentId: AgentId;
  intent: string;
  summary: string;
  explanation: string[];
  nextSteps: string[];
  suggestedAction: AgentSuggestedAction;
  highlightArea?: "pricing_card" | "filters" | "shop_list" | "catalog_grid" | null;
  openDrawer?: "pricing" | null;
  targetTab?: "shop" | "catalog" | null;
}
