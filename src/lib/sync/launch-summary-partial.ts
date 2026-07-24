import type { TranslateFn } from "@/i18n/server";
import type {
  ImageBindingView,
  LogisticsAnalysis,
  LogisticsTemplate,
  PricingTemplate,
  ShopMirrorProduct,
} from "@/lib/types";
import type { SkuAlignOverview } from "@/lib/sku-align-v1/types";
import type { LaunchSummaryBundle } from "@/lib/sync/launch-summary-bundle";

export type LaunchSummaryPartialPatch = Partial<{
  shopProducts: ShopMirrorProduct[];
  bindings: Record<string, ImageBindingView> | ImageBindingView[];
  skuOverview: SkuAlignOverview | null;
  logisticsAnalysis: LogisticsAnalysis | null;
  pricingTemplate: PricingTemplate | null;
  logisticsTemplates: LogisticsTemplate[];
}>;

export interface LaunchSummaryPartialEntry {
  shopProducts?: ShopMirrorProduct[];
  bindings?: ImageBindingView[];
  skuOverview?: SkuAlignOverview | null;
  logisticsAnalysis?: LogisticsAnalysis | null;
  pricingTemplate?: PricingTemplate | null;
  logisticsTemplates?: LogisticsTemplate[];
  ts: number;
}

const partialMem = new Map<string, LaunchSummaryPartialEntry>();
const PARTIAL_STORAGE_PREFIX = "tangbuy.launch-summary.partial.v1:";

function partialStorageKey(shopKey: string): string {
  return PARTIAL_STORAGE_PREFIX + shopKey.toLowerCase();
}

function readPartialPersisted(shopKey: string): LaunchSummaryPartialEntry | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(partialStorageKey(shopKey));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as LaunchSummaryPartialEntry;
    if (typeof parsed.ts !== "number") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writePartialPersisted(shopKey: string, entry: LaunchSummaryPartialEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(partialStorageKey(shopKey), JSON.stringify(entry));
  } catch {
    // ignore quota
  }
}

function normalizeBindings(
  bindings: Record<string, ImageBindingView> | ImageBindingView[] | undefined
): ImageBindingView[] | undefined {
  if (!bindings) return undefined;
  if (Array.isArray(bindings)) return bindings;
  return Object.values(bindings);
}

export function getLaunchSummaryPartial(shopKey: string): LaunchSummaryPartialEntry | undefined {
  const mem = partialMem.get(shopKey);
  if (mem) return mem;
  const persisted = readPartialPersisted(shopKey);
  if (persisted) {
    partialMem.set(shopKey, persisted);
    return persisted;
  }
  return undefined;
}

export function mergeLaunchSummaryPartial(
  shopKey: string,
  patch: LaunchSummaryPartialPatch
): LaunchSummaryPartialEntry {
  const prev = getLaunchSummaryPartial(shopKey) ?? { ts: Date.now() };
  const bindings = normalizeBindings(patch.bindings);
  const next: LaunchSummaryPartialEntry = {
    ...prev,
    ...(patch.shopProducts !== undefined ? { shopProducts: patch.shopProducts } : {}),
    ...(bindings !== undefined ? { bindings } : {}),
    ...(patch.skuOverview !== undefined ? { skuOverview: patch.skuOverview } : {}),
    ...(patch.logisticsAnalysis !== undefined
      ? { logisticsAnalysis: patch.logisticsAnalysis }
      : {}),
    ...(patch.pricingTemplate !== undefined ? { pricingTemplate: patch.pricingTemplate } : {}),
    ...(patch.logisticsTemplates !== undefined
      ? { logisticsTemplates: patch.logisticsTemplates }
      : {}),
    ts: Date.now(),
  };
  partialMem.set(shopKey, next);
  writePartialPersisted(shopKey, next);
  return next;
}

export function isLaunchSummaryPartialComplete(
  entry: LaunchSummaryPartialEntry | undefined
): entry is LaunchSummaryPartialEntry & {
  shopProducts: ShopMirrorProduct[];
  bindings: ImageBindingView[];
  skuOverview: SkuAlignOverview | null;
  logisticsAnalysis: LogisticsAnalysis | null;
  pricingTemplate: PricingTemplate | null;
  logisticsTemplates: LogisticsTemplate[];
} {
  if (!entry) return false;
  return (
    entry.shopProducts !== undefined &&
    entry.bindings !== undefined &&
    entry.skuOverview !== undefined &&
    entry.logisticsAnalysis !== undefined &&
    entry.pricingTemplate !== undefined &&
    entry.logisticsTemplates !== undefined
  );
}

/** @deprecated Use mergeLaunchSummaryPartial — kept for call-site clarity. */
export type WarmLaunchSummaryPartial = LaunchSummaryPartialPatch;
