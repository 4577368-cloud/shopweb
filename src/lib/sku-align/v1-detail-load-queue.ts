const MAX_CONCURRENT = 2;
let active = 0;
const waiters: Array<() => void> = [];

function pump() {
  while (active < MAX_CONCURRENT && waiters.length > 0) {
    const next = waiters.shift();
    if (!next) break;
    active++;
    next();
  }
}

/** Limit concurrent sku-align v1 product detail fetches on the list page. */
export function scheduleSkuAlignV1DetailLoad(task: () => Promise<void>): void {
  const run = () => {
    void task().finally(() => {
      active = Math.max(0, active - 1);
      pump();
    });
  };
  if (active < MAX_CONCURRENT) {
    active++;
    run();
  } else {
    waiters.push(run);
  }
}
