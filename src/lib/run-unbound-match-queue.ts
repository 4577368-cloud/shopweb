import { api } from "@/lib/api";
import { isMatchJobActive, pollMatchJobUntilDone } from "@/lib/match-queue-poll";
import type { MatchJobProgress } from "@/lib/types";

export async function runUnboundMatchQueue(
  shopName: string,
  opts?: { onProgress?: (job: MatchJobProgress) => void }
): Promise<MatchJobProgress> {
  const onProgress = opts?.onProgress;
  const active = await api.getActiveMatchJob(shopName);
  if (active?.jobId && isMatchJobActive(active.jobStatus)) {
    return pollMatchJobUntilDone(active.jobId, { onProgress });
  }

  const job = await api.startMatchQueue(shopName);
  onProgress?.(job);
  if (job.jobId && isMatchJobActive(job.jobStatus)) {
    return pollMatchJobUntilDone(job.jobId, { onProgress });
  }
  return job;
}

export function formatUnboundMatchSummary(job: MatchJobProgress): string {
  const total = job.total > 0 ? job.total : job.processed;
  if (total <= 0) return "暂无可关联的未匹配商品";
  const parts = [`已完成 ${total} 个商品图搜关联`];
  const detail: string[] = [];
  if (job.linked > 0) detail.push(`${job.linked} 个进入待确认`);
  const manual = job.skipped + job.failed;
  if (manual > 0) detail.push(`${manual} 个需手动查找候选`);
  if (detail.length > 0) parts.push(`其中 ${detail.join("，")}`);
  return parts.join("，");
}
