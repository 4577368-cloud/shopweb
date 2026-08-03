/** Unified Bundle Hub — play types and campaign shapes. */

export type BundlePlayType =
  | "fixed_kit"
  | "mix_match"
  | "byob"
  | "product_offer";

export type BundleCampaignStatus =
  | "ACTIVE"
  | "DRAFT"
  | "ARCHIVED"
  | "COMING_SOON"
  | "FAILED"
  | "STALE"
  | "CREATING";

export type ProductOfferKind = "qty_discount" | "variant_pair" | "qty_gift";

export interface MixMatchRule {
  kind: "mix_match";
  minQty: number;
  pricing:
    | { type: "percent"; percent: number }
    | { type: "fixed_price"; amount: number; currency?: string };
  label?: string;
}

export interface ByobPoolProduct {
  id: string;
  handle?: string;
  title?: string;
  /** Shopify variant id — optional; theme resolves first available if missing. */
  variantId?: string;
  variantTitle?: string;
  /** Absolute image URL for Theme Block cards. */
  imageUrl?: string;
  /** Integer cents for Liquid `| money`. */
  price?: number;
  compareAtPrice?: number;
  available?: boolean;
}

export interface ByobSlot {
  id: string;
  role: "main" | "accessory" | "gift" | "other";
  title: string;
  description?: string;
  min: number;
  max: number;
  poolProductIds: string[];
  /** Enriched for Theme Block (`all_products[handle]` + card fields). */
  poolProducts?: ByobPoolProduct[];
}

export interface ByobRule {
  kind: "byob";
  /** Storefront contract version — Theme Block expects 1. */
  schemaVersion?: number;
  slots: ByobSlot[];
  label?: string;
  hint?: string;
  status?: BundleCampaignStatus;
  campaignId?: string;
}

export interface BundleCampaign {
  id: string;
  shopName: string;
  playType: BundlePlayType;
  title: string;
  status: BundleCampaignStatus;
  ruleJson?: string | null;
  poolJson?: string | null;
  shopifyRefsJson?: string | null;
  /** Links to shop_product_bundle.id for fixed_kit */
  linkedBundleId?: number | null;
  poolCount?: number;
  updatedAt?: string | null;
  /** Synthesized from status-map (not persisted campaign row). */
  synthetic?: boolean;
}

export interface BundleHubSeed {
  productId: string;
  title?: string | null;
}
