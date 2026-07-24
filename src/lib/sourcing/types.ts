import type { PoolIngestStatus } from "@/lib/types";

/** Tangbuy catalog vs 1688 offer — unified discover result. */
export type SourcingSource = "tangbuy" | "1688";

export type SourcingSourceFilter = "all" | "tangbuy" | "1688";

export const TANGBUY_DISPLAY_MULTIPLIER = 1;
export const DEFAULT_1688_DISPLAY_MULTIPLIER = 1.2;

export interface SourcingSearchHit {
  /** Stable UI key — `tangbuy:{id}` or `1688:{offerId}` */
  hitId: string;
  source: SourcingSource;
  title: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  /** Procurement cost in source currency (usually CNY). */
  costCny?: number | null;
  currency?: string | null;
  supplierShop?: string | null;
  /** Tangbuy internal goods id — publish candidateId when present. */
  candidateId?: string | null;
  tangbuyUrl?: string | null;
  goodsId?: string | null;
  offerId1688?: string | null;
  detailUrl1688?: string | null;
  skuId?: string | null;
  /** Discover-tab display markup — 1× Tangbuy, 1.2× 1688 by default. */
  displayMultiplier: number;
  poolIngestStatus?: PoolIngestStatus;
  /** 1-based position in the last merged search (for NL「上架第 N 个」). */
  listIndex?: number;
}
