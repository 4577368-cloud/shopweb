/** Max SKUs per Tangbuy estimate call — avoids gateway timeouts on large products. */
export const ESTIMATE_SKU_CHUNK_SIZE = 25;

/** Max products quoted in parallel during smart-estimate pipeline. */
export const PIPELINE_PRODUCT_CONCURRENCY = 4;

/** Parallel Tangbuy estimate API calls per product (balance speed vs gateway load). */
export const ESTIMATE_CHUNK_CONCURRENCY = 2;

export function chunkEstimateVariants<T>(variants: T[], size = ESTIMATE_SKU_CHUNK_SIZE): T[][] {
  if (variants.length <= size) return variants.length ? [variants] : [];
  const chunks: T[][] = [];
  for (let i = 0; i < variants.length; i += size) {
    chunks.push(variants.slice(i, i + size));
  }
  return chunks;
}

export function collectIngestingVariantIds(
  quotes: Map<string, { quoteStatus?: string | null }>,
  candidateIds: string[]
): string[] {
  return candidateIds.filter((id) => quotes.get(id)?.quoteStatus === "INGESTING");
}

export function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Brief pause before one ingesting-SKU retry; then pipeline completes without further waits. */
export const INGESTING_RETRY_DELAY_MS = 3_000;

/** Run async work over items with a fixed concurrency limit. */
export async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  isStopped?: () => boolean
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      if (isStopped?.()) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
}
