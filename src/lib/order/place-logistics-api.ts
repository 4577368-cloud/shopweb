/**
 * Place-order logistics client — stable contract for address / available lines / fee preview.
 * Default: stub adapter (P0). Flip USE_STUB=false when real BFF endpoints land.
 */
import { ApiError } from "@/lib/api";
import type { PackagingType } from "@/lib/types";
import type { DropshipPackageCreateInfo, DropshipPurchaseRequest } from "./dropship-purchase";
import { previewDropshipAmount } from "./dropship-purchase";
import { parseMoney } from "./payment";
import type { OrderSummary } from "./types";
import type {
  OrderShippingAddress,
  PlaceAmountPreview,
  PlaceAvailableLine,
  PlaceDeclareMode,
  PlaceRegistrationType,
} from "./place-order-types";

const USE_STUB =
  process.env.NEXT_PUBLIC_PLACE_LOGISTICS_STUB !== "0" &&
  process.env.NEXT_PUBLIC_PLACE_LOGISTICS_STUB !== "false";

const ADDRESS_KEY = "tangbuy.order.shipping.v1";

type AddressMap = Record<string, OrderShippingAddress>;

function safeReadAddresses(): AddressMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ADDRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as AddressMap) : {};
  } catch {
    return {};
  }
}

function safeWriteAddresses(map: AddressMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADDRESS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function addressStorageKey(shopName: string, outerOrderId: string) {
  return `${shopName}::${outerOrderId}`;
}

export function sumGoodsAmountUsd(order: OrderSummary): number {
  const lines = order.lineItems ?? [];
  if (lines.length === 0) {
    return parseMoney(order.productCost) ?? 0;
  }
  let total = 0;
  for (const line of lines) {
    const unit =
      parseMoney(line.linkedOffer?.procurementPrice) ??
      parseMoney(line.unitCost) ??
      0;
    total += unit * (line.qty || 1);
  }
  if (total <= 0) return parseMoney(order.productCost) ?? 0;
  return Math.round(total * 100) / 100;
}

function stubAddressFromOrder(order: OrderSummary): OrderShippingAddress {
  const code = (order.destinationCountry?.code || "US").toUpperCase();
  const name = order.destinationCountry?.name || code;
  return {
    name: "Recipient",
    phone: "+1 000-000-0000",
    zip: "00000",
    countryCode: code === "—" || !code ? "US" : code,
    countryName: name === "—" ? "United States" : name,
    province: "",
    city: "City",
    address1: "Address pending confirmation",
  };
}

/** GET shipping address for outer order (stub: localStorage + order country). */
export async function getOrderShippingAddress(input: {
  shopName: string;
  outerOrderId: string;
  order: OrderSummary;
}): Promise<OrderShippingAddress> {
  if (!USE_STUB) {
    const q = new URLSearchParams({
      shopName: input.shopName,
      outerOrderId: input.outerOrderId,
    });
    const res = await fetch(`/api/plugin/order/shipping-address?${q}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new ApiError(`shipping-address ${res.status}`, res.status);
    return (await res.json()) as OrderShippingAddress;
  }

  const key = addressStorageKey(input.shopName, input.outerOrderId);
  const cached = safeReadAddresses()[key];
  if (cached) return cached;
  return stubAddressFromOrder(input.order);
}

/** PUT shipping address (stub: localStorage). */
export async function saveOrderShippingAddress(input: {
  shopName: string;
  outerOrderId: string;
  address: OrderShippingAddress;
}): Promise<OrderShippingAddress> {
  if (!USE_STUB) {
    const res = await fetch(`/api/plugin/order/shipping-address`, {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopName: input.shopName,
        outerOrderId: input.outerOrderId,
        ...input.address,
      }),
    });
    if (!res.ok) throw new ApiError(`save shipping-address ${res.status}`, res.status);
    return (await res.json()) as OrderShippingAddress;
  }

  const key = addressStorageKey(input.shopName, input.outerOrderId);
  const map = safeReadAddresses();
  map[key] = input.address;
  safeWriteAddresses(map);
  return input.address;
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function stubLinesForOrder(input: {
  order: OrderSummary;
  packaging: PackagingType;
  countryCode: string;
}): PlaceAvailableLine[] {
  const seed = hashSeed(
    `${input.order.id}|${input.packaging}|${input.countryCode}`
  );
  const country = input.countryCode.toUpperCase();
  const batteryHint = (input.order.lineItems ?? []).some((l) =>
    /battery|电|锂|充电/i.test(`${l.title} ${l.sku}`)
  );

  const taxFreeUs: PlaceAvailableLine = {
    lineId: 152927962808352 + (seed % 97),
    lineName:
      country === "US"
        ? "万邦美国免税专线 - 普货"
        : `Special line · ${country} · general`,
    deliveryTime: "7-10日",
    estimateFeeUsd: Math.round((5.5 + (seed % 40) / 10) * 100) / 100,
    tags: country === "US" ? ["免税"] : ["推荐"],
    restrictionSummary:
      "Accepts general goods. Volumetric weight L×W×H/8000. Remote areas may be restricted.",
    recommended: !batteryHint,
    supported: {
      declareModes: [0, 1],
      registrationTypes: [0],
      minFuzzyTax: 5,
      taxFree: true,
    },
  };

  const batteryLine: PlaceAvailableLine = {
    lineId: 152927962808400 + (seed % 53),
    lineName:
      country === "US"
        ? "美国带电专线"
        : `Battery-capable line · ${country}`,
    deliveryTime: "8-12日",
    estimateFeeUsd: Math.round((8.2 + (seed % 50) / 10) * 100) / 100,
    tags: ["带电"],
    restrictionSummary:
      "Supports battery / electronics. Higher fee. Check destination restrictions.",
    recommended: batteryHint,
    supported: {
      declareModes: [0, 1],
      registrationTypes: [0, 3, 4],
      minFuzzyTax: 8,
      taxFree: false,
    },
  };

  const iossLine: PlaceAvailableLine = {
    lineId: 152927962808500 + (seed % 41),
    lineName: `IOSS line · ${country}`,
    deliveryTime: "6-9日",
    estimateFeeUsd: Math.round((7.1 + (seed % 30) / 10) * 100) / 100,
    tags: ["IOSS"],
    restrictionSummary: "Supports platform / personal IOSS registration.",
    recommended: false,
    supported: {
      declareModes: [0, 1],
      registrationTypes: [3, 4],
      minFuzzyTax: 6,
      taxFree: false,
    },
  };

  // Packaging carton slightly changes recommended fee on stub.
  if (input.packaging === "CARTON") {
    taxFreeUs.estimateFeeUsd =
      Math.round(((taxFreeUs.estimateFeeUsd ?? 0) + 0.8) * 100) / 100;
    batteryLine.estimateFeeUsd =
      Math.round(((batteryLine.estimateFeeUsd ?? 0) + 1.2) * 100) / 100;
  }

  if (batteryHint) {
    // Intersection: only battery-capable lines when mixed/battery goods present.
    return [batteryLine, iossLine].map((l, i) => ({
      ...l,
      recommended: i === 0,
    }));
  }

  return [taxFreeUs, batteryLine, iossLine].map((l, i) => ({
    ...l,
    recommended: i === 0,
  }));
}

export async function fetchAvailableLines(input: {
  shopName: string;
  outerOrderId: string;
  order: OrderSummary;
  packaging: PackagingType;
  countryCode: string;
}): Promise<{ lines: PlaceAvailableLine[]; orderRecalcBanner: boolean }> {
  if (!USE_STUB) {
    const res = await fetch(`/api/plugin/order/available-lines`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shopName: input.shopName,
        outerOrderId: input.outerOrderId,
        packaging: input.packaging,
        countryCode: input.countryCode,
      }),
    });
    if (!res.ok) throw new ApiError(`available-lines ${res.status}`, res.status);
    const data = (await res.json()) as {
      lines?: PlaceAvailableLine[];
      orderRecalcBanner?: boolean;
    };
    return {
      lines: data.lines ?? [],
      orderRecalcBanner: Boolean(data.orderRecalcBanner),
    };
  }

  await new Promise((r) => setTimeout(r, 280));
  const lines = stubLinesForOrder(input);
  // Banner when order has multiple lines (SKU quotes would diverge).
  const orderRecalcBanner = (input.order.lineItems?.length ?? 0) > 1;
  return { lines, orderRecalcBanner };
}

function stubPreview(input: {
  order: OrderSummary;
  packageCreateInfo: DropshipPackageCreateInfo;
}): PlaceAmountPreview {
  const goods = sumGoodsAmountUsd(input.order);
  const seed = hashSeed(String(input.packageCreateInfo.lineId));
  const base = 4 + (seed % 80) / 10;
  const increments = input.packageCreateInfo.packageChoosedContent?.incrementList ?? [];
  const cartonBump = increments.includes("11") ? 1.1 : 0;
  const packageAmountUsd = Math.round((base + cartonBump) * 100) / 100;
  return {
    goodsAmountUsd: goods,
    packageAmountUsd,
    totalUsd: Math.round((goods + packageAmountUsd) * 100) / 100,
    currency: "USD",
  };
}

/** Whole-package freight preview (never sum of per-SKU quotes). */
export async function previewPlaceAmount(input: {
  shopName: string;
  outerOrderId: string;
  order: OrderSummary;
  orderId?: number;
  packageCreateInfo: DropshipPackageCreateInfo;
}): Promise<PlaceAmountPreview> {
  const body: DropshipPurchaseRequest = {
    shopName: input.shopName,
    outerOrderId: input.outerOrderId,
    orderId: input.orderId,
    orderType: 1,
    packageCreateInfo: input.packageCreateInfo,
  };

  if (!USE_STUB) {
    try {
      const res = await previewDropshipAmount(body);
      const goods =
        res.goodsAmountCny != null
          ? Math.round((Number(res.goodsAmountCny) / 6.43) * 100) / 100
          : sumGoodsAmountUsd(input.order);
      const pkg =
        res.packageAmountCny != null
          ? Math.round((Number(res.packageAmountCny) / 6.43) * 100) / 100
          : 0;
      const total =
        res.totalCny != null
          ? Math.round((Number(res.totalCny) / 6.43) * 100) / 100
          : Math.round((goods + pkg) * 100) / 100;
      return {
        goodsAmountUsd: goods,
        packageAmountUsd: pkg,
        totalUsd: total,
        currency: "USD",
      };
    } catch {
      /* fall through to stub if BFF missing */
    }
  }

  await new Promise((r) => setTimeout(r, 200));
  return stubPreview(input);
}

export function clampDeclareToLine(input: {
  preferredMode: PlaceDeclareMode;
  preferredRegistration: PlaceRegistrationType;
  preferredTax: number;
  preferredTaxNo: string;
  line: PlaceAvailableLine;
  goodsAmountUsd: number;
}): {
  declareMode: PlaceDeclareMode;
  registrationType: PlaceRegistrationType;
  tax: number;
  taxNo: string;
  clamped: boolean;
} {
  const modes = input.line.supported.declareModes;
  const regs = input.line.supported.registrationTypes;
  let clamped = false;
  let declareMode = input.preferredMode;
  if (!modes.includes(declareMode)) {
    declareMode = modes[0] ?? 0;
    clamped = true;
  }
  let registrationType = input.preferredRegistration;
  if (!regs.includes(registrationType)) {
    registrationType = regs[0] ?? 0;
    clamped = true;
  }
  let tax = input.preferredTax;
  if (declareMode === 1) {
    tax = Math.max(0, input.goodsAmountUsd);
  } else {
    const min = input.line.supported.minFuzzyTax ?? 0;
    if (tax < min) {
      tax = min;
      clamped = true;
    }
  }
  const taxNo =
    registrationType === 4 ? input.preferredTaxNo.trim() : "";
  return { declareMode, registrationType, tax, taxNo, clamped };
}
