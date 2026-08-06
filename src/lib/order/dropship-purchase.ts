/**
 * Dropship place-order orchestration — aligns with DraftOrderController:
 * resolve (derive if missing) → purchaseOrder → { tradeNo, expireTime }.
 *
 * Paths: `/api/plugin/draftorder/*` (not legacy `/api/plugin/draft/order/*`).
 */
import { ApiError } from "@/lib/api";
import { api } from "@/lib/api";
import {
  buildPackageQueryFormFromTemplate,
} from "@/lib/logistics/template-params";
import { logisticsTemplateFromVo } from "@/lib/logistics/default-template";
import { fetchLogisticsTemplatesByGoods } from "@/lib/logistics/tangbuy-mail-limit";
import type { LogisticsTemplate } from "@/lib/types";
import type { OrderSummary } from "./types";
import {
  purchaseDraftOrder,
  resolveDraftOrder,
  type DraftPackageCreateInfo,
  type DraftPurchaseResult,
} from "./draftorder-api";

export type {
  DraftPackageCreateInfo as DropshipPackageCreateInfo,
} from "./draftorder-api";

export interface DropshipPurchaseRequest {
  shopName: string;
  outerOrderId: string;
  orderId?: number;
  orderType?: number;
  packageCreateInfo?: DraftPackageCreateInfo;
}

export interface DropshipPurchaseResult extends DraftPurchaseResult {
  orderId?: number;
  outerOrderId?: string;
  tangbuyOrderNo?: string;
  /** Purchase amount from draft header when available (CNY). */
  payableAmountCny?: number;
  draftStatus?: number;
  expireTimeMs?: number | null;
}

export interface DropshipPurchaseAmountPreview {
  goodsAmountCny?: number;
  packageAmountCny?: number;
  totalCny?: number;
}

function parseNumericLineId(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Build packageCreateInfo from shop logistics template + optional line hint.
 * Declare prefs come from template; lineId prefers explicit hint, then mail-template lane for destination.
 */
export async function buildPackageCreateInfoForOrder(opts: {
  shopName: string;
  order: OrderSummary;
  lineIdHint?: number | string | null;
  lineNameHint?: string | null;
  deliveryTimeHint?: string | null;
}): Promise<DraftPackageCreateInfo | undefined> {
  const { shopName, order } = opts;
  let template: LogisticsTemplate | null = null;
  try {
    const vo = await api.getLogisticsTemplate(shopName);
    template = logisticsTemplateFromVo(vo, shopName);
  } catch {
    template = null;
  }

  let lineId = parseNumericLineId(opts.lineIdHint);
  let lineName = opts.lineNameHint?.trim() || undefined;
  let deliveryTime = opts.deliveryTimeHint?.trim() || undefined;

  if (lineId == null) {
    const country = (order.destinationCountry?.code || "").trim().toUpperCase();
    try {
      const lanes = await fetchLogisticsTemplatesByGoods();
      const match =
        (country
          ? lanes.find(
              (l) =>
                l.countryCode === country &&
                typeof l.lineId === "number" &&
                l.lineId > 0
            )
          : undefined) ??
        lanes.find((l) => typeof l.lineId === "number" && (l.lineId as number) > 0);
      if (match?.lineId) {
        lineId = match.lineId;
        lineName = lineName || match.lineName || match.templateName;
      }
    } catch {
      /* optional enrichment */
    }
  }

  if (lineId == null) {
    // purchaseOrder allows null packageCreateInfo (goods-only pre-order).
    return undefined;
  }

  const goodsAmount = (() => {
    const raw = order.productCost ?? order.payableAmount;
    if (!raw) return null;
    const n = Number(String(raw).replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  })();

  const queryForm = buildPackageQueryFormFromTemplate(template, goodsAmount);

  return {
    lineId,
    lineName,
    deliveryTime,
    packageComment: order.remark?.trim() || "",
    packageChoosedContent: {
      currency: queryForm.currency || "USD",
      couponId: "",
      passwordDiscount: "",
      incrementList: [],
      insure: 0,
      useInsure: 0,
      queryForm: {
        declareMode: queryForm.declareMode,
        registrationType: queryForm.registrationType,
        tax: queryForm.tax,
        currency: queryForm.currency,
        ...(queryForm.taxNo ? { taxNo: queryForm.taxNo } : {}),
      },
    },
  };
}

/**
 * Full place flow: resolve/derive draft → purchaseOrder.
 * Throws ApiError on failure — callers must not silently mock-succeed.
 */
export async function placeDropshipOrder(
  body: DropshipPurchaseRequest & { order?: OrderSummary }
): Promise<DropshipPurchaseResult> {
  const shopName = body.shopName?.trim();
  const outerOrderId = body.outerOrderId?.trim();
  if (!shopName || !outerOrderId) {
    throw new ApiError("shopName and outerOrderId required", 400);
  }

  const resolved = await resolveDraftOrder(shopName, outerOrderId, true);
  const orderId = body.orderId ?? resolved.orderId;
  if (orderId == null) {
    throw new ApiError("draft orderId missing after resolve", 400);
  }

  let packageCreateInfo = body.packageCreateInfo;
  if (!packageCreateInfo && body.order) {
    packageCreateInfo = await buildPackageCreateInfoForOrder({
      shopName,
      order: body.order,
    });
  }

  const purchased = await purchaseDraftOrder({
    shopName,
    outerOrderId,
    orderId,
    orderType: body.orderType ?? 1,
    packageCreateInfo,
  });

  const tradeNo = purchased.tradeNo || resolved.payNo || resolved.tradeNo || undefined;
  const expireRaw = purchased.expireTime;
  let expireTimeMs: number | null | undefined =
    resolved.expireTime ?? undefined;
  if (typeof expireRaw === "string" && expireRaw) {
    const t = Date.parse(expireRaw);
    if (!Number.isNaN(t)) expireTimeMs = t;
  }

  return {
    ...purchased,
    tradeNo,
    orderId,
    outerOrderId,
    tangbuyOrderNo: tradeNo || String(orderId),
    payableAmountCny:
      resolved.purchaseAmount != null ? Number(resolved.purchaseAmount) : undefined,
    draftStatus: resolved.status,
    expireTimeMs: expireTimeMs ?? null,
  };
}

/** Preview is not exposed on the trimmed DraftOrderController — keep stub for callers. */
export async function previewDropshipAmount(
  _body: DropshipPurchaseRequest
): Promise<DropshipPurchaseAmountPreview> {
  throw new ApiError(
    "calDraftPurchasedAmount is not available on this plugin build",
    501
  );
}
