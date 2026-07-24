import { api } from "@/lib/api";
import { setSkuAlignMirrorCache } from "@/lib/sku-align/sku-align-mirror-cache";
import { setSkuOverviewSession } from "@/lib/sku-align/overview-session-cache";

const inflight = new Map<string, Promise<void>>();

/** Hover / focus prefetch before navigating from 商品关联 → SKU 绑定. */
export function prefetchSkuAlignListCache(shopName: string): void {
  const key = shopName.trim();
  if (!key) return;
  if (inflight.has(key)) return;

  const run = (async () => {
    const [overview, tpl] = await Promise.all([
      api.getSkuOverview(key),
      api.getPricingTemplate(key).catch(() => null),
    ]);
    if (!overview.length) return;
    setSkuOverviewSession(key, overview);
    setSkuAlignMirrorCache(key, { overview, pricingTemplate: tpl });
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, run);
}
