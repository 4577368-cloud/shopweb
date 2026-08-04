/**
 * Assemble DraftOrderPurchaseReq.packageCreateInfo for placeDropshipOrder:
 * logistics acceptance line (同源) → mall template lane → declare/tax + packaging.
 */
import { api } from "@/lib/api";
import {
  buildPackageQueryFormFromTemplate,
  packagingToIncrementList,
} from "@/lib/logistics/template-params";
import { fetchLogisticsTemplatesByGoods } from "@/lib/logistics/tangbuy-mail-limit";
import { createDefaultLogisticsTemplate } from "@/lib/logistics/default-template";
import type { DropshipPackageCreateInfo } from "./dropship-purchase";
import type { OrderSummary } from "./types";

export class PackageCreateInfoError extends Error {
  constructor(
    message: string,
    public readonly code: "no_line" | "no_shop" | "template"
  ) {
    super(message);
    this.name = "PackageCreateInfoError";
  }
}

export function parseNumericLineId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // Accept pure numeric or trailing numeric id
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** Normalize Shopify GID vs bare id for acceptance join. */
function variantIdKeys(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  const keys = new Set<string>([s]);
  const bare = s.includes("/") ? s.split("/").pop() : s;
  if (bare) keys.add(bare);
  if (/^\d+$/.test(s)) {
    keys.add(`gid://shopify/ProductVariant/${s}`);
  }
  return [...keys];
}

/**
 * Prefer logistics acceptances (merchant-confirmed quote) — same source as logistics page.
 */
export async function resolveLineFromAcceptances(opts: {
  shopName: string;
  variantIds: string[];
}): Promise<{ lineId: number; lineName?: string; estimatedFee?: number } | null> {
  const { shopName, variantIds } = opts;
  if (!shopName.trim() || variantIds.length === 0) return null;
  try {
    const rows = await api.listLogisticsAcceptances(shopName);
    const idSet = new Set<string>();
    for (const v of variantIds) {
      for (const k of variantIdKeys(v)) idSet.add(k);
    }
    const votes = new Map<
      number,
      { count: number; lineName?: string; estimatedFee?: number }
    >();
    for (const row of rows) {
      const sku = row.thirdPlatformSkuId?.trim();
      if (!sku) continue;
      const match = variantIdKeys(sku).some((k) => idSet.has(k));
      if (!match) continue;
      const lineId = parseNumericLineId(row.recommendedLine?.lineCode);
      if (lineId == null) continue;
      const prev = votes.get(lineId) ?? { count: 0 };
      votes.set(lineId, {
        count: prev.count + 1,
        lineName: row.recommendedLine?.lineName ?? prev.lineName,
        estimatedFee:
          typeof row.recommendedLine?.estimatedFee === "number"
            ? row.recommendedLine.estimatedFee
            : prev.estimatedFee,
      });
    }
    let best: { lineId: number; lineName?: string; estimatedFee?: number } | null =
      null;
    let bestCount = 0;
    for (const [lineId, meta] of votes) {
      if (meta.count > bestCount) {
        bestCount = meta.count;
        best = {
          lineId,
          lineName: meta.lineName,
          estimatedFee: meta.estimatedFee,
        };
      }
    }
    return best;
  } catch {
    return null;
  }
}

/** Fallback: mall gateway template lane matching countryCode. */
export async function resolveLogisticsLineId(opts: {
  countryCode?: string | null;
}): Promise<{ lineId: number; lineName?: string } | null> {
  const code = (opts.countryCode ?? "").trim().toUpperCase();
  const lanes = await fetchLogisticsTemplatesByGoods();
  const match =
    (code
      ? lanes.find((l) => l.countryCode === code && l.lineId != null)
      : null) ?? lanes.find((l) => l.lineId != null);
  if (!match?.lineId) return null;
  return { lineId: match.lineId, lineName: match.lineName };
}

export async function buildPackageCreateInfoForOrder(opts: {
  shopName: string;
  order: OrderSummary;
  goodsAmount?: number | null;
}): Promise<DropshipPackageCreateInfo> {
  const { shopName, order, goodsAmount } = opts;
  if (!shopName.trim()) {
    throw new PackageCreateInfoError("shop required", "no_shop");
  }

  let template = createDefaultLogisticsTemplate(shopName);
  try {
    const list = await api.listLogisticsTemplates(shopName);
    if (list[0]) template = list[0];
  } catch {
    // keep default declare/packaging
  }

  const countryCode =
    order.destinationCountry?.code || order.recipient?.countryCode || "";
  const variantIds = (order.lineItems ?? [])
    .map((it) => it.outerVariantId)
    .filter((id): id is string => !!id?.trim());

  const fromAccept = await resolveLineFromAcceptances({ shopName, variantIds });
  const fromMall =
    fromAccept == null
      ? await resolveLogisticsLineId({ countryCode })
      : null;
  const line = fromAccept ?? fromMall;
  if (line?.lineId == null) {
    throw new PackageCreateInfoError(
      "logistics lineId required — confirm a route on Logistics page or configure Tangbuy template lane",
      "no_line"
    );
  }

  const queryForm = buildPackageQueryFormFromTemplate(template, goodsAmount);
  const packageAmountPre =
    typeof fromAccept?.estimatedFee === "number" &&
    Number.isFinite(fromAccept.estimatedFee) &&
    fromAccept.estimatedFee > 0
      ? fromAccept.estimatedFee
      : undefined;

  return {
    lineId: line.lineId,
    lineName: line.lineName,
    packageAmountPre,
    packageChoosedContent: {
      currency: queryForm.currency || "USD",
      incrementList: packagingToIncrementList(template.packaging),
      insure: 0,
      useInsure: 0,
      queryForm: {
        declareMode: queryForm.declareMode,
        registrationType: queryForm.registrationType,
        tax: queryForm.tax,
        taxNo: queryForm.taxNo,
      },
    },
  };
}
