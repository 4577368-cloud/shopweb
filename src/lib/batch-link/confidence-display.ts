import type { MatchConfidenceTier } from "@/lib/batch-link/confidence";
import type { BatchLinkCardDrive, BatchLinkCardState } from "@/lib/batch-link/types";

export const CONFIDENCE_TIER_LABELS: Record<MatchConfidenceTier, string> = {
  high: "高匹配",
  medium: "中匹配",
  low: "低匹配",
  none: "未达门槛",
};

export const BATCH_CARD_STATE_LABELS: Record<BatchLinkCardState, string> = {
  idle: "待处理",
  queued: "排队中",
  searching: "图搜中",
  candidates_ready: "候选就绪",
  auto_selecting: "自动选用",
  binding: "关联中",
  done: "已关联",
  failed: "失败",
  needs_review: "待确认",
};

export function formatConfidenceScores(input: {
  titleScore?: number | null;
  imageScore?: number | null;
  tier?: MatchConfidenceTier | null;
}): string {
  const parts: string[] = [];
  if (input.titleScore != null && input.titleScore > 0) {
    parts.push(`标题 ${Math.round(input.titleScore)}%`);
  }
  if (input.imageScore != null && input.imageScore > 0) {
    parts.push(`图像 ${Math.round(input.imageScore)}%`);
  }
  if (input.tier) {
    parts.push(CONFIDENCE_TIER_LABELS[input.tier]);
  }
  return parts.join(" · ") || "—";
}

export function formatBatchCardQueueLine(drive: BatchLinkCardDrive): string {
  const stateLabel = BATCH_CARD_STATE_LABELS[drive.state];
  const scores = formatConfidenceScores({
    titleScore: drive.titleScore,
    imageScore: drive.imageScore,
    tier: drive.confidenceTier,
  });
  if (drive.state === "failed" && drive.errorMessage?.trim()) {
    return `${stateLabel} · ${scores} · ${drive.errorMessage.trim()}`;
  }
  return scores !== "—" ? `${stateLabel} · ${scores}` : stateLabel;
}
