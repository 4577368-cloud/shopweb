import type { ImageSearchResult } from "@/lib/types";

/** Per-card queue state for「一键关联」. */
export type BatchLinkCardState =
  | "idle"
  | "queued"
  | "searching"
  | "candidates_ready"
  | "auto_selecting"
  | "binding"
  | "done"
  | "failed"
  | "needs_review";

export type BatchLinkSelectButtonPhase = "idle" | "pressed" | "loading";

export interface BatchLinkCardDrive {
  state: BatchLinkCardState;
  searchResult?: ImageSearchResult | null;
  matchScores?: Record<string, number>;
  highlightTopCandidate?: boolean;
  selectButtonPhase?: BatchLinkSelectButtonPhase;
  errorMessage?: string;
  doneFlash?: boolean;
}

export interface BatchLinkProgress {
  active: boolean;
  done: boolean;
  total: number;
  processed: number;
  linked: number;
  needsReview: number;
  failed: number;
  currentProductId: string | null;
  currentProductTitle: string | null;
  cardStates: Record<string, BatchLinkCardDrive>;
  recent: string[];
}

export const INITIAL_BATCH_LINK_PROGRESS: BatchLinkProgress = {
  active: false,
  done: false,
  total: 0,
  processed: 0,
  linked: 0,
  needsReview: 0,
  failed: 0,
  currentProductId: null,
  currentProductTitle: null,
  cardStates: {},
  recent: [],
};

export function formatBatchLinkSummary(progress: BatchLinkProgress): string {
  if (progress.total <= 0) return "暂无可关联的未匹配商品";
  const parts = [`已完成 ${progress.processed}/${progress.total} 个商品图搜关联`];
  const detail: string[] = [];
  if (progress.linked > 0) detail.push(`${progress.linked} 个进入待确认`);
  const manual = progress.needsReview + progress.failed;
  if (manual > 0) detail.push(`${manual} 个需手动处理`);
  if (detail.length > 0) parts.push(`其中 ${detail.join("，")}`);
  return parts.join("，");
}
