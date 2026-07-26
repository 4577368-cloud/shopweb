import type { BatchLinkProgress } from "@/lib/batch-link/types";

export interface BatchLinkEscalation {
  /** Products that ended the run in a failed state. */
  failedCount: number;
  /** Products that need a human pick but still have candidates. */
  reviewCount: number;
  productIds: string[];
  titles: string[];
  /** Most frequent failure reason, already user-facing. */
  topReason: string | null;
}

const MAX_TITLES = 8;

/**
 * Aggregate one batch run into a single human-escalation payload.
 * Per-card prompts are intentionally not raised during a run — the queue keeps
 * going and the user is asked once, after it settles.
 */
export function buildBatchLinkEscalation(
  progress: BatchLinkProgress | null | undefined
): BatchLinkEscalation | null {
  if (!progress || progress.sessionOrder.length === 0) return null;

  const productIds: string[] = [];
  const titles: string[] = [];
  const reasonCounts = new Map<string, number>();
  let reviewCount = 0;

  for (const id of progress.sessionOrder) {
    const drive = progress.cardStates[id];
    if (!drive) continue;
    if (drive.state === "needs_review") {
      reviewCount += 1;
      continue;
    }
    if (drive.state !== "failed") continue;

    productIds.push(id);
    const title = drive.productTitle?.trim();
    if (title && titles.length < MAX_TITLES) titles.push(title);

    const reason = drive.errorMessage?.trim();
    if (reason) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  if (productIds.length === 0) return null;

  let topReason: string | null = null;
  let topCount = 0;
  for (const [reason, count] of reasonCounts) {
    if (count > topCount) {
      topReason = reason;
      topCount = count;
    }
  }

  return {
    failedCount: productIds.length,
    reviewCount,
    productIds,
    titles,
    topReason,
  };
}

/** Stable key for one batch run, so a dismissed prompt does not reappear. */
export function batchLinkRunKey(
  progress: BatchLinkProgress | null | undefined
): string | null {
  if (!progress || progress.sessionOrder.length === 0) return null;
  return progress.sessionOrder.join("|");
}
