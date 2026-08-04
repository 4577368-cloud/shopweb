/**
 * Assemble DraftOrderPurchaseReq.packageCreateInfo for placeDropshipOrder:
 * logistics template declare/tax + packaging increments + Tangbuy lineId.
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

function parseNumericLineId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Resolve Tangbuy logistics lineId for the order destination.
 * Prefers mall gateway template lane matching countryCode.
 */
export async function resolveLogisticsLineId(opts: {
  countryCode?: string | null;
}): Promise<{ lineId: number; lineName?: string } | null> {
  const code = (opts.countryCode ?? "").trim().toUpperCase();
  const lanes = await fetchLogisticsTemplatesByGoods();
  const match =
    (code
      ? lanes.find((l) => l.countryCode === code && l.lineId != null)
      : null) ??
    lanes.find((l) => l.lineId != null);
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
    order.destinationCountry?.code ||
    order.recipient?.countryCode ||
    "";
  const line = await resolveLogisticsLineId({ countryCode });
  const lineId = line?.lineId ?? null;
  if (lineId == null) {
    throw new PackageCreateInfoError(
      "logistics lineId required — configure Tangbuy template lane for destination",
      "no_line"
    );
  }

  const queryForm = buildPackageQueryFormFromTemplate(template, goodsAmount);
  return {
    lineId,
    lineName: line?.lineName,
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

export { parseNumericLineId };
