import { api } from "@/lib/api";
import type { MatchJobProgress, MatchJobStatus } from "@/lib/types";

const POLL_MS = 1500;

export function isMatchJobActive(status: MatchJobStatus): boolean {
  return status === "PENDING" || status === "RUNNING";
}

export async function pollMatchJobUntilDone(
  jobId: number,
  opts?: { signal?: AbortSignal; onProgress?: (job: MatchJobProgress) => void }
): Promise<MatchJobProgress> {
  while (!opts?.signal?.aborted) {
    const job = await api.getMatchJob(jobId);
    opts?.onProgress?.(job);
    if (!isMatchJobActive(job.jobStatus)) return job;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, POLL_MS);
      opts?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    });
  }
  return api.getMatchJob(jobId);
}
